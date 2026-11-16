import assert from 'node:assert/strict';
import http from 'node:http';
import test, { after, before } from 'node:test';
import { createApp } from '../src/app.ts';
import { connectDb, migrate, type DB } from '../src/db/index.ts';
import { signToken, hashPassword, passwordStamp } from '../src/security.ts';
import { renderBillDoc } from '../../shared/bill.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-long-enough-32-chars-at-least';
const TEST_TENANT = 't_wh_test_' + Date.now();
const BRANCH_ID = 'b_wh_main_' + Date.now();

let db: DB;
let server: http.Server;
let base = '';
let ownerToken = '';
let ownerId = '';

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
  return { status: res.status, body: json, text, headers: Object.fromEntries(res.headers.entries()) };
}

before(async () => {
  db = await connectDb();
  await migrate(db);
  server = http.createServer(createApp(db, { secret: JWT_SECRET, log: false }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;

  // 1. Setup Tenant and Branch
  await db.exec(
    `INSERT INTO tenants (id, name, business_type, state_code, gstin, address, phone)
     VALUES (?, 'StyleWell Co. Wholesale', 'retail', '24', '24ACAFS6901Q1ZT', 'G 29-30-31 Citi Industrial Estate Surat', '9879448228')`,
    [TEST_TENANT]
  );
  await db.exec(
    `INSERT INTO branches (id, tenant_id, name, code, active) VALUES (?, ?, 'Head Office Surat', 'SURAT', true)`,
    [BRANCH_ID, TEST_TENANT]
  );

  // 2. Setup Owner
  const pwd = hashPassword('OwnerPass123!');
  ownerId = 'u_wh_owner_' + Date.now();
  await db.exec(
    `INSERT INTO users (id, tenant_id, branch_id, name, email, password_hash, role, active)
     VALUES (?, ?, ?, 'Wholesale Owner', ?, ?, 'owner', true)`,
    [ownerId, TEST_TENANT, BRANCH_ID, `owner_wh_${Date.now()}@stylewell.local`, pwd]
  );
  ownerToken = signToken({ sub: ownerId, tid: TEST_TENANT, ph: passwordStamp(pwd), role: 'owner', branchId: BRANCH_ID }, JWT_SECRET, 3600);
});

after(async () => {
  try {
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((r) => server.close(() => r()));
    }
    if (db) {
      await db.exec('DELETE FROM invoice_lines WHERE invoice_id IN (SELECT id FROM invoices WHERE tenant_id = ?)', [TEST_TENANT]);
      await db.exec('DELETE FROM payments WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM stock_moves WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM invoices WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM items WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM parties WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM users WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM branches WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM tenants WHERE id = ?', [TEST_TENANT]);
      await db.close();
    }
  } catch { }
  process.exit(0);
});

test('1. Product item supports wholesale price and minimum wholesale quantity', async () => {
  const createRes = await api('POST', '/api/items', {}, {
    name: 'Fiona Silk Saree',
    sku: 'FIONA-01',
    barcode: 'FIONA88801',
    priceMinor: 65000, // Retail ₹650.00
    wholesalePriceMinor: 55500, // Wholesale ₹555.00
    minWholesaleQtyMilli: 16000, // 16 Pcs
    taxRateBp: 500,
    hsn: '5407',
    unit: 'Pcs',
  }, ownerToken);

  assert.equal(createRes.status, 200);
  assert.equal(createRes.body.item.wholesalePriceMinor, 55500);
  assert.equal(createRes.body.item.minWholesaleQtyMilli, 16000);
  assert.equal(createRes.body.item.priceMinor, 65000);

  // Update item wholesale price
  const updateRes = await api('PATCH', `/api/items/${createRes.body.item.id}`, {}, {
    wholesalePriceMinor: 54000,
  }, ownerToken);

  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.item.wholesalePriceMinor, 54000);
});

test('2. Wholesale customer management prevents duplicate phone and GSTIN', async () => {
  const phone = '937470' + Math.floor(1000 + Math.random() * 9000);
  const gstin = '24AAACR9377A1ZH';

  const cust1 = await api('POST', '/api/parties', {}, {
    name: 'Rikhabdas Gulabchand Fabrics Pvt Ltd',
    type: 'customer',
    customerType: 'wholesale',
    contactPerson: 'Mr. Rikhabdas',
    phone,
    gstin,
    address: '27 B Plot No. 45-A Central Road No. 3 Surat',
    creditLimitMinor: 5000000, // ₹50,000 credit limit
  }, ownerToken);

  assert.equal(cust1.status, 200);
  assert.equal(cust1.body.party.name, 'Rikhabdas Gulabchand Fabrics Pvt Ltd');

  // Try duplicate phone
  const dupPhone = await api('POST', '/api/parties', {}, {
    name: 'Duplicate Phone Buyer',
    type: 'customer',
    phone,
  }, ownerToken);
  if (dupPhone.status !== 409) {
    console.error('Test 2 dupPhone:', dupPhone.status, dupPhone.text);
  }
  assert.equal(dupPhone.status, 409);

  // Try duplicate GSTIN
  const dupGstin = await api('POST', '/api/parties', {}, {
    name: 'Duplicate GSTIN Buyer',
    type: 'customer',
    phone: '9898000001',
    gstin,
  }, ownerToken);
  if (dupGstin.status !== 409) {
    console.error('Test 2 dupGstin:', dupGstin.status, dupGstin.text);
  }
  assert.equal(dupGstin.status, 409);
});

test('3. Generates Wholesale Invoice with WH prefix, shared inventory deduction, and clean B2B layout without transport details', async () => {
  // 1. Create product and inward initial stock
  const itemRes = await api('POST', '/api/items', {}, {
    name: 'Lucknowi Vol.3 Fabric',
    sku: 'LUCK-V3',
    priceMinor: 65000,
    wholesalePriceMinor: 55500,
    minWholesaleQtyMilli: 10000,
    taxRateBp: 500,
    hsn: '5407',
    unit: 'Pcs',
  }, ownerToken);
  assert.equal(itemRes.status, 200);
  const item = itemRes.body.item;

  // Stock inward: 100 units
  await db.exec(
    `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, kind, qty_milli, created_at)
     VALUES (?, ?, ?, ?, 'opening', 100000, now())`,
    ['sm_in_' + Date.now(), TEST_TENANT, BRANCH_ID, item.id]
  );

  // 2. Create wholesale customer
  const custRes = await api('POST', '/api/parties', {}, {
    name: 'Suhani Fashions Surat',
    type: 'customer',
    phone: '98251' + Math.floor(10000 + Math.random() * 90000),
    gstin: '27AAPFU0939F1ZV',
    address: 'Ring Road Surat',
    creditLimitMinor: 10000000, // ₹1,00,000
  }, ownerToken);
  assert.equal(custRes.status, 200);
  const customer = custRes.body.party;

  // 3. Issue Wholesale Invoice
  const invoiceRes = await api('POST', '/api/invoices', {}, {
    invoiceType: 'wholesale',
    branchId: BRANCH_ID,
    customerId: customer.id,
    customer: {
      name: customer.name,
      phone: customer.phone,
      gstin: customer.gstin,
      address: customer.address,
    },
    lines: [
      {
        itemId: item.id,
        name: item.name,
        qtyMilli: 16000, // 16 units
        priceMinor: 55500, // ₹555.00
        taxRateBp: 500,
        discountMinor: 0,
        hsn: '5407',
        unit: 'Pcs',
      },
    ],
    payments: [
      {
        mode: 'bank',
        amountMinor: 500000, // ₹5,000 paid via NEFT
        reference: 'NEFT-BARB20261114',
      },
      {
        mode: 'credit',
        amountMinor: 432800, // Balance on credit
      },
    ],
    custom: {
      paymentTerms: 'NEFT / RTGS',
      billingAddress: 'Ring Road Surat',
      shippingAddress: 'Ring Road Surat',
    },
  }, ownerToken);

  if (invoiceRes.status !== 200) {
    console.error('Test 3 invoiceRes:', invoiceRes.status, invoiceRes.text);
  }
  assert.equal(invoiceRes.status, 200);
  const inv = invoiceRes.body.invoice || invoiceRes.body;
  assert.ok(inv.number.startsWith('WH-') || inv.number.startsWith('WH'), `Expected WH prefix, got: ${inv.number}`);
  assert.equal(inv.invoiceType, 'wholesale');

  // Verify stock deduction from shared inventory
  const moves = await db.query<{ kind: string; qtyMilli: number }>(
    `SELECT kind, qty_milli as "qtyMilli" FROM stock_moves WHERE item_id = ? AND kind = 'sale'`,
    [item.id]
  );
  assert.ok(moves.length > 0, 'Must have a sale stock move');
  assert.equal(moves[0].qtyMilli, -16000, 'Must deduct 16000 milli (16 units)');

  // 4. Test Print Endpoint produces Traditional A4 format without transport metadata
  const printRes = await api('GET', `/api/invoices/${inv.id}/print`, {}, undefined, ownerToken);
  assert.equal(printRes.status, 200);
  assert.ok(printRes.text.includes('TAX INVOICE'), 'Must have TAX INVOICE title');
  assert.equal(printRes.text.includes('Goods Sent By:'), false, 'Must NOT contain transport: Goods Sent By');
  assert.equal(printRes.text.includes('L.R. No :'), false, 'Must NOT contain transport: L.R. No');
  assert.equal(printRes.text.includes('Broker :'), false, 'Must NOT contain transport: Broker');
  assert.equal(printRes.text.includes('Haste :'), false, 'Must NOT contain transport: Haste');
  assert.equal(printRes.text.includes('BANK DETAILS'), false, 'Must NOT contain BANK DETAILS header');
  assert.equal(printRes.text.includes('AC NO.'), false, 'Must NOT contain AC NO.');
  assert.equal(printRes.text.includes('IFSC CODE'), false, 'Must NOT contain IFSC CODE');
  assert.equal(printRes.text.includes('SHREE KRISHNA SUPERMARKET'), false, 'Must NOT display retail shop name on wholesale invoice');
  assert.ok(printRes.text.includes('Total Amount in Words :'), 'Must have Total Amount in Words');
  assert.ok(printRes.text.includes('Certified that the particulars given'), 'Must have statutory tax certification');
  assert.ok(printRes.text.includes('Place of Supply'), 'Must contain Place of Supply');
  assert.ok(printRes.text.includes('Reverse Charge'), 'Must contain Reverse Charge');
  assert.ok(printRes.text.includes('HSN CODE'), 'Must have HSN summary table');
  assert.ok(printRes.text.includes('Authorised Signatory'), 'Must have Authorised Signatory');
  assert.ok(printRes.text.includes('Suhani Fashions Surat'), 'Must include customer firm name');
  assert.ok(printRes.text.includes('27AAPFU0939F1ZV'), 'Must include customer GSTIN');
  assert.equal(printRes.text.includes('Cash Customer'), false, 'Must NOT display Cash Customer');
});

test('4. Separate Business Identity for Retail (POS) and Wholesale (B2B)', async () => {
  // Update shop invoice profiles with separate trading names
  const patchRes = await api('PUT', '/api/shop', {}, {
    invoiceProfiles: {
      retail: {
        enabled: true,
        displayName: 'Sri Krishna Supermarket',
        legalName: 'Sri Krishna Retail Enterprises Pvt Ltd',
        gstin: '24ACAFS6901Q1ZT',
        address: 'Main Bazaar Surat',
        phone: '9879001122',
        invoicePrefix: 'RET',
        paper: 'thermal80',
        bankDetails: {
          bankName: 'STATE BANK OF INDIA',
          accountNo: '33445566778',
          branchName: 'Surat Main Branch',
          ifscCode: 'SBIN0000123',
        },
        terms: 'Goods once sold will not be taken back.',
      },
      wholesale: {
        enabled: true,
        displayName: 'SKS Wholesale Traders',
        legalName: 'SKS Trading & Distribution LLP',
        gstin: '24ACAFS6901Q1ZT',
        address: 'G-29 Textile Hub Surat',
        phone: '9879448899',
        email: 'billing@skswholesale.com',
        invoicePrefix: 'SKS',
        paper: 'wholesale_a4',
        bankDetails: {
          bankName: 'HDFC BANK',
          accountNo: '50200012345678',
          branchName: 'Ring Road Surat',
          ifscCode: 'HDFC0001234',
        },
        terms: 'Subject to Surat Jurisdiction.',
      },
    },
  }, ownerToken);
  assert.equal(patchRes.status, 200);

  // 1. Create a product for testing
  const itemRes = await api('POST', '/api/items', {}, {
    name: 'SKS Basmati Rice 10kg',
    sku: 'RICE-10KG',
    priceMinor: 120000, // ₹1200 retail
    wholesalePriceMinor: 95000, // ₹950 wholesale
    taxRateBp: 500,
    unit: 'Bags',
  }, ownerToken);
  assert.equal(itemRes.status, 200);
  const it = itemRes.body.item;

  // Inward stock
  await db.exec(
    `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, kind, qty_milli, created_at)
     VALUES (?, ?, ?, ?, 'opening', 50000, now())`,
    ['sm_test4_' + Date.now(), TEST_TENANT, BRANCH_ID, it.id]
  );

  // 2. Open shift for retail billing
  const openShiftRes = await api('POST', '/api/shifts', {}, {
    branchId: BRANCH_ID,
    counter: 'COUNTER-1',
    openingCashMinor: 100000,
  }, ownerToken);
  assert.equal(openShiftRes.status, 200);

  // 3. Issue Retail Invoice
  const retInvRes = await api('POST', '/api/invoices', {}, {
    invoiceType: 'retail',
    branchId: BRANCH_ID,
    customer: { name: 'Retail Walk-in Customer', phone: '9988776655' },
    lines: [
      {
        itemId: it.id,
        name: it.name,
        qtyMilli: 1000,
        priceMinor: 120000, // retail price
        taxRateBp: 500,
        unit: 'Bags',
      },
    ],
    payments: [{ mode: 'cash', amountMinor: 120000 }],
  }, ownerToken);
  if (retInvRes.status !== 200) {
    console.error('retInvRes:', retInvRes.status, retInvRes.text);
  }
  assert.equal(retInvRes.status, 200);
  const retInv = retInvRes.body.invoice || retInvRes.body;
  assert.ok(retInv.number.startsWith('RET-') || retInv.number.startsWith('RET'), `Expected RET prefix, got: ${retInv.number}`);

  // Print Retail Invoice -> check Retail Branding
  const retPrintRes = await api('GET', `/api/invoices/${retInv.id}/print`, {}, undefined, ownerToken);
  assert.equal(retPrintRes.status, 200);
  assert.ok(retPrintRes.text.includes('Sri Krishna Supermarket'), 'Retail print must use Retail Display Name');

  // 4. Issue Wholesale Invoice
  const whPartyRes = await api('POST', '/api/parties', {}, {
    name: 'Metro Grocers Distribution',
    type: 'customer',
    phone: '98252' + Math.floor(10000 + Math.random() * 90000),
  }, ownerToken);
  assert.equal(whPartyRes.status, 200);

  const whInvRes = await api('POST', '/api/invoices', {}, {
    invoiceType: 'wholesale',
    branchId: BRANCH_ID,
    customerId: whPartyRes.body.party.id,
    customer: { name: whPartyRes.body.party.name, phone: whPartyRes.body.party.phone },
    lines: [
      {
        itemId: it.id,
        name: it.name,
        qtyMilli: 10000, // 10 bags bulk
        priceMinor: 95000, // wholesale price
        taxRateBp: 500,
        unit: 'Bags',
      },
    ],
    payments: [{ mode: 'bank', amountMinor: 950000 }],
  }, ownerToken);
  assert.equal(whInvRes.status, 200);
  const whInv = whInvRes.body.invoice || whInvRes.body;
  assert.ok(whInv.number.startsWith('SKS-') || whInv.number.startsWith('SKS'), `Expected SKS prefix, got: ${whInv.number}`);

  // Print Wholesale Invoice -> check Wholesale Branding
  const whPrintRes = await api('GET', `/api/invoices/${whInv.id}/print`, {}, undefined, ownerToken);
  assert.equal(whPrintRes.status, 200);
  assert.ok(whPrintRes.text.includes('SKS Wholesale Traders'), 'Wholesale print must use Wholesale Display Name');
  assert.ok(whPrintRes.text.includes('SKS Trading &amp; Distribution LLP') || whPrintRes.text.includes('SKS Trading & Distribution LLP'), 'Wholesale print must include Legal Entity Name');
  assert.equal(whPrintRes.text.includes('BANK DETAILS'), false, 'Wholesale print must NOT contain BANK DETAILS');
  assert.equal(whPrintRes.text.includes('HDFC BANK'), false, 'Wholesale print must NOT display bank name');
  assert.equal(whPrintRes.text.includes('50200012345678'), false, 'Wholesale print must NOT display account number');
  assert.equal(whPrintRes.text.includes('Goods Sent By:'), false, 'Wholesale print must NOT contain Goods Sent By');

  // Verify updating wholesaleBusinessName directly updates wholesale display name
  const updateNameRes = await api('PUT', '/api/shop', {}, {
    wholesaleBusinessName: 'ABC Wholesale Traders',
  }, ownerToken);
  assert.equal(updateNameRes.status, 200);
  const updatedShop = updateNameRes.body.shop || updateNameRes.body;
  assert.equal(updatedShop.wholesaleBusinessName, 'ABC Wholesale Traders');
  assert.equal(updatedShop.invoiceProfiles.wholesale.displayName, 'ABC Wholesale Traders');
});

test('5. Wholesale Billing displays customer actual details across invoice generation, preview and print', async () => {
  // 1. Create product item
  const itRes = await api('POST', '/api/items', {}, {
    name: 'Basmati Rice Premium 25kg',
    sku: 'BASMATI-PREM-25',
    priceMinor: 250000,
    wholesalePriceMinor: 210000,
    minWholesaleQtyMilli: 25000,
    taxRateBp: 500,
    unit: 'Bag',
  }, ownerToken);
  assert.equal(itRes.status, 200);
  const it = itRes.body.item;

  await db.exec(
    `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, kind, qty_milli, created_at)
     VALUES (?, ?, ?, ?, 'opening', 500000, now())`,
    ['sm_in_b_' + Date.now(), TEST_TENANT, BRANCH_ID, it.id]
  );

  // 2. Create wholesale customer PV (Attn: Ram, Phone: 919638521478, GSTIN: 33ABCDE1234F1Z5, Tamil Nadu)
  const pvRes = await api('POST', '/api/parties', {}, {
    name: 'PV',
    type: 'customer',
    customerType: 'wholesale',
    contactPerson: 'Ram',
    phone: '919638521478',
    gstin: '33ABCDE1234F1Z5',
    creditLimitMinor: 10000000, // ₹1,00,000
    // Note: billing address not configured to test fallback
  }, ownerToken);
  assert.equal(pvRes.status, 200);
  const pv = pvRes.body.party;
  assert.equal(pv.name, 'PV');
  assert.equal(pv.gstin, '33ABCDE1234F1Z5');

  // 3. Generate Wholesale Invoice for PV
  const invRes = await api('POST', '/api/invoices', {}, {
    invoiceType: 'wholesale',
    branchId: BRANCH_ID,
    partyId: pv.id,
    customerId: pv.id,
    customerName: pv.name,
    customerPhone: pv.phone,
    customerGstin: pv.gstin,
    customer: {
      id: pv.id,
      name: pv.name,
      phone: pv.phone,
      gstin: pv.gstin,
      contactPerson: 'Ram',
      stateCode: '33',
      stateName: 'Tamil Nadu',
    },
    lines: [
      {
        itemId: it.id,
        name: it.name,
        qtyMilli: 25000,
        priceMinor: 210000,
        taxRateBp: 500,
        discountMinor: 0,
        unit: 'Bag',
      },
    ],
    payments: [{ mode: 'bank', amountMinor: 220500 }],
    custom: {
      paymentTerms: 'NEFT / RTGS',
      customerGstin: pv.gstin,
      customerState: 'Tamil Nadu',
      customerStateCode: '33',
      contactPerson: 'Ram',
    },
  }, ownerToken);

  assert.equal(invRes.status, 200);
  const inv = invRes.body.invoice || invRes.body;
  assert.equal(inv.customerName, 'PV');
  assert.equal(inv.customerPhone, '919638521478');
  assert.equal(inv.customerGstin, '33ABCDE1234F1Z5');
  assert.equal(inv.partyId, pv.id);

  // 4. Verify Invoice Details via GET /api/invoices/:id
  const getInvRes = await api('GET', `/api/invoices/${inv.id}`, {}, undefined, ownerToken);
  assert.equal(getInvRes.status, 200);
  assert.equal(getInvRes.body.invoice.customerName, 'PV');
  assert.equal(getInvRes.body.invoice.customerPhone, '919638521478');

  // 5. Verify Invoice Print output
  const printRes = await api('GET', `/api/invoices/${inv.id}/print`, {}, undefined, ownerToken);
  assert.equal(printRes.status, 200);

  // Assertions ensuring NO "Cash Customer" or "Unregistered" replacement
  assert.ok(printRes.text.includes('PV'), 'Must display buyer name PV');
  assert.equal(printRes.text.includes('Cash Customer'), false, 'Must NOT display Cash Customer');
  assert.ok(printRes.text.includes('919638521478'), 'Must display customer phone 919638521478');
  assert.ok(printRes.text.includes('33ABCDE1234F1Z5'), 'Must display customer GSTIN 33ABCDE1234F1Z5');
  assert.ok(printRes.text.includes('Ram'), 'Must display contact person Ram');
  assert.ok(printRes.text.includes('Tamil Nadu'), 'Must display state Tamil Nadu');
  assert.ok(printRes.text.includes('Address not configured'), 'Must display address not configured fallback');

  // 6. Test Unregistered wholesale customer
  const unregRes = await api('POST', '/api/parties', {}, {
    name: 'Balaji Retail Store',
    type: 'customer',
    customerType: 'wholesale',
    phone: '9840123999',
    address: '45 M.G. Road Salem',
  }, ownerToken);
  assert.equal(unregRes.status, 200);
  const unreg = unregRes.body.party;

  const unregInvRes = await api('POST', '/api/invoices', {}, {
    invoiceType: 'wholesale',
    branchId: BRANCH_ID,
    partyId: unreg.id,
    customerName: unreg.name,
    customerPhone: unreg.phone,
    lines: [
      {
        itemId: it.id,
        name: it.name,
        qtyMilli: 25000,
        priceMinor: 210000,
        taxRateBp: 500,
        unit: 'Bag',
      },
    ],
    payments: [{ mode: 'cash', amountMinor: 220500 }],
  }, ownerToken);
  assert.equal(unregInvRes.status, 200);

  const unregPrintRes = await api('GET', `/api/invoices/${unregInvRes.body.id}/print`, {}, undefined, ownerToken);
  assert.equal(unregPrintRes.status, 200);
  assert.ok(unregPrintRes.text.includes('Balaji Retail Store'), 'Must display Balaji Retail Store');
  assert.ok(unregPrintRes.text.includes('9840123999'), 'Must display phone 9840123999');
  assert.ok(unregPrintRes.text.includes('Unregistered'), 'Unregistered customer must show Unregistered for GST');
  assert.equal(unregPrintRes.text.includes('Cash Customer'), false, 'Must NOT display Cash Customer for Balaji');
});

test('6. Invoice template selection strictly isolates Retail (Thermal) and Wholesale (A4)', async () => {
  // 1. Create a retail invoice
  const retRes = await api('POST', '/api/invoices', {}, {
    invoiceType: 'retail',
    branchId: BRANCH_ID,
    customerName: 'Retail Buyer',
    customerPhone: '9840199999',
    lines: [
      {
        name: 'Sunflower Oil 1L',
        qtyMilli: 2000,
        priceMinor: 14000,
        taxRateBp: 500,
        unit: 'Pcs',
      },
    ],
    payments: [{ mode: 'cash', amountMinor: 28000 }],
  }, ownerToken);
  assert.equal(retRes.status, 200);
  const retailInv = retRes.body.invoice || retRes.body;

  // 2. Create a wholesale invoice
  const whRes = await api('POST', '/api/invoices', {}, {
    invoiceType: 'wholesale',
    branchId: BRANCH_ID,
    customerName: 'B2B Wholesale Traders',
    customerPhone: '9840188888',
    lines: [
      {
        name: 'Rice 25kg Bulk',
        qtyMilli: 250000,
        priceMinor: 120000,
        taxRateBp: 500,
        unit: 'Bag',
      },
    ],
    payments: [{ mode: 'bank', amountMinor: 1260000 }],
  }, ownerToken);
  assert.equal(whRes.status, 200);
  const whInv = whRes.body.invoice || whRes.body;

  // 3. Verify GET /api/invoices list exposes invoiceType
  const listRes = await api('GET', '/api/invoices?limit=10', {}, undefined, ownerToken);
  assert.equal(listRes.status, 200);
  const foundRetailInList = listRes.body.invoices.find((i: any) => i.id === retailInv.id);
  const foundWhInList = listRes.body.invoices.find((i: any) => i.id === whInv.id);
  assert.ok(foundRetailInList);
  assert.equal(foundRetailInList.invoiceType, 'retail');
  assert.ok(foundWhInList);
  assert.equal(foundWhInList.invoiceType, 'wholesale');

  // 4. Verify GET /api/invoices/:id detail exposes invoiceType
  const getRetail = await api('GET', `/api/invoices/${retailInv.id}`, {}, undefined, ownerToken);
  assert.equal(getRetail.status, 200);
  assert.equal(getRetail.body.invoice.invoiceType, 'retail');
  const getWh = await api('GET', `/api/invoices/${whInv.id}`, {}, undefined, ownerToken);
  assert.equal(getWh.status, 200);
  assert.equal(getWh.body.invoice.invoiceType, 'wholesale');

  // 5. Verify Retail Print generates thermal receipt (even if query requests ?paper=a4)
  const retPrint = await api('GET', `/api/invoices/${retailInv.id}/print`, {}, undefined, ownerToken);
  assert.equal(retPrint.status, 200);
  assert.ok(retPrint.text.includes('@page{size:80mm auto;margin:0}'), 'Retail print must use 80mm thermal page');
  assert.ok(retPrint.text.includes('th-bill-table'), 'Retail print must use thermal bill table');
  assert.equal(retPrint.text.includes('copy wholesale-a4'), false, 'Retail print must NEVER use wholesale-a4');
  assert.equal(retPrint.text.includes('@page { size: A4 portrait; margin: 8mm; }'), false, 'Retail print must NEVER use A4 page');

  // Pass ?paper=a4 to retail print -> must STILL force thermal receipt
  const retPrintA4Query = await api('GET', `/api/invoices/${retailInv.id}/print?paper=a4`, {}, undefined, ownerToken);
  assert.equal(retPrintA4Query.status, 200);
  assert.ok(retPrintA4Query.text.includes('@page{size:80mm auto;margin:0}'), 'Retail print must ignore ?paper=a4 and remain thermal');
  assert.equal(retPrintA4Query.text.includes('copy wholesale-a4'), false);

  // 6. Verify Wholesale Print generates Wholesale A4 Tax Invoice (even if query requests ?paper=thermal80)
  const whPrint = await api('GET', `/api/invoices/${whInv.id}/print`, {}, undefined, ownerToken);
  assert.equal(whPrint.status, 200);
  assert.ok(whPrint.text.includes('copy wholesale-a4'), 'Wholesale print must use wholesale-a4 layout');
  assert.ok(whPrint.text.includes('@page { size: A4 portrait; margin: 8mm; }'), 'Wholesale print must use A4 page');
  assert.equal(whPrint.text.includes('th-bill-table'), false, 'Wholesale print must NEVER use thermal table');

  const whPrintThermalQuery = await api('GET', `/api/invoices/${whInv.id}/print?paper=thermal80`, {}, undefined, ownerToken);
  assert.equal(whPrintThermalQuery.status, 200);
  assert.ok(whPrintThermalQuery.text.includes('copy wholesale-a4'), 'Wholesale print must ignore ?paper=thermal80 and remain A4');
  assert.equal(whPrintThermalQuery.text.includes('th-bill-table'), false);

  // 7. Verify Public Share URL /b/:token respects invoice type
  const retShareToken = retailInv.shareToken || getRetail.body.invoice.shareToken;
  assert.ok(retShareToken, 'Retail invoice must have shareToken');
  const retPublic = await api('GET', `/b/${retShareToken}`);
  assert.equal(retPublic.status, 200);
  assert.ok(retPublic.text.includes('@page{size:80mm auto;margin:0}'), 'Public bill for retail must be thermal');
  assert.equal(retPublic.text.includes('copy wholesale-a4'), false);

  const whShareToken = whInv.shareToken || getWh.body.invoice.shareToken;
  assert.ok(whShareToken, 'Wholesale invoice must have shareToken');
  const whPublic = await api('GET', `/b/${whShareToken}`);
  assert.equal(whPublic.status, 200);
  assert.ok(whPublic.text.includes('copy wholesale-a4'), 'Public bill for wholesale must be wholesale A4');
  assert.equal(whPublic.text.includes('th-bill-table'), false);
});

test('11. Invoice PDF Download functionality for Wholesale Billing', async () => {
  // Create a wholesale customer
  const custRes = await api(
    'POST',
    '/api/parties',
    {},
    {
      name: 'PV Wholesale Mart',
      type: 'customer',
      customerType: 'wholesale',
      branchId: BRANCH_ID,
      phone: '9196385' + Math.floor(10000 + Math.random() * 90000),
      gstin: '33ABCDE5678F1Z5',
      address: 'Plot 45 SIPCOT Industrial Complex Hosur',
      stateCode: '33',
    },
    ownerToken
  );
  assert.equal(custRes.status, 200);
  const custId = custRes.body.party ? custRes.body.party.id : custRes.body.id;

  // Create a wholesale invoice
  const invCreateRes = await api(
    'POST',
    '/api/invoices',
    {},
    {
      invoiceType: 'wholesale',
      branchId: BRANCH_ID,
      partyId: custId,
      customerId: custId,
      lines: [
        {
          name: 'Colgate Strong Teeth 200g',
          hsn: '3306',
          unit: 'pcs',
          qtyMilli: 10000,
          priceMinor: 11500,
          discountMinor: 0,
          taxRateBp: 1800,
        },
      ],
      paymentMode: 'bank',
      paidAmountRupees: '1150.00',
    },
    ownerToken
  );
  assert.equal(invCreateRes.status, 200);
  const invoiceId = invCreateRes.body.invoice ? invCreateRes.body.invoice.id : invCreateRes.body.id;
  const invoiceNumber = invCreateRes.body.invoice ? invCreateRes.body.invoice.number : invCreateRes.body.number;

  // 1. Verify unauthenticated call to /api/invoices/:id/download-pdf returns 401
  const unauthRes = await api('GET', `/api/invoices/${invoiceId}/download-pdf`);
  assert.equal(unauthRes.status, 401);

  // 2. Verify authenticated call to /api/invoices/:id/download-pdf returns PDF
  const pdfRes = await api('GET', `/api/invoices/${invoiceId}/download-pdf`, {}, undefined, ownerToken);
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers['content-type'], 'application/pdf');
  assert.ok(pdfRes.headers['content-disposition']?.includes('attachment; filename='));
  assert.ok(pdfRes.headers['content-disposition']?.includes(`Wholesale_Invoice_${invoiceNumber}.pdf`));
  assert.ok(pdfRes.text.startsWith('%PDF-'));
  assert.ok(pdfRes.text.length > 500);

  // 3. Verify /api/invoices/:id/print?format=pdf downloads PDF
  const printPdfRes = await api('GET', `/api/invoices/${invoiceId}/print?format=pdf`, {}, undefined, ownerToken);
  assert.equal(printPdfRes.status, 200);
  assert.equal(printPdfRes.headers['content-type'], 'application/pdf');
  assert.ok(printPdfRes.headers['content-disposition']?.includes(`Wholesale_Invoice_${invoiceNumber}.pdf`));
  assert.ok(printPdfRes.text.startsWith('%PDF-'));

  // 4. Verify /api/invoices/:id/print (without pdf param) remains print HTML view
  const printHtmlRes = await api('GET', `/api/invoices/${invoiceId}/print?paper=wholesale_a4&autoprint=true`, {}, undefined, ownerToken);
  assert.equal(printHtmlRes.status, 200);
  assert.ok(printHtmlRes.headers['content-type']?.includes('text/html'));
  assert.ok(printHtmlRes.text.includes('copy wholesale-a4'));
  assert.ok(printHtmlRes.text.includes('window.print()'));
});
