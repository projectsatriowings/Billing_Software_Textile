import assert from 'node:assert/strict';
import http from 'node:http';
import test, { after, before } from 'node:test';
import XLSX from 'xlsx';
import { createApp } from '../src/app.ts';
import { connectDb, migrate, type DB } from '../src/db/index.ts';
import { signToken, hashPassword, passwordStamp } from '../src/security.ts';
import {
  parseInvoiceMetadata,
  detectTableColumns,
  parseLineItems,
  enrichWithCatalog,
  generateTemplateExcel,
  normalizeUom,
  type ExtractedProductItem,
} from '../src/services/supplierInvoiceParser.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-long-enough-32-chars-at-least';
const TEST_TENANT = 't_sic_test_' + Date.now();
const BRANCH_ID = 'b_sic_main_' + Date.now();

let db: DB;
let server: http.Server;
let base = '';
let ownerToken = '';

async function api(method: string, path: string, headers: Record<string, string> = {}, body?: any, token?: string) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-branch-id': BRANCH_ID,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { }
  return { status: res.status, body: json, json, text, headers: Object.fromEntries(res.headers.entries()) };
}

before(async () => {
  db = await connectDb();
  await migrate(db);

  // Setup tenant, branch, owner
  await db.exec('INSERT INTO tenants (id, name, business_type) VALUES (?, ?, ?)', [TEST_TENANT, 'Supermarket Test Enterprise', 'retail']);
  await db.exec('INSERT INTO branches (id, tenant_id, name, code, active) VALUES (?, ?, ?, ?, true)', [
    BRANCH_ID,
    TEST_TENANT,
    'Main Branch',
    'MAIN',
  ]);

  const pHash = hashPassword('OwnerPass123!');
  const pStamp = passwordStamp(pHash);
  const ownerId = 'u_sic_owner_' + Date.now();
  await db.exec(
    'INSERT INTO users (id, tenant_id, role, name, email, password_hash, active, branch_id) VALUES (?, ?, ?, ?, ?, ?, true, ?)',
    [ownerId, TEST_TENANT, 'owner', 'Owner Alice', 'alice@sic.example.com', pHash, BRANCH_ID]
  );
  ownerToken = signToken({ sub: ownerId, tid: TEST_TENANT, role: 'owner', ph: pStamp, branchId: BRANCH_ID }, JWT_SECRET, 3600);

  // Seed sample catalog item for cross-referencing selling price
  await db.exec(
    `INSERT INTO items (id, tenant_id, branch_id, name, sku, hsn, price_minor, cost_minor, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, true)`,
    ['item_atta_1', TEST_TENANT, BRANCH_ID, 'Aashirvaad Atta 5kg', 'SKU-ATTA-5KG', '1006', 27000, 23500]
  );

  const app = createApp(db, { secret: JWT_SECRET });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (server) {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (db) {
    await db.exec('DELETE FROM supplier_invoice_mappings WHERE tenant_id = ?', [TEST_TENANT]);
    await db.exec('DELETE FROM items WHERE tenant_id = ?', [TEST_TENANT]);
    await db.exec('DELETE FROM users WHERE tenant_id = ?', [TEST_TENANT]);
    await db.exec('DELETE FROM branches WHERE tenant_id = ?', [TEST_TENANT]);
    await db.exec('DELETE FROM tenants WHERE id = ?', [TEST_TENANT]);
    await db.close();
  }
  setTimeout(() => process.exit(0), 100).unref();
});

// ── Unit Tests: Rule-Based Parser Functions ───────────────────────────────────

test('1. Metadata Extraction extracts supplier, GSTIN, invoice number, date, and grand total', () => {
  const sampleInvoiceText = `
TAX INVOICE
M/s. Shree Balaji Grocery Distributors
GSTIN: 33AAAAA1234A1Z9
Phone: 9876543210
Invoice No: SB/2026/1042
Invoice Date: 12/11/2026

Item Description       HSN    Qty    UOM    Rate    Amount
Aashirvaad Atta 5kg    1006   20     bag    235.00  4700.00
Tata Salt 1kg          2501   50     pkt    24.00   1200.00

Grand Total: ₹5,900.00
  `;

  const meta = parseInvoiceMetadata(sampleInvoiceText);
  assert.equal(meta.supplierGstin, '33AAAAA1234A1Z9');
  assert.ok(meta.supplierName.includes('Shree Balaji'));
  assert.equal(meta.invoiceNumber, 'SB/2026/1042');
  assert.equal(meta.invoiceDate, '12/11/2026');
  assert.equal(meta.totalAmount, 5900);
});

test('2. Table Header and Column Detection handles heading synonyms', () => {
  const lines = [
    'Some top header text',
    'Particulars\tHSN/SAC\tBilled Qty\tUnit\tBasic Rate\tGST %\tTaxable Value\tItem Total',
    'Surf Excel 1kg\t3402\t25\tpcs\t165.00\t18%\t4125.00\t4867.50',
  ];

  const colRes = detectTableColumns(lines);
  assert.equal(colRes.headerLineIndex, 1);
  assert.ok(colRes.columnMap.productNameCol);
  assert.ok(colRes.columnMap.quantityCol);
  assert.ok(colRes.columnMap.rateCol);
  assert.ok(colRes.columnMap.gstRateCol);
});

test('3. Line Items parsing computes cost price and handles multi-line wrapped descriptions', () => {
  const lines = [
    'Description\tHSN\tQty\tUOM\tRate\tGST\tAmount',
    'Fortune Sunlite Oil 1L\t1512\t40\tltr\t125.00\t5%\t5000.00',
    '(Refined Sunflower Oil Pouch)',
    'Toor Dal Premium 1kg\t0713\t30\tkg\t110.00\t5%\t3300.00',
  ];

  const colRes = detectTableColumns(lines);
  const items = parseLineItems(colRes.dataLines, colRes.columnMap, colRes.headers);

  assert.equal(items.length, 2);
  // Fortune Sunlite Oil 1L (Refined Sunflower Oil Pouch)
  assert.ok(items[0].name.includes('Fortune Sunlite Oil'));
  assert.ok(items[0].name.includes('Refined Sunflower Oil'));
  assert.equal(items[0].openingStock, '40');
  assert.equal(items[0].uom, 'ltr');
  assert.equal(items[0].costPrice, '125.00');
  assert.equal(items[0].gstRate, '5%');

  assert.ok(items[1].name.includes('Toor Dal Premium'));
  assert.equal(items[1].openingStock, '30');
  assert.equal(items[1].uom, 'kg');
  assert.equal(items[1].costPrice, '110.00');
});

test('4. Cross-referencing catalog retrieves Selling Price for existing items, leaves new items blank', () => {
  const rawItems: ExtractedProductItem[] = [
    {
      id: 'item-1',
      name: 'Aashirvaad Atta 5kg',
      uom: 'bag',
      sellingPrice: '',
      costPrice: '235.00',
      hsn: '1006',
      gstRate: '5%',
      priceInclusive: 'Yes',
      openingStock: '20',
    },
    {
      id: 'item-2',
      name: 'Brand New Mango Pickle 500g',
      uom: 'bottle',
      sellingPrice: '',
      costPrice: '75.00',
      hsn: '2001',
      gstRate: '12%',
      priceInclusive: 'Yes',
      openingStock: '15',
    },
  ];

  const catalogItems = [
    { name: 'Aashirvaad Atta 5kg', sku: 'SKU-ATTA', spMinor: 27000, costMinor: 23500 },
  ];

  const enriched = enrichWithCatalog(rawItems, catalogItems);

  // Aashirvaad Atta 5kg matched: selling price = 270.00
  assert.equal(enriched[0].sellingPrice, '270.00');
  // Brand New Mango Pickle 500g not matched: selling price = empty string
  assert.equal(enriched[1].sellingPrice, '');
  assert.ok(enriched[1].flags?.includes('Selling Price required'));
});

test('5. ExcelJS generates exact 8-column format compatible with XLSX and BulkImportModal', async () => {
  const products: ExtractedProductItem[] = [
    {
      id: 'p1',
      name: 'Aashirvaad Atta 5kg',
      uom: 'kg',
      sellingPrice: '270.00',
      costPrice: '235.00',
      hsn: '1006',
      gstRate: '5%',
      priceInclusive: 'Yes',
      openingStock: '50',
    },
    {
      id: 'p2',
      name: 'Amul Butter 100g',
      uom: 'pcs',
      sellingPrice: '55.00',
      costPrice: '48.00',
      hsn: '0401',
      gstRate: '12%',
      priceInclusive: 'Yes',
      openingStock: '40',
    },
  ];

  const buffer = await generateTemplateExcel(products);
  assert.ok(buffer.byteLength > 1000);

  // Read back with XLSX to verify exact 8 columns and data rows
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  const EXPECTED_COLUMNS = [
    'Product Name',
    'UOM',
    'Selling Price',
    'Cost Price',
    'HSN',
    'GST Rate',
    'Price Inclusive of GST',
    'Opening Stock',
  ];

  assert.deepEqual(rows[0], EXPECTED_COLUMNS);
  assert.equal(rows[1][0], 'Aashirvaad Atta 5kg');
  assert.equal(rows[1][1], 'kg');
  assert.equal(rows[1][2], 270);
  assert.equal(rows[1][3], 235);
  assert.equal(rows[1][4], '1006');
  assert.equal(rows[1][5], '5%');
  assert.equal(rows[1][6], 'Yes');
  assert.equal(rows[1][7], 50);

  assert.equal(rows[2][0], 'Amul Butter 100g');
});

// ── Integration Tests: Supplier Invoice Endpoints ─────────────────────────────

test('6. POST /api/supplier-invoices/extract parses base64 invoice text and returns structured response', async () => {
  const sampleInvoice = `
TAX INVOICE
Supplier: Metro Wholesale Distributors Ltd
GSTIN: 33AAAAA0000A1Z5
Invoice No: MTR-9801
Date: 15/11/2026

Item Description       HSN     Qty    UOM    Rate     GST%    Total
Aashirvaad Atta 5kg    1006    40     bag    235.00   5%      9870.00
Amul Milk 500ml        0401    60     pkt    28.00    5%      1764.00

Grand Total: ₹11,634.00
  `;

  const base64Data = Buffer.from(sampleInvoice, 'utf8').toString('base64');

  const res = await api(
    'POST',
    '/api/supplier-invoices/extract',
    {},
    {
      fileName: 'invoice.txt',
      fileData: base64Data,
      mimeType: 'text/plain',
    },
    ownerToken
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.metadata.supplierGstin, '33AAAAA0000A1Z5');
  assert.equal(res.body.metadata.invoiceNumber, 'MTR-9801');
  assert.equal(res.body.metadata.totalAmount, 11634);
  assert.ok(res.body.products.length >= 2);

  // Aashirvaad Atta should have auto-matched sellingPrice = 270.00 from catalog
  const atta = res.body.products.find((p: any) => p.name.includes('Aashirvaad Atta'));
  assert.ok(atta);
  assert.equal(atta.sellingPrice, '270.00');
  assert.equal(atta.costPrice, '235.00');
});

test('7. POST /api/supplier-invoices/mappings saves supplier mapping and GET retrieves it', async () => {
  const saveRes = await api(
    'POST',
    '/api/supplier-invoices/mappings',
    {},
    {
      supplierName: 'Metro Wholesale Distributors Ltd',
      supplierGstin: '33AAAAA0000A1Z5',
      mapping: {
        productNameCol: 'Item Description',
        quantityCol: 'Qty',
        rateCol: 'Rate',
        hsnCol: 'HSN',
      },
      headerSample: ['Item Description', 'HSN', 'Qty', 'UOM', 'Rate', 'GST%', 'Total'],
    },
    ownerToken
  );

  assert.equal(saveRes.status, 200);
  assert.ok(saveRes.body.id);

  const getRes = await api('GET', '/api/supplier-invoices/mappings', {}, undefined, ownerToken);
  assert.equal(getRes.status, 200);
  assert.ok(Array.isArray(getRes.body.mappings));
  const found = getRes.body.mappings.find((m: any) => m.supplierGstin === '33AAAAA0000A1Z5');
  assert.ok(found);
  assert.equal(found.mapping.productNameCol, 'Item Description');

  // Clean up
  const delRes = await api('DELETE', `/api/supplier-invoices/mappings/${found.id}`, {}, undefined, ownerToken);
  assert.equal(delRes.status, 200);
});

test('8. POST /api/supplier-invoices/export-excel requires authentication and downloads valid .xlsx file', async () => {
  // Test unauthorized request (no token)
  const unauthRes = await api(
    'POST',
    '/api/supplier-invoices/export-excel',
    {},
    {
      invoiceNumber: 'INV-TEST-1',
      products: [],
    }
  );
  assert.equal(unauthRes.status, 401);
  assert.equal(unauthRes.json.error?.code, 'UNAUTHORIZED');

  // Test unauthorized request (invalid token)
  const invalidRes = await api(
    'POST',
    '/api/supplier-invoices/export-excel',
    {},
    {
      invoiceNumber: 'INV-TEST-1',
      products: [],
    },
    'invalid_token_xyz'
  );
  assert.equal(invalidRes.status, 401);
  assert.equal(invalidRes.json.error?.code, 'UNAUTHORIZED');

  // Test authorized request with valid owner token
  const exportRes = await api(
    'POST',
    '/api/supplier-invoices/export-excel',
    {},
    {
      invoiceNumber: 'INV-TEST-1',
      products: [
        {
          id: '1',
          name: 'Sugar 1kg',
          uom: 'kg',
          sellingPrice: '45.00',
          costPrice: '38.00',
          hsn: '1701',
          gstRate: '5%',
          priceInclusive: 'Yes',
          openingStock: '100',
        },
      ],
    },
    ownerToken
  );

  assert.equal(exportRes.status, 200);
  assert.ok(exportRes.text.length > 500);
  assert.ok(exportRes.headers['content-disposition']?.includes('INV-TEST-1'));
  assert.ok(exportRes.headers['content-type']?.includes('spreadsheetml'));
});

test('9. Extract from binary PDF document using pdf-parse', async () => {
  try {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    page.drawText(
      'TAX INVOICE\n' +
      'M/s. ABC Supermarket Wholesalers\n' +
      'GSTIN: 33BBBBB9999B1Z2\n' +
      'Invoice No: INV-2026-888\n' +
      'Date: 14/11/2026\n\n' +
      'Item Description    HSN     Qty   UOM   Rate    GST%   Total\n' +
      'Basmati Rice 1kg    1006    100   kg    65.00   5%     6825.00\n' +
      'Moong Dal 1kg       0713    50    kg    95.00   5%     4987.50\n\n' +
      'Grand Total: Rs. 11,812.50',
      {
        x: 40,
        y: 350,
        font,
        size: 11,
        lineHeight: 16,
        color: rgb(0, 0, 0),
      }
    );

    const pdfBytes = await pdfDoc.save();
    const base64Pdf = Buffer.from(pdfBytes).toString('base64');

    const res = await api(
      'POST',
      '/api/supplier-invoices/extract',
      {},
      {
        fileName: 'supplier_invoice.pdf',
        fileData: base64Pdf,
        mimeType: 'application/pdf',
      },
      ownerToken
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.metadata.supplierGstin, '33BBBBB9999B1Z2');
    assert.equal(res.body.metadata.invoiceNumber, 'INV-2026-888');
    assert.ok(res.body.products.length >= 2);
    const rice = res.body.products.find((p: any) => p.name.includes('Basmati Rice'));
    assert.ok(rice);
    assert.equal(rice.costPrice, '65.00');
    assert.equal(rice.openingStock, '100');
  } catch (err: any) {
    console.error('TEST 9 CAUGHT ERROR:', err);
    throw err;
  }
});

test('10. End-to-end OCR extraction of FreshMart invoice image extracts 3 items, correct metadata & discrepancy warning', { timeout: 60000 }, async () => {
  const fs = await import('fs');
  const path = await import('path');

  const testFilePaths = [
    'C:/Users/I S Manish Madhava/Downloads/FreshMart Blue Tax Invoice.png',
    'C:/Users/I S Manish Madhava/.gemini/antigravity/brain/9997d043-54ff-4b9b-8345-936187dfb219/.user_uploaded/media_1794811882390_fcfc81f0.jpg',
  ];
  const validPath = testFilePaths.find((p) => fs.existsSync(p));
  if (!validPath) {
    console.log('Skipping test 10: FreshMart test image not found locally');
    return;
  }

  const fileBuf = fs.readFileSync(validPath);
  const base64Data = fileBuf.toString('base64');
  const mimeType = validPath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const res = await api(
    'POST',
    '/api/supplier-invoices/extract',
    {},
    {
      fileName: path.basename(validPath),
      fileData: base64Data,
      mimeType,
    },
    ownerToken
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  // Metadata verification
  assert.ok(res.body.metadata.supplierName.includes('FreshMart'));
  assert.equal(res.body.metadata.supplierGstin, '33ABCDE1234F1Z5');
  assert.equal(res.body.metadata.invoiceNumber, 'FM/2025-26/1048');
  assert.equal(res.body.metadata.totalAmount, 17900.26);
  assert.ok(res.body.metadata.discrepancyWarning);

  // Products verification: 3 detected products
  assert.equal(res.body.products.length, 3);

  const rice = res.body.products.find((p: any) => p.name.toLowerCase().includes('rice'));
  assert.ok(rice, 'Rice product should be found');
  assert.equal(rice.hsn, '1006');
  assert.equal(rice.openingStock, '10');
  assert.equal(rice.costPrice, '1200.00');
  assert.equal(rice.gstRate, '5%');
  assert.equal(rice.priceInclusive, 'No');
  assert.equal(rice.sellingPrice, '');

  const oil = res.body.products.find((p: any) => p.name.toLowerCase().includes('sunflower oil'));
  assert.ok(oil, 'Sunflower Oil product should be found');
  assert.equal(oil.hsn, '1507');
  assert.equal(oil.openingStock, '20');
  assert.equal(oil.costPrice, '140.00');
  assert.equal(oil.gstRate, '5%');
  assert.equal(oil.priceInclusive, 'No');
  assert.equal(oil.sellingPrice, '');

  const sugar = res.body.products.find((p: any) => p.name.toLowerCase().includes('sugar'));
  assert.ok(sugar, 'Sugar product should be found');
  assert.equal(sugar.hsn, '1701');
  assert.equal(sugar.openingStock, '50');
  assert.equal(sugar.costPrice, '45.00');
  assert.equal(sugar.gstRate, '5%');
  assert.equal(sugar.priceInclusive, 'No');
  assert.equal(sugar.sellingPrice, '');
});

test('11. End-to-end OCR extraction of Sharma Grocery Shop invoice extracts 2 items, correct metadata & totals', { timeout: 60000 }, async () => {
  const fs = await import('fs');
  const path = 'C:/Users/I S Manish Madhava/.gemini/antigravity/brain/9997d043-54ff-4b9b-8345-936187dfb219/.user_uploaded/media_1794818926070_855cef64.png';
  if (!fs.existsSync(path)) {
    console.log('Skipping test 11: Sharma invoice image not found');
    return;
  }

  const fileBuf = fs.readFileSync(path);
  const base64Data = fileBuf.toString('base64');

  const res = await api(
    'POST',
    '/api/supplier-invoices/extract',
    {},
    {
      fileData: base64Data,
      fileName: 'sharma-grocery-invoice.png',
      mimeType: 'image/png',
    },
    ownerToken
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  // Metadata verification
  assert.ok(res.body.metadata.supplierName.toLowerCase().includes('sharma'));
  assert.ok(res.body.metadata.supplierGstin.startsWith('29AAC'));
  assert.ok(res.body.metadata.invoiceNumber.includes('SG/'));
  assert.equal(res.body.metadata.invoiceDate, '18/07/2024');
  assert.equal(res.body.metadata.totalAmount, 660);

  // Products verification: 2 detected products
  assert.equal(res.body.products.length, 2);

  const curd = res.body.products.find((p: any) => p.name.toLowerCase().includes('curd'));
  assert.ok(curd, 'Nandini Curd product should be found');
  assert.equal(curd.hsn, '403');
  assert.equal(curd.openingStock, '5');
  assert.equal(curd.costPrice, '35.71');
  assert.equal(curd.gstRate, '12%');

  const juice = res.body.products.find((p: any) => p.name.toLowerCase().includes('juice'));
  assert.ok(juice, 'Real Fruit Juice product should be found');
  assert.equal(juice.hsn, '2009');
  assert.equal(juice.openingStock, '5');
  assert.equal(juice.costPrice, '94.29');
  assert.equal(juice.gstRate, '5%');
});
