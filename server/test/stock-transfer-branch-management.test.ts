import assert from 'node:assert/strict';
import http from 'node:http';
import test, { after, before } from 'node:test';
import { createApp } from '../src/app.ts';
import { connectDb, type DB } from '../src/db/index.ts';
import { signToken, hashPassword, passwordStamp, newId } from '../src/security.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-long-enough-32-chars-at-least';
const TEST_TENANT = 't_stk_mgmt_' + Date.now();
const BRANCH_MAIN = 'b_main_mgmt_' + Date.now();
const BRANCH_ANNA = 'b_anna_mgmt_' + Date.now();
const BRANCH_TNAGAR = 'b_tnagar_mgmt_' + Date.now();

let db: DB;
let server: http.Server;
let base = '';

let ownerToken = '';
let mainMgrToken = '';
let annaMgrToken = '';
let tnagarMgrToken = '';

const ITEM_MAIN_RICE = 'i_m_rice_' + Date.now();
const ITEM_ANNA_OIL = 'i_a_oil_' + Date.now();
const ITEM_TNAGAR_SOAP = 'i_t_soap_' + Date.now();

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
  db = await connectDb();
  server = http.createServer(createApp(db, { secret: JWT_SECRET, log: false }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;

  // 1. Setup Tenant and 3 Branches: Main, Anna Nagar, T Nagar
  await db.exec(`INSERT INTO tenants (id, name, business_type) VALUES (?, 'Stock Transfer Branch Mgmt Tenant', 'retail')`, [TEST_TENANT]);
  await db.exec(`INSERT INTO branches (id, tenant_id, name, code, active) VALUES (?, ?, 'Main Branch', 'MAIN', true)`, [BRANCH_MAIN, TEST_TENANT]);
  await db.exec(`INSERT INTO branches (id, tenant_id, name, code, active) VALUES (?, ?, 'Anna Nagar', 'ANNA', true)`, [BRANCH_ANNA, TEST_TENANT]);
  await db.exec(`INSERT INTO branches (id, tenant_id, name, code, active) VALUES (?, ?, 'T. Nagar', 'TNAGAR', true)`, [BRANCH_TNAGAR, TEST_TENANT]);

  // 2. Setup Super Admin Owner User
  const pwd = hashPassword('TestPass123!');
  const ownerId = 'u_owner_mgmt_' + Date.now();
  await db.exec(
    `INSERT INTO users (id, tenant_id, branch_id, name, email, password_hash, role, active)
     VALUES (?, ?, NULL, 'Super Admin', ?, ?, 'owner', true)`,
    [ownerId, TEST_TENANT, `owner_${Date.now()}@stkmgmt.local`, pwd]
  );
  ownerToken = signToken({ sub: ownerId, tid: TEST_TENANT, ph: passwordStamp(pwd), role: 'owner' }, JWT_SECRET, 3600);

  // 3. Setup Branch Managers
  const mainMgrId = 'u_mgr_main_' + Date.now();
  await db.exec(
    `INSERT INTO users (id, tenant_id, branch_id, name, email, password_hash, role, assigned_location, active)
     VALUES (?, ?, ?, 'Main Branch Manager', ?, ?, 'manager', 'MAIN', true)`,
    [mainMgrId, TEST_TENANT, BRANCH_MAIN, `mainmgr_${Date.now()}@stkmgmt.local`, pwd]
  );
  mainMgrToken = signToken({ sub: mainMgrId, tid: TEST_TENANT, branchId: BRANCH_MAIN, ph: passwordStamp(pwd), role: 'manager' }, JWT_SECRET, 3600);

  const annaMgrId = 'u_mgr_anna_' + Date.now();
  await db.exec(
    `INSERT INTO users (id, tenant_id, branch_id, name, email, password_hash, role, assigned_location, active)
     VALUES (?, ?, ?, 'Anna Nagar Manager', ?, ?, 'manager', 'ANNA', true)`,
    [annaMgrId, TEST_TENANT, BRANCH_ANNA, `annamgr_${Date.now()}@stkmgmt.local`, pwd]
  );
  annaMgrToken = signToken({ sub: annaMgrId, tid: TEST_TENANT, branchId: BRANCH_ANNA, ph: passwordStamp(pwd), role: 'manager' }, JWT_SECRET, 3600);

  const tnagarMgrId = 'u_mgr_tnagar_' + Date.now();
  await db.exec(
    `INSERT INTO users (id, tenant_id, branch_id, name, email, password_hash, role, assigned_location, active)
     VALUES (?, ?, ?, 'T. Nagar Manager', ?, ?, 'manager', 'TNAGAR', true)`,
    [tnagarMgrId, TEST_TENANT, BRANCH_TNAGAR, `tnagarmgr_${Date.now()}@stkmgmt.local`, pwd]
  );
  tnagarMgrToken = signToken({ sub: tnagarMgrId, tid: TEST_TENANT, branchId: BRANCH_TNAGAR, ph: passwordStamp(pwd), role: 'manager' }, JWT_SECRET, 3600);

  // 4. Seed Products and Initial Stock
  // Main Branch: 50 Rice bags
  await db.exec(
    `INSERT INTO items (id, tenant_id, branch_id, name, sku, barcode, unit, category, price_minor, cost_minor, track_stock, active)
     VALUES (?, ?, ?, 'Main Ponni Rice 25kg', 'SKU-M-RICE', '8901001001001', 'bag', 'Grains', 125000, 100000, true, true)`,
    [ITEM_MAIN_RICE, TEST_TENANT, BRANCH_MAIN]
  );
  await db.exec(
    `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, location, qty_milli, kind, reason)
     VALUES (?, ?, ?, ?, 'MAIN', 50000, 'opening', 'Initial Stock')`,
    [newId('sm'), TEST_TENANT, BRANCH_MAIN, ITEM_MAIN_RICE]
  );

  // Anna Nagar: 40 Oil pouches
  await db.exec(
    `INSERT INTO items (id, tenant_id, branch_id, name, sku, barcode, unit, category, price_minor, cost_minor, track_stock, active)
     VALUES (?, ?, ?, 'Anna Gingelly Oil 1L', 'SKU-A-OIL', '8902002002002', 'pouch', 'Oils', 28000, 22000, true, true)`,
    [ITEM_ANNA_OIL, TEST_TENANT, BRANCH_ANNA]
  );
  await db.exec(
    `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, location, qty_milli, kind, reason)
     VALUES (?, ?, ?, ?, 'ANNA', 40000, 'opening', 'Initial Stock')`,
    [newId('sm'), TEST_TENANT, BRANCH_ANNA, ITEM_ANNA_OIL]
  );

  // T. Nagar: 60 Soaps
  await db.exec(
    `INSERT INTO items (id, tenant_id, branch_id, name, sku, barcode, unit, category, price_minor, cost_minor, track_stock, active)
     VALUES (?, ?, ?, 'TNagar Herbal Soap 100g', 'SKU-T-SOAP', '8903003003003', 'pcs', 'Personal Care', 4500, 3200, true, true)`,
    [ITEM_TNAGAR_SOAP, TEST_TENANT, BRANCH_TNAGAR]
  );
  await db.exec(
    `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, location, qty_milli, kind, reason)
     VALUES (?, ?, ?, ?, 'TNAGAR', 60000, 'opening', 'Initial Stock')`,
    [newId('sm'), TEST_TENANT, BRANCH_TNAGAR, ITEM_TNAGAR_SOAP]
  );
});

after(async () => {
  try {
    if (server) await new Promise<void>((r) => server.close(() => r()));
    if (db) {
      await db.exec('DELETE FROM stock_moves WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM product_barcodes WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM stock_transfer_lines WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM stock_transfers WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM number_series WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM items WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM users WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM branches WHERE tenant_id = ?', [TEST_TENANT]);
      await db.exec('DELETE FROM tenants WHERE id = ?', [TEST_TENANT]);
      await db.close();
    }
  } catch {}
  process.exit(0);
});

let trfMainToAnnaId = '';
let trfAnnaToMainId = '';
let trfTnagarToAnnaId = '';

test('Test 1: Main Branch creates transfer to Anna Nagar. Only Anna Nagar can accept it.', async () => {
  // 1. Create transfer from Main to Anna Nagar (10 bags of Rice)
  const createRes = await api('POST', '/api/stock-transfers', {}, {
    fromBranch: 'MAIN',
    toBranch: 'ANNA',
    lines: [{ itemId: ITEM_MAIN_RICE, qty: 10 }]
  }, mainMgrToken);

  assert.equal(createRes.status, 200);
  assert.ok(createRes.body.success);
  trfMainToAnnaId = createRes.body.transferId;
  assert.ok(trfMainToAnnaId);

  // 2. Before acceptance: destination branch (Anna Nagar) does NOT have the stock
  const annaStockBefore = await api('GET', '/api/stock-transfers/branch-stock?branch=ANNA', {}, undefined, ownerToken);
  assert.ok(!annaStockBefore.body.items.some((i: any) => i.id === ITEM_MAIN_RICE), 'Anna Nagar must not receive stock before acceptance');

  // 3. Anna Nagar accepts the transfer
  const acceptRes = await api('POST', `/api/stock-transfers/${trfMainToAnnaId}/accept`, {}, {}, annaMgrToken);
  assert.equal(acceptRes.status, 200);
  assert.equal(acceptRes.body.status, 'completed');

  // 4. After acceptance:
  // - Main Branch stock deducted by 10 (from 50 to 40)
  const mainStockAfter = await api('GET', '/api/stock-transfers/branch-stock?branch=MAIN', {}, undefined, ownerToken);
  const mainRice = mainStockAfter.body.items.find((i: any) => i.id === ITEM_MAIN_RICE);
  assert.equal(mainRice.availableStockUnits, 40, 'Main Branch stock must be deducted to 40 units');

  // - Anna Nagar stock increased by 10
  const annaStockAfter = await api('GET', '/api/stock-transfers/branch-stock?branch=ANNA', {}, undefined, ownerToken);
  const annaRice = annaStockAfter.body.items.find((i: any) => i.id === ITEM_MAIN_RICE);
  assert.ok(annaRice, 'Anna Nagar now has the transferred rice');
  assert.equal(annaRice.availableStockUnits, 10, 'Anna Nagar stock must be 10 units');
});

test('Test 2: Anna Nagar creates transfer to Main Branch. Only Main Branch can accept it.', async () => {
  // 1. Anna Nagar creates transfer to Main Branch (5 pouches of Oil)
  const createRes = await api('POST', '/api/stock-transfers', {}, {
    fromBranch: 'ANNA',
    toBranch: 'MAIN',
    lines: [{ itemId: ITEM_ANNA_OIL, qty: 5 }]
  }, annaMgrToken);

  assert.equal(createRes.status, 200);
  assert.ok(createRes.body.success);
  trfAnnaToMainId = createRes.body.transferId;

  // 2. T. Nagar tries to accept -> Rejected (403)
  const tnagarTry = await api('POST', `/api/stock-transfers/${trfAnnaToMainId}/accept`, {}, {}, tnagarMgrToken);
  assert.equal(tnagarTry.status, 403);

  // 3. Anna Nagar tries to accept its own outgoing transfer -> Rejected (403)
  const annaTry = await api('POST', `/api/stock-transfers/${trfAnnaToMainId}/accept`, {}, {}, annaMgrToken);
  assert.equal(annaTry.status, 403);

  // 4. Main Branch (destination) accepts -> Success (200)
  const mainAccept = await api('POST', `/api/stock-transfers/${trfAnnaToMainId}/accept`, {}, {}, mainMgrToken);
  assert.equal(mainAccept.status, 200);
  assert.equal(mainAccept.body.status, 'completed');

  // Check stocks
  const annaStock = await api('GET', '/api/stock-transfers/branch-stock?branch=ANNA', {}, undefined, ownerToken);
  const annaOil = annaStock.body.items.find((i: any) => i.id === ITEM_ANNA_OIL);
  assert.equal(annaOil.availableStockUnits, 35, 'Anna Nagar oil deducted from 40 to 35');

  const mainStock = await api('GET', '/api/stock-transfers/branch-stock?branch=MAIN', {}, undefined, ownerToken);
  const mainOil = mainStock.body.items.find((i: any) => i.id === ITEM_ANNA_OIL);
  assert.equal(mainOil.availableStockUnits, 5, 'Main Branch oil increased to 5');
});

test('Test 3: T. Nagar creates transfer to Anna Nagar. Only Anna Nagar can accept it.', async () => {
  // 1. T. Nagar creates transfer to Anna Nagar (15 soaps)
  const createRes = await api('POST', '/api/stock-transfers', {}, {
    fromBranch: 'TNAGAR',
    toBranch: 'ANNA',
    lines: [{ itemId: ITEM_TNAGAR_SOAP, qty: 15 }]
  }, tnagarMgrToken);

  assert.equal(createRes.status, 200);
  assert.ok(createRes.body.success);
  trfTnagarToAnnaId = createRes.body.transferId;

  // 2. Main Branch tries to accept -> Rejected (403)
  const mainTry = await api('POST', `/api/stock-transfers/${trfTnagarToAnnaId}/accept`, {}, {}, mainMgrToken);
  assert.equal(mainTry.status, 403);

  // 3. T. Nagar (source) tries to accept -> Rejected (403)
  const tnagarTry = await api('POST', `/api/stock-transfers/${trfTnagarToAnnaId}/accept`, {}, {}, tnagarMgrToken);
  assert.equal(tnagarTry.status, 403);

  // 4. Anna Nagar (destination) accepts -> Success (200)
  const annaAccept = await api('POST', `/api/stock-transfers/${trfTnagarToAnnaId}/accept`, {}, {}, annaMgrToken);
  assert.equal(annaAccept.status, 200);
  assert.equal(annaAccept.body.status, 'completed');
});

test('Test 4: Main Branch opens Transfer List. It sees only incoming and outgoing transfers involving Main Branch.', async () => {
  // Main Branch queries transfer list
  const res = await api('GET', '/api/stock-transfers', {}, undefined, mainMgrToken);
  assert.equal(res.status, 200);
  const list = res.body.transfers;
  assert.ok(Array.isArray(list));

  const transferIds = list.map((t: any) => t.id);

  // Main -> Anna must be visible (Main is source)
  assert.ok(transferIds.includes(trfMainToAnnaId), 'Main -> Anna must be visible in Main Branch list');

  // Anna -> Main must be visible (Main is destination)
  assert.ok(transferIds.includes(trfAnnaToMainId), 'Anna -> Main must be visible in Main Branch list');

  // T. Nagar -> Anna Nagar must NOT be visible (Main is neither source nor destination)
  assert.ok(!transferIds.includes(trfTnagarToAnnaId), 'T. Nagar -> Anna Nagar must NOT be visible in Main Branch list');
});

test('Test 5: Switch from Main Branch to Anna Nagar. Transfer List and Create New Transfer must immediately reflect Anna Nagar.', async () => {
  // Super Admin viewing Main Branch scope
  const mainScopeRes = await api('GET', '/api/stock-transfers', { 'x-branch-id': BRANCH_MAIN }, undefined, ownerToken);
  assert.equal(mainScopeRes.status, 200);
  const mainIds = mainScopeRes.body.transfers.map((t: any) => t.id);
  assert.ok(mainIds.includes(trfMainToAnnaId));
  assert.ok(!mainIds.includes(trfTnagarToAnnaId), 'T. Nagar -> Anna Nagar must not appear in Main scope');

  // Super Admin switches to Anna Nagar scope
  const annaScopeRes = await api('GET', '/api/stock-transfers', { 'x-branch-id': BRANCH_ANNA }, undefined, ownerToken);
  assert.equal(annaScopeRes.status, 200);
  const annaIds = annaScopeRes.body.transfers.map((t: any) => t.id);

  // Anna Nagar must see Main -> Anna, Anna -> Main, and T. Nagar -> Anna
  assert.ok(annaIds.includes(trfMainToAnnaId), 'Main -> Anna must be in Anna Nagar list');
  assert.ok(annaIds.includes(trfAnnaToMainId), 'Anna -> Main must be in Anna Nagar list');
  assert.ok(annaIds.includes(trfTnagarToAnnaId), 'T. Nagar -> Anna must be in Anna Nagar list');
});

test('Test 6: Try accepting a Main → Anna Nagar transfer using Main Branch API credentials. Backend must reject the request.', async () => {
  // Create another transfer from Main to Anna Nagar
  const trf = await api('POST', '/api/stock-transfers', {}, {
    fromBranch: 'MAIN',
    toBranch: 'ANNA',
    lines: [{ itemId: ITEM_MAIN_RICE, qty: 2 }]
  }, mainMgrToken);
  assert.equal(trf.status, 200);
  const trfId = trf.body.transferId;

  // Try to accept with Main Branch manager token -> Must be rejected with 403 Forbidden
  const rejectRes = await api('POST', `/api/stock-transfers/${trfId}/accept`, {}, {}, mainMgrToken);
  assert.equal(rejectRes.status, 403);
  const msg = rejectRes.body.error?.message || rejectRes.body.message || '';
  assert.match(msg, /Only destination branch/i);

  // Try to accept with Super Admin scoped to Main Branch -> Must be rejected with 403 Forbidden
  const rejectSuperRes = await api('POST', `/api/stock-transfers/${trfId}/accept`, { 'x-branch-id': 'MAIN' }, {}, ownerToken);
  assert.equal(rejectSuperRes.status, 403);
});

test('Test 7: Try accepting the same transfer twice. The second attempt must be rejected without changing stock again.', async () => {
  // Create a transfer from Main to Anna Nagar (5 bags of rice)
  const trf = await api('POST', '/api/stock-transfers', {}, {
    fromBranch: 'MAIN',
    toBranch: 'ANNA',
    lines: [{ itemId: ITEM_MAIN_RICE, qty: 5 }]
  }, mainMgrToken);
  assert.equal(trf.status, 200);
  const trfId = trf.body.transferId;

  // Stock before first accept
  const mainStockBefore = await api('GET', '/api/stock-transfers/branch-stock?branch=MAIN', {}, undefined, ownerToken);
  const riceBefore = mainStockBefore.body.items.find((i: any) => i.id === ITEM_MAIN_RICE).availableStockUnits;

  // First accept by Anna Nagar -> Success (200)
  const firstAccept = await api('POST', `/api/stock-transfers/${trfId}/accept`, {}, {}, annaMgrToken);
  assert.equal(firstAccept.status, 200);
  assert.equal(firstAccept.body.status, 'completed');

  // Stock after first accept
  const mainStockAfter1 = await api('GET', '/api/stock-transfers/branch-stock?branch=MAIN', {}, undefined, ownerToken);
  const riceAfter1 = mainStockAfter1.body.items.find((i: any) => i.id === ITEM_MAIN_RICE).availableStockUnits;
  assert.equal(riceAfter1, riceBefore - 5, 'Main stock decreased by 5 after first accept');

  // Second accept attempt -> MUST be rejected (409 Conflict)
  const secondAccept = await api('POST', `/api/stock-transfers/${trfId}/accept`, {}, {}, annaMgrToken);
  assert.equal(secondAccept.status, 409);
  const msg = secondAccept.body.error?.message || secondAccept.body.message || '';
  assert.match(msg, /already been accepted/i);

  // Stock after second accept attempt -> MUST REMAIN UNCHANGED
  const mainStockAfter2 = await api('GET', '/api/stock-transfers/branch-stock?branch=MAIN', {}, undefined, ownerToken);
  const riceAfter2 = mainStockAfter2.body.items.find((i: any) => i.id === ITEM_MAIN_RICE).availableStockUnits;
  assert.equal(riceAfter2, riceAfter1, 'Stock must NOT be deducted a second time');
});
