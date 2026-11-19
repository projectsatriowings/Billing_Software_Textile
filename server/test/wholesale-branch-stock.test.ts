import assert from 'node:assert/strict';
import http from 'node:http';
import test, { after, before } from 'node:test';
import { createApp } from '../src/app.ts';
import { connectDb, migrate, type DB } from '../src/db/index.ts';
import { signToken, hashPassword, passwordStamp } from '../src/security.ts';
import { formatStockUnit } from '../../client/src/components/wholesale/WholesaleBillingView.tsx';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-long-enough-32-chars-at-least';
const TEST_TENANT = 't_stock_test_' + Date.now();
const BRANCH_A_ID = 'b_stock_a_' + Date.now();
const BRANCH_B_ID = 'b_stock_b_' + Date.now();

let db: DB;
let server: http.Server;
let base = '';
let ownerToken = '';
let ownerId = '';
let managerToken = '';
let managerId = '';

let itemIdAtta = '';
let itemIdMilk = '';
let itemIdColgate = '';
let itemIdDettol = '';

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
  try { json = JSON.parse(text); } catch { }
  return { status: res.status, body: json, text, headers: Object.fromEntries(res.headers.entries()) };
}

before(async () => {
  db = await connectDb();
  await migrate(db);
  server = http.createServer(createApp(db, { secret: JWT_SECRET, log: false }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;

  // 1. Setup Tenant and 2 Branches
  await db.exec(
    `INSERT INTO tenants (id, name, business_type, state_code, gstin, address, phone)
     VALUES (?, 'Super Grocery Wholesale', 'retail', '24', '24ACAFS6901Q1ZT', 'Surat Textile Market', '9879448228')`,
    [TEST_TENANT]
  );
  await db.exec(
    `INSERT INTO branches (id, tenant_id, name, code, active) VALUES (?, ?, 'Surat Central', 'SURAT', true)`,
    [BRANCH_A_ID, TEST_TENANT]
  );
  await db.exec(
    `INSERT INTO branches (id, tenant_id, name, code, active) VALUES (?, ?, 'Ahmedabad Hub', 'AHMD', true)`,
    [BRANCH_B_ID, TEST_TENANT]
  );

  // 2. Setup Super Admin (Owner)
  const pwd = hashPassword('OwnerPass123!');
  ownerId = 'u_stock_owner_' + Date.now();
  await db.exec(
    `INSERT INTO users (id, tenant_id, branch_id, name, email, password_hash, role, active)
     VALUES (?, ?, ?, 'Super Admin', ?, ?, 'owner', true)`,
    [ownerId, TEST_TENANT, BRANCH_A_ID, `owner_stock_${Date.now()}@test.local`, pwd]
  );
  ownerToken = signToken({ sub: ownerId, tid: TEST_TENANT, ph: passwordStamp(pwd), role: 'owner', branchId: BRANCH_A_ID }, JWT_SECRET, 3600);

  // 3. Setup Store Manager strictly assigned to Branch A
  const mgrPwd = hashPassword('ManagerPass123!');
  managerId = 'u_stock_mgr_' + Date.now();
  await db.exec(
    `INSERT INTO users (id, tenant_id, branch_id, name, email, password_hash, role, active)
     VALUES (?, ?, ?, 'Branch A Manager', ?, ?, 'manager', true)`,
    [managerId, TEST_TENANT, BRANCH_A_ID, `mgr_stock_${Date.now()}@test.local`, mgrPwd]
  );
  managerToken = signToken({ sub: managerId, tid: TEST_TENANT, ph: passwordStamp(mgrPwd), role: 'manager', branchId: BRANCH_A_ID }, JWT_SECRET, 3600);

  // 4. Create 4 Products matching user requirements
  // Product 1: Aashirvaad Superior MP Sharbati Atta 5kg (unit: bag)
  itemIdAtta = 'i_atta_' + Date.now();
  await db.exec(
    `INSERT INTO items (id, tenant_id, branch_id, name, sku, unit, price_minor, wholesale_price_minor, track_stock, active)
     VALUES (?, ?, ?, 'Aashirvaad Superior MP Sharbati Atta 5kg', 'ATTA-AAS-5K', 'bag', 27500, 26000, true, true)`,
    [itemIdAtta, TEST_TENANT, BRANCH_A_ID]
  );

  // Product 2: Amul Taaza Homogenised Toned Milk 1L (unit: pouch)
  itemIdMilk = 'i_milk_' + Date.now();
  await db.exec(
    `INSERT INTO items (id, tenant_id, branch_id, name, sku, unit, price_minor, wholesale_price_minor, track_stock, active)
     VALUES (?, ?, ?, 'Amul Taaza Homogenised Toned Milk 1L', 'MLK-AMU-1L', 'pouch', 5400, 5000, true, true)`,
    [itemIdMilk, TEST_TENANT, BRANCH_A_ID]
  );

  // Product 3: Colgate Strong Teeth Dental Cream 200g (unit: pcs)
  itemIdColgate = 'i_colgate_' + Date.now();
  await db.exec(
    `INSERT INTO items (id, tenant_id, branch_id, name, sku, unit, price_minor, wholesale_price_minor, track_stock, active)
     VALUES (?, ?, ?, 'Colgate Strong Teeth Dental Cream 200g', 'DEN-COL-200', 'pcs', 11500, 10500, true, true)`,
    [itemIdColgate, TEST_TENANT, BRANCH_A_ID]
  );

  // Product 4: Dettol Original Germ Protection Bathing Soap 125g (unit: pcs, 0 stock in Branch A)
  itemIdDettol = 'i_dettol_' + Date.now();
  await db.exec(
    `INSERT INTO items (id, tenant_id, branch_id, name, sku, unit, price_minor, wholesale_price_minor, track_stock, active)
     VALUES (?, ?, ?, 'Dettol Original Germ Protection Bathing Soap 125g', 'SOP-DET-125', 'pcs', 6800, 6200, true, true)`,
    [itemIdDettol, TEST_TENANT, BRANCH_A_ID]
  );

  // Add 11 more products to Branch A (bringing total to 15 products for Branch A)
  for (let i = 5; i <= 15; i++) {
    const id = `i_item_extra_${i}_${Date.now()}`;
    await db.exec(
      `INSERT INTO items (id, tenant_id, branch_id, name, sku, unit, price_minor, wholesale_price_minor, track_stock, active)
       VALUES (?, ?, ?, ?, ?, 'pcs', 10000, 9000, true, true)`,
      [id, TEST_TENANT, BRANCH_A_ID, `Product Line Item ${i}`, `SKU-PROD-${i}`]
    );
  }

  // Add 2 products belonging exclusively to Branch B
  for (let j = 1; j <= 2; j++) {
    const id = `i_item_branchb_${j}_${Date.now()}`;
    await db.exec(
      `INSERT INTO items (id, tenant_id, branch_id, name, sku, unit, price_minor, wholesale_price_minor, track_stock, active)
       VALUES (?, ?, ?, ?, ?, 'pcs', 15000, 13000, true, true)`,
      [id, TEST_TENANT, BRANCH_B_ID, `Branch B Exclusive Product ${j}`, `SKU-BRB-${j}`]
    );
  }

  // 5. Seed stock_moves for Branch A:
  // - Atta: 125 Bags (125,000 milli)
  // - Milk: 48 Pouches (48,000 milli)
  // - Colgate: 32 Pcs (32,000 milli)
  // - Dettol: 0 Pcs (no stock move)
  await db.exec(
    `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, location, qty_milli, kind, reason)
     VALUES 
     ('sm_a_1', ?, ?, ?, 'SURAT', 125000, 'opening', 'Initial Stock'),
     ('sm_a_2', ?, ?, ?, 'SURAT', 48000, 'opening', 'Initial Stock'),
     ('sm_a_3', ?, ?, ?, 'SURAT', 32000, 'opening', 'Initial Stock')`,
    [TEST_TENANT, BRANCH_A_ID, itemIdAtta, TEST_TENANT, BRANCH_A_ID, itemIdMilk, TEST_TENANT, BRANCH_A_ID, itemIdColgate]
  );

  // Seed stock_moves for Branch B:
  // - Atta: 20 Bags (20,000 milli)
  // - Dettol: 50 Pcs (50,000 milli)
  await db.exec(
    `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, location, qty_milli, kind, reason)
     VALUES 
     ('sm_b_1', ?, ?, ?, 'AHMD', 20000, 'opening', 'Initial Stock'),
     ('sm_b_2', ?, ?, ?, 'AHMD', 50000, 'opening', 'Initial Stock')`,
    [TEST_TENANT, BRANCH_B_ID, itemIdAtta, TEST_TENANT, BRANCH_B_ID, itemIdDettol]
  );
});

after(async () => {
  try {
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((r) => server.close(() => r()));
    }
    if (db) {
      await db.exec('DELETE FROM stock_moves WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM items WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM users WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM branches WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM tenants WHERE id = ?', [TEST_TENANT]);
      await db.close();
    }
  } catch { }
  process.exit(0);
});

test('1. formatStockUnit correctly formats UOM with correct capitalization and plurals', () => {
  // Matches exact user examples:
  assert.equal(formatStockUnit(125, 'bag'), 'Bags');
  assert.equal(formatStockUnit(48, 'pouch'), 'Pouches');
  assert.equal(formatStockUnit(32, 'pcs'), 'Pcs');
  assert.equal(formatStockUnit(0, 'pcs'), 'Pcs');

  // Single unit tests:
  assert.equal(formatStockUnit(1, 'bag'), 'Bag');
  assert.equal(formatStockUnit(1, 'pouch'), 'Pouch');
  assert.equal(formatStockUnit(1, 'pcs'), 'Pc');

  // Other textile and grocery units:
  assert.equal(formatStockUnit(10, 'kg'), 'Kg');
  assert.equal(formatStockUnit(1, 'kg'), 'Kg');
  assert.equal(formatStockUnit(5, 'ltr'), 'Ltr');
  assert.equal(formatStockUnit(1, 'ltr'), 'Ltr');
  assert.equal(formatStockUnit(20, 'box'), 'Boxes');
  assert.equal(formatStockUnit(1, 'box'), 'Box');
  assert.equal(formatStockUnit(50, 'pack'), 'Packs');
  assert.equal(formatStockUnit(1, 'pack'), 'Pack');
  assert.equal(formatStockUnit(10, 'mtr'), 'Mtr');
  assert.equal(formatStockUnit(0, null), 'Pcs');
});

test('2. Branch stock API returns exact available stock for Branch A (does not display combined stock)', async () => {
  const res = await api('GET', `/api/inventory/branch-stock?branchId=${BRANCH_A_ID}`, {}, undefined, ownerToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.branchId, BRANCH_A_ID);

  const stock = res.body.stock;
  // Branch A stock:
  // ₹275.00 | Stock: 125 Bags
  // ₹54.00 | Stock: 48 Pouches
  // ₹115.00 | Stock: 32 Pcs
  // ₹68.00 | Stock: 0 Pcs
  assert.equal(stock[itemIdAtta], 125);
  assert.equal(stock[itemIdMilk], 48);
  assert.equal(stock[itemIdColgate], 32);
  assert.equal(stock[itemIdDettol] || 0, 0);

  // Must NOT be combined with Branch B (Atta total across branches is 125 + 20 = 145, but Branch A must be 125)
  assert.notEqual(stock[itemIdAtta], 145);
});

test('3. When Super Admin switches to Branch B, product stock updates automatically', async () => {
  const res = await api('GET', `/api/inventory/branch-stock?branchId=${BRANCH_B_ID}`, {}, undefined, ownerToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.branchId, BRANCH_B_ID);

  const stock = res.body.stock;
  // Branch B stock:
  assert.equal(stock[itemIdAtta], 20);
  assert.equal(stock[itemIdDettol], 50);
  assert.equal(stock[itemIdMilk] || 0, 0);
  assert.equal(stock[itemIdColgate] || 0, 0);
});

test('4. Store Managers must only see stock belonging to their assigned branch', async () => {
  // Store Manager calls without param -> strictly assigned Branch A
  const resA = await api('GET', '/api/inventory/branch-stock', {}, undefined, managerToken);
  assert.equal(resA.status, 200);
  assert.equal(resA.body.branchId, BRANCH_A_ID);
  assert.equal(resA.body.stock[itemIdAtta], 125);
  assert.equal(resA.body.stock[itemIdDettol] || 0, 0);

  // Store Manager attempts to query Branch B -> security restriction enforces Branch A only
  const resB = await api('GET', `/api/inventory/branch-stock?branchId=${BRANCH_B_ID}`, {}, undefined, managerToken);
  assert.equal(resB.status, 200);
  assert.equal(resB.body.branchId, BRANCH_A_ID); // Enforced to Branch A
  assert.equal(resB.body.stock[itemIdAtta], 125); // Still Branch A, not 20
});

test('5. Stock updates live after sales, purchases, transfers, and inventory adjustments', async () => {
  // 1. Sale in Branch A: -10 Bags of Atta
  await db.exec(
    `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, location, qty_milli, kind, reason)
     VALUES ('sm_sale_1', ?, ?, ?, 'SURAT', -10000, 'sale', 'POS Wholesale Sale')`,
    [TEST_TENANT, BRANCH_A_ID, itemIdAtta]
  );

  let res = await api('GET', `/api/inventory/branch-stock?branchId=${BRANCH_A_ID}`, {}, undefined, ownerToken);
  assert.equal(res.body.stock[itemIdAtta], 115); // 125 - 10 = 115

  // 2. Purchase in Branch A: +20 Pouches of Milk
  await db.exec(
    `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, location, qty_milli, kind, reason)
     VALUES ('sm_purch_1', ?, ?, ?, 'SURAT', 20000, 'purchase', 'Supplier Restock')`,
    [TEST_TENANT, BRANCH_A_ID, itemIdMilk]
  );

  res = await api('GET', `/api/inventory/branch-stock?branchId=${BRANCH_A_ID}`, {}, undefined, ownerToken);
  assert.equal(res.body.stock[itemIdMilk], 68); // 48 + 20 = 68

  // 3. Stock Transfer: 5 Bags from Branch A to Branch B
  await db.exec(
    `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, location, qty_milli, kind, reason)
     VALUES 
     ('sm_trf_out_1', ?, ?, ?, 'SURAT', -5000, 'transfer', 'Transfer out to AHMD'),
     ('sm_trf_in_1', ?, ?, ?, 'AHMD', 5000, 'transfer', 'Transfer in from SURAT')`,
    [TEST_TENANT, BRANCH_A_ID, itemIdAtta, TEST_TENANT, BRANCH_B_ID, itemIdAtta]
  );

  const resBranchA = await api('GET', `/api/inventory/branch-stock?branchId=${BRANCH_A_ID}`, {}, undefined, ownerToken);
  assert.equal(resBranchA.body.stock[itemIdAtta], 110); // 115 - 5 = 110

  const resBranchB = await api('GET', `/api/inventory/branch-stock?branchId=${BRANCH_B_ID}`, {}, undefined, ownerToken);
  assert.equal(resBranchB.body.stock[itemIdAtta], 25); // 20 + 5 = 25

  // 4. Inventory Adjustment in Branch A: Dettol soap adjusted by +15 Pcs
  await db.exec(
    `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, location, qty_milli, kind, reason)
     VALUES ('sm_adj_1', ?, ?, ?, 'SURAT', 15000, 'adjust', 'Physical Count Correction')`,
    [TEST_TENANT, BRANCH_A_ID, itemIdDettol]
  );

  res = await api('GET', `/api/inventory/branch-stock?branchId=${BRANCH_A_ID}`, {}, undefined, ownerToken);
  assert.equal(res.body.stock[itemIdDettol], 15); // was 0, now 15
});

test('6. Product listing fetches all 15 products for Branch A, including zero stock products, and excludes other branches', async () => {
  const res = await api('GET', `/api/items?includeInactive=0&branchId=${BRANCH_A_ID}&limit=500`, {}, undefined, ownerToken);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));

  // Branch A contains exactly 15 products
  assert.equal(res.body.items.length, 15, `Expected 15 products for Branch A, got ${res.body.items.length}`);

  // Products with zero stock (e.g. Dettol was adjusted, other products have 0 stock) are included
  const zeroStockItems = res.body.items.filter((it: any) => (it.currentStockMilli || 0) === 0);
  assert.ok(zeroStockItems.length > 0, 'Zero stock items must be included in the catalogue');

  // Verify none of Branch B exclusive products appear in Branch A's catalogue
  const hasBranchBExclusive = res.body.items.some((it: any) => it.name.includes('Branch B Exclusive Product'));
  assert.equal(hasBranchBExclusive, false, 'Branch B exclusive products must NOT appear in Branch A catalogue');
});

test('7. When switching to Branch B, catalogue dynamically refreshes to Branch B products only', async () => {
  const res = await api('GET', `/api/items?includeInactive=0&branchId=${BRANCH_B_ID}&limit=500`, {}, undefined, ownerToken);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.items));

  // Branch B exclusive products appear
  const branchBItems = res.body.items.filter((it: any) => it.name.includes('Branch B Exclusive Product'));
  assert.equal(branchBItems.length, 2, 'Branch B exclusive products must be listed for Branch B');

  // Branch A exclusive products (e.g. Product Line Item 5..15) do NOT appear in Branch B
  const hasBranchAItems = res.body.items.some((it: any) => it.name.includes('Product Line Item'));
  assert.equal(hasBranchAItems, false, 'Branch A exclusive products must NOT leak into Branch B catalogue');
});
