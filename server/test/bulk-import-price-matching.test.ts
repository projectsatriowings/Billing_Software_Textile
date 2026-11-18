import assert from 'node:assert/strict';
import http from 'node:http';
import test, { after, before } from 'node:test';
import { createApp } from '../src/app.ts';
import { connectDb, type DB } from '../src/db/index.ts';
import { signToken, hashPassword, passwordStamp, newId } from '../src/security.ts';
import {
  compareProductPrices,
  matchProductToCatalog,
  type MatchCandidate,
} from '../../shared/bulkImport.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-long-enough-32-chars-at-least';
const TEST_TENANT = 't_price_match_' + Date.now();
const BRANCH_MAIN = 'b_main_price_' + Date.now();

let db: DB;
let server: http.Server;
let base = '';
let ownerToken = '';
let supplierId = '';
let categoryId = '';
let existingMaggiId = '';
const EXISTING_MAGGI_BARCODE = '2000000000151';
const EXISTING_MAGGI_SKU = 'M2MMN-70';

async function api(method: string, path: string, headers: Record<string, string> = {}, body?: any, token?: string) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json };
}

before(async () => {
  try {
    db = await connectDb();
    server = http.createServer(createApp(db, { secret: JWT_SECRET, log: false }));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;

    // Setup Tenant and Branch
    await db.exec(`INSERT INTO tenants (id, name, business_type) VALUES (?, 'Price Match Retail Store', 'retail')`, [TEST_TENANT]);
    await db.exec(`INSERT INTO branches (id, tenant_id, name, code, active) VALUES (?, ?, 'Main Store', 'MAIN', true)`, [BRANCH_MAIN, TEST_TENANT]);

    // Setup Owner
    const pwd = hashPassword('TestPass123!');
    const ownerId = 'u_owner_pm_' + Date.now();
    await db.exec(
      `INSERT INTO users (id, tenant_id, branch_id, name, email, password_hash, role, active)
       VALUES (?, ?, NULL, 'Store Owner', ?, ?, 'owner', true)`,
      [ownerId, TEST_TENANT, `owner_${Date.now()}@pricematch.local`, pwd]
    );
    ownerToken = signToken({ sub: ownerId, tid: TEST_TENANT, ph: passwordStamp(pwd), role: 'owner' }, JWT_SECRET, 3600);

    // Setup Category
    categoryId = newId('cat');
    await db.exec(
      `INSERT INTO categories (id, tenant_id, branch_id, name, active) VALUES (?, ?, ?, 'Processed Foods', true)`,
      [categoryId, TEST_TENANT, BRANCH_MAIN]
    );

    // Setup Supplier
    supplierId = newId('party');
    await db.exec(
      `INSERT INTO parties (id, tenant_id, branch_id, type, name, phone, gstin, active)
       VALUES (?, ?, ?, 'supplier', 'Nestle Distributor', '9876543210', '33AABBC1122D1Z0', true)`,
      [supplierId, TEST_TENANT, BRANCH_MAIN]
    );

    // Setup initial existing product: Maggi 2-Minute Masala Noodles 70g
    // Selling Price: ₹14 (1400 paise), Cost Price: ₹11 (1100 paise), Stock: 27 units
    existingMaggiId = newId('i');
    await db.exec(
      `INSERT INTO items (
        id, tenant_id, branch_id, name, sku, barcode, barcode_type, category,
        price_minor, cost_minor, tax_rate_bp, tax_inclusive, track_stock, active
      ) VALUES (
        ?, ?, ?, 'Maggi 2-Minute Masala Noodles 70g', ?, ?, 'INTERNAL', 'Processed Foods',
        1400, 1100, 500, true, true, true
      )`,
      [existingMaggiId, TEST_TENANT, BRANCH_MAIN, EXISTING_MAGGI_SKU, EXISTING_MAGGI_BARCODE]
    );

    await db.exec(
      `INSERT INTO product_barcodes (id, tenant_id, branch_id, product_id, barcode, barcode_type)
       VALUES (?, ?, ?, ?, ?, 'INTERNAL')`,
      [newId('bc'), TEST_TENANT, BRANCH_MAIN, existingMaggiId, EXISTING_MAGGI_BARCODE]
    );

    // Record 27 units initial stock
    await db.exec(
      `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, location, qty_milli, kind, reason)
       VALUES (?, ?, ?, ?, 'MAIN', 27000, 'opening', 'Initial store stock')`,
      [newId('sm'), TEST_TENANT, BRANCH_MAIN, existingMaggiId]
    );
  } catch (err) {
    console.error('BEFORE HOOK ERROR:', err);
    throw err;
  }
});

after(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (db) {
    try {
      await db.exec(`DELETE FROM purchase_lines WHERE tenant_id = ?`, [TEST_TENANT]);
      await db.exec(`DELETE FROM purchases WHERE tenant_id = ?`, [TEST_TENANT]);
      await db.exec(`DELETE FROM stock_moves WHERE tenant_id = ?`, [TEST_TENANT]);
      await db.exec(`DELETE FROM product_barcodes WHERE tenant_id = ?`, [TEST_TENANT]);
      await db.exec(`DELETE FROM items WHERE tenant_id = ?`, [TEST_TENANT]);
      await db.exec(`DELETE FROM imports WHERE tenant_id = ?`, [TEST_TENANT]);
      await db.exec(`DELETE FROM parties WHERE tenant_id = ?`, [TEST_TENANT]);
      await db.exec(`DELETE FROM categories WHERE tenant_id = ?`, [TEST_TENANT]);
      await db.exec(`DELETE FROM users WHERE tenant_id = ?`, [TEST_TENANT]);
      await db.exec(`DELETE FROM branches WHERE tenant_id = ?`, [TEST_TENANT]);
      await db.exec(`DELETE FROM tenants WHERE id = ?`, [TEST_TENANT]);
    } catch {}
  }
});

// ── Test Cases 1 through 9 ───────────────────────────────────────────────────

test('1. Same product, same SP and CP -> Restock recommended (Scenario B)', () => {
  const catalogCandidate: MatchCandidate = {
    id: existingMaggiId,
    name: 'Maggi 2-Minute Masala Noodles 70g',
    sku: EXISTING_MAGGI_SKU,
    barcode: EXISTING_MAGGI_BARCODE,
    barcodeType: 'INTERNAL',
    category: 'Processed Foods',
    unit: 'pcs',
    priceMinor: 1400, // ₹14.00
    costMinor: 1100,  // ₹11.00
    currentStockMilli: 27000,
    taxRateBp: 500,
    taxInclusive: true,
    hsn: '190230',
  };

  const comp = compareProductPrices('14', '11', catalogCandidate);
  assert.ok(comp);
  assert.equal(comp.hasPriceDiff, false);
  assert.equal(comp.sellingDiffers, false);
  assert.equal(comp.costDiffers, false);
  assert.equal(comp.recommendedAction, 'RESTOCK');

  const match = matchProductToCatalog('Maggi 2-Minute Masala Noodles 70g', 'pcs', [catalogCandidate], {
    sellingPrice: '14',
    costPrice: '11',
  });
  assert.equal(match.classification, 'RESTOCK');
  assert.equal(match.recommendedResolution, 'LINK');
});

test('2. Same product, different SP -> Create New Product recommended (Scenario A)', () => {
  const catalogCandidate: MatchCandidate = {
    id: existingMaggiId,
    name: 'Maggi 2-Minute Masala Noodles 70g',
    sku: EXISTING_MAGGI_SKU,
    barcode: EXISTING_MAGGI_BARCODE,
    barcodeType: 'INTERNAL',
    category: 'Processed Foods',
    unit: 'pcs',
    priceMinor: 1400, // ₹14.00
    costMinor: 1100,  // ₹11.00
    currentStockMilli: 27000,
    taxRateBp: 500,
    taxInclusive: true,
    hsn: '190230',
  };

  // Incoming SP: 19, CP: 11
  const comp = compareProductPrices('19', '11', catalogCandidate);
  assert.ok(comp);
  assert.equal(comp.hasPriceDiff, true);
  assert.equal(comp.sellingDiffers, true);
  assert.equal(comp.costDiffers, false);
  assert.equal(comp.recommendedAction, 'NEW_PRODUCT');
  assert.match(comp.reason, /Selling price differs/i);

  const match = matchProductToCatalog('Maggi 2-Minute Masala Noodles 70g', 'pcs', [catalogCandidate], {
    sellingPrice: '19',
    costPrice: '11',
  });
  assert.equal(match.classification, 'RESTOCK');
  assert.equal(match.recommendedResolution, 'NEW');
});

test('3. Same product, different CP -> Create New Product recommended', () => {
  const catalogCandidate: MatchCandidate = {
    id: existingMaggiId,
    name: 'Maggi 2-Minute Masala Noodles 70g',
    sku: EXISTING_MAGGI_SKU,
    barcode: EXISTING_MAGGI_BARCODE,
    barcodeType: 'INTERNAL',
    category: 'Processed Foods',
    unit: 'pcs',
    priceMinor: 1400, // ₹14.00
    costMinor: 1100,  // ₹11.00
    currentStockMilli: 27000,
    taxRateBp: 500,
    taxInclusive: true,
    hsn: '190230',
  };

  // Incoming SP: 14, CP: 15
  const comp = compareProductPrices('14', '15', catalogCandidate);
  assert.ok(comp);
  assert.equal(comp.hasPriceDiff, true);
  assert.equal(comp.sellingDiffers, false);
  assert.equal(comp.costDiffers, true);
  assert.equal(comp.recommendedAction, 'NEW_PRODUCT');
  assert.match(comp.reason, /Cost price differs/i);
});

test('4. Same product, both prices different -> Create New Product recommended', () => {
  const catalogCandidate: MatchCandidate = {
    id: existingMaggiId,
    name: 'Maggi 2-Minute Masala Noodles 70g',
    sku: EXISTING_MAGGI_SKU,
    barcode: EXISTING_MAGGI_BARCODE,
    barcodeType: 'INTERNAL',
    category: 'Processed Foods',
    unit: 'pcs',
    priceMinor: 1400, // ₹14.00
    costMinor: 1100,  // ₹11.00
    currentStockMilli: 27000,
    taxRateBp: 500,
    taxInclusive: true,
    hsn: '190230',
  };

  // Incoming SP: 19, CP: 15
  const comp = compareProductPrices('19', '15', catalogCandidate);
  assert.ok(comp);
  assert.equal(comp.hasPriceDiff, true);
  assert.equal(comp.sellingDiffers, true);
  assert.equal(comp.costDiffers, true);
  assert.equal(comp.recommendedAction, 'NEW_PRODUCT');
  assert.match(comp.reason, /Both selling and cost prices differ/i);

  // Missing price safe check
  const missingComp = compareProductPrices('', '15', catalogCandidate);
  assert.ok(missingComp);
  assert.equal(missingComp.missingPrice, true);
  assert.equal(missingComp.recommendedAction, 'NEW_PRODUCT');
  assert.notEqual(missingComp.incomingSellingPrice, 0, 'Does not treat missing price as 0');
});

test('5. User manually selects Restock despite different prices -> Existing product restocked with price updates', async () => {
  const res = await api(
    'POST',
    '/api/items/bulk-import',
    {},
    {
      supplierId,
      branchId: BRANCH_MAIN,
      rows: [
        {
          name: 'Maggi 2-Minute Masala Noodles 70g',
          sku: EXISTING_MAGGI_SKU,
          barcode: EXISTING_MAGGI_BARCODE,
          unit: 'pcs',
          priceMinor: 1900, // Updated SP: ₹19
          costMinor: 1500,  // Updated CP: ₹15
          taxRateBp: 500,
          taxInclusive: true,
          openingQtyMilli: 30000, // +30 pcs
          isRestock: true,
          matchedItemId: existingMaggiId,
          updatePrices: true,
        },
      ],
    },
    ownerToken
  );
  if (res.status !== 200) console.error('TEST 5 FAILED STATUS:', res.status, res.body);

  assert.equal(res.status, 200);
  assert.equal(res.body.restocked, 1);
  assert.equal(res.body.created, 0);

  // Verify database record for existing product
  const item = await db.one<{ priceMinor: number; costMinor: number; barcode: string; sku: string }>(
    `SELECT price_minor, cost_minor, barcode, sku FROM items WHERE id = ?`,
    [existingMaggiId]
  );
  assert.equal(item?.priceMinor, 1900, 'Selling price updated to ₹19.00');
  assert.equal(item?.costMinor, 1500, 'Cost price updated to ₹15.00');
  assert.equal(item?.barcode, EXISTING_MAGGI_BARCODE, 'Barcode remains unchanged');
  assert.equal(item?.sku, EXISTING_MAGGI_SKU, 'SKU remains unchanged');

  // Verify stock was incremented by 30 units: 27 + 30 = 57
  const moves = await db.query<{ qtyMilli: number }>(
    `SELECT qty_milli FROM stock_moves WHERE item_id = ?`,
    [existingMaggiId]
  );
  const totalStockMilli = moves.reduce((sum, m) => sum + Number(m.qtyMilli), 0);
  assert.equal(totalStockMilli, 57000, 'Total stock is 57 units (27 initial + 30 restocked)');
});

let newProductId = '';
const NEW_PRODUCT_SKU = 'M2MMN-70-2';
const NEW_PRODUCT_IBC = '2000000000168';

test('6. User selects Create New Product -> Separate product created with new SKU and IBC', async () => {
  const res = await api(
    'POST',
    '/api/items/bulk-import',
    {},
    {
      supplierId,
      branchId: BRANCH_MAIN,
      rows: [
        {
          name: 'Maggi 2-Minute Masala Noodles 70g',
          sku: NEW_PRODUCT_SKU,
          barcode: NEW_PRODUCT_IBC,
          barcodeType: 'INTERNAL',
          unit: 'pcs',
          categoryId,
          category: 'Processed Foods',
          priceMinor: 1900,
          costMinor: 1500,
          taxRateBp: 500,
          taxInclusive: true,
          openingQtyMilli: 30000, // 30 pcs for new product
          isRestock: false,
          matchedItemId: null, // NOT linked to existing product
          updatePrices: false,
        },
      ],
    },
    ownerToken
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.created, 1);
  assert.equal(res.body.restocked, 0);

  newProductId = res.body.results[0]?.itemId;
  assert.ok(newProductId);
  assert.notEqual(newProductId, existingMaggiId, 'New product has completely separate ID');

  const newItem = await db.one<{ id: string; name: string; sku: string; barcode: string; barcodeType: string }>(
    `SELECT id, name, sku, barcode, barcode_type FROM items WHERE id = ?`,
    [newProductId]
  );
  assert.equal(newItem?.sku, NEW_PRODUCT_SKU, 'New product created with distinct unique SKU');
  assert.equal(newItem?.barcode, NEW_PRODUCT_IBC, 'New product created with distinct Internal Barcode (IBC)');
  assert.equal(newItem?.barcodeType, 'INTERNAL');
});

test('7. Existing product barcode remains unchanged', async () => {
  const existingItem = await db.one<{ barcode: string; sku: string }>(
    `SELECT barcode, sku FROM items WHERE id = ?`,
    [existingMaggiId]
  );
  assert.equal(existingItem?.barcode, EXISTING_MAGGI_BARCODE, 'Existing product barcode is still 2000000000151');
  assert.equal(existingItem?.sku, EXISTING_MAGGI_SKU, 'Existing product SKU is still M2MMN-70');
});

test('8. New product and existing product can be scanned and identified independently', async () => {
  // Query by existing product barcode
  const scanExisting = await api('GET', `/api/items?barcode=${EXISTING_MAGGI_BARCODE}`, {}, undefined, ownerToken);
  assert.equal(scanExisting.status, 200);
  const existingMatches = scanExisting.body?.items || scanExisting.body || [];
  const foundExisting = Array.isArray(existingMatches) ? existingMatches.find((i: any) => i.id === existingMaggiId) : existingMatches;
  assert.ok(foundExisting, 'Existing item scanned by its barcode');
  assert.equal(foundExisting.id, existingMaggiId);

  // Query by new product barcode
  const scanNew = await api('GET', `/api/items?barcode=${NEW_PRODUCT_IBC}`, {}, undefined, ownerToken);
  assert.equal(scanNew.status, 200);
  const newMatches = scanNew.body?.items || scanNew.body || [];
  const foundNew = Array.isArray(newMatches) ? newMatches.find((i: any) => i.id === newProductId) : newMatches;
  assert.ok(foundNew, 'New product scanned independently by its new barcode');
  assert.equal(foundNew.id, newProductId);
});

test('9. No duplicate stock added to existing product when Create New Product is selected', async () => {
  // Verify existing product stock did not change when the new product was created
  const movesExisting = await db.query<{ qtyMilli: number }>(
    `SELECT qty_milli FROM stock_moves WHERE item_id = ?`,
    [existingMaggiId]
  );
  const totalExistingStockMilli = movesExisting.reduce((sum, m) => sum + Number(m.qtyMilli), 0);
  assert.equal(totalExistingStockMilli, 57000, 'Existing product stock remains 57 units (no leakage from new product creation)');

  // Verify new product has its own isolated 30 units stock
  const movesNew = await db.query<{ qtyMilli: number }>(
    `SELECT qty_milli FROM stock_moves WHERE item_id = ?`,
    [newProductId]
  );
  const totalNewStockMilli = movesNew.reduce((sum, m) => sum + Number(m.qtyMilli), 0);
  assert.equal(totalNewStockMilli, 30000, 'New product has exactly its own 30 units stock');
});
