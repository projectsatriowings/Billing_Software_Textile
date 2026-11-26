// Permanent branch deletion (DELETE /api/branches/:id).
// Builds a throwaway shop (id t_brdel_test_<ts>, removed again in after()) with branches covering:
// no dependencies, counters + counter logins, cashiers with/without history, an assigned manager,
// products with/without stock history, bills/payments/shifts, stock transfers, promotions, and a
// branch whose deletion must be refused. Checks history is kept, other branches are untouched and
// a failed delete changes nothing.
import assert from 'node:assert/strict';
import http from 'node:http';
import test, { after, before } from 'node:test';
import { createApp } from '../src/app.ts';
import { connectDb, type DB } from '../src/db/index.ts';
import { signToken, hashPassword, passwordStamp } from '../src/security.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-long-enough-32-chars-at-least';
const TS = Date.now();
const T = `t_brdel_test_${TS}`;
const id = (p: string) => `${p}_${TS}`;

const B_MAIN = id('br_main');
const B_EMPTY = id('br_empty');
const B_FULL = id('br_full');
const B_BLOCKED = id('br_blocked');
const B_FAIL = id('br_fail');
const FAIL_TABLE = `zz_brdel_test_ref_${TS}`;

let db: DB;
let server: http.Server;
let base = '';
let ownerToken = '';

async function call(method: string, path: string) {
  const res = await fetch(base + path, { method, headers: { authorization: `Bearer ${ownerToken}` } });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body };
}
const one = (sql: string, params: unknown[] = []) => db.one<any>(sql, params);
const count = async (sql: string, params: unknown[] = []) => Number((await db.one<any>(sql, params))?.n ?? 0);

async function seedBranch(branchId: string, code: string, name: string) {
  await db.exec('INSERT INTO branches (id, tenant_id, name, code, active) VALUES (?, ?, ?, ?, true)', [branchId, T, name, code]);
}

async function addUser(uid: string, branchId: string | null, role: string, extra: { username?: string; counterId?: string } = {}) {
  await db.exec(
    `INSERT INTO users (id, tenant_id, branch_id, name, username, email, password_hash, role, active, counter_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, true, ?)`,
    [uid, T, branchId, `User ${uid}`, extra.username ?? null, `${uid}@brdel.test`, hashPassword('Passw0rd!x'), role, extra.counterId ?? null],
  );
}

let invoiceSeq = 0;
async function addBill(branchId: string, createdBy: string, itemId: string | null, counterId: string | null) {
  const inv = id(`inv${++invoiceSeq}`);
  await db.exec(
    `INSERT INTO invoices (id, tenant_id, client_id, number, kind, bdate, subtotal_minor, taxable_minor, total_minor,
                           rule_version, share_token, branch_id, created_by, counter_id, status)
     VALUES (?, ?, ?, ?, 'sale', '2026-11-26', 1000, 1000, 1000, 'v1', ?, ?, ?, ?, 'posted')`,
    [inv, T, inv, `BRDEL-${TS}-${invoiceSeq}`, inv, branchId, createdBy, counterId],
  );
  await db.exec(
    `INSERT INTO invoice_lines (id, tenant_id, invoice_id, pos, name, qty_milli, price_minor, tax_rate_bp, inclusive, taxable_minor, total_minor, item_id, branch_id)
     VALUES (?, ?, ?, 1, 'Line', 1000, 1000, 0, false, 1000, 1000, ?, ?)`,
    [inv + '_l1', T, inv, itemId, branchId],
  );
  await db.exec(
    `INSERT INTO payments (id, tenant_id, method, amount_minor, kind, invoice_id, branch_id, created_by)
     VALUES (?, ?, 'cash', 1000, 'receipt', ?, ?, ?)`,
    [inv + '_p1', T, inv, branchId, createdBy],
  );
  return inv;
}

// Removes every row of the throwaway shop, retrying tables that are still referenced.
async function removeTestShop() {
  await db.exec(`DROP TABLE IF EXISTS ${FAIL_TABLE}`).catch(() => {});
  await db.exec('UPDATE branches SET manager_id = NULL WHERE tenant_id = ?', [T]).catch(() => {});
  await db.exec('UPDATE users SET counter_id = NULL, branch_id = NULL WHERE tenant_id = ?', [T]).catch(() => {});
  const tables = (await db.query<any>(
    "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenant_id' AND table_name <> 'tenants'",
  )).map((r) => r.tableName ?? r.table_name);
  let pending = [...tables];
  for (let pass = 0; pending.length && pass <= tables.length; pass++) {
    const failed: string[] = [];
    for (const t of pending) {
      try { await db.exec(`DELETE FROM "${t}" WHERE tenant_id = ?`, [T]); } catch { failed.push(t); }
    }
    pending = failed;
  }
  await db.exec('DELETE FROM tenants WHERE id = ?', [T]);
}

before(async () => {
  db = await connectDb();
  server = http.createServer(createApp(db, { secret: JWT_SECRET, log: false }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;

  await db.exec("INSERT INTO tenants (id, name, business_type) VALUES (?, 'Branch Delete Test Store', 'supermarket')", [T]);
  await seedBranch(B_MAIN, 'MAIN', 'Main Branch');
  await seedBranch(B_EMPTY, 'EMPTY', 'Empty Branch');
  await seedBranch(B_FULL, 'FULL', 'Full Branch');
  await seedBranch(B_BLOCKED, 'BLOCKED', 'Blocked Branch');
  await seedBranch(B_FAIL, 'FAILING', 'Failing Branch');

  const owner = id('u_owner');
  await addUser(owner, B_MAIN, 'owner');
  const ownerRow = await one('SELECT password_hash FROM users WHERE id = ?', [owner]);
  ownerToken = signToken({ sub: owner, tid: T, ph: passwordStamp(ownerRow.passwordHash ?? ownerRow.password_hash), role: 'owner' }, JWT_SECRET, 3600);

  // MAIN: its own counter, cashier, product and bill — must survive every delete untouched.
  await db.exec("INSERT INTO counters (id, tenant_id, branch_id, name, code, status) VALUES (?, ?, ?, 'Main C1', 'MAIN-C01', 'ACTIVE')", [id('cnt_main'), T, B_MAIN]);
  await addUser(id('u_main_cashier'), B_MAIN, 'cashier', { username: `brdel_main_${TS}` });
  await db.exec("INSERT INTO items (id, tenant_id, name, branch_id, active) VALUES (?, ?, 'Main Product', ?, true)", [id('it_main'), T, B_MAIN]);
  await db.exec("INSERT INTO stock_moves (id, tenant_id, item_id, qty_milli, kind, branch_id, location) VALUES (?, ?, ?, 5000, 'opening', ?, 'MAIN')", [id('sm_main'), T, id('it_main'), B_MAIN]);
  await addBill(B_MAIN, id('u_main_cashier'), id('it_main'), id('cnt_main'));

  // FULL: everything a real branch has.
  const cnt = id('cnt_full');
  await db.exec("INSERT INTO counters (id, tenant_id, branch_id, name, code, status, login_username) VALUES (?, ?, ?, 'Full C1', 'FULL-C01', 'ACTIVE', ?)", [cnt, T, B_FULL, `brdel_cnt_${TS}`]);
  await addUser(id('u_counter_login'), B_FULL, 'counter', { username: `brdel_cnt_${TS}`, counterId: cnt });
  await addUser(id('u_cashier_hist'), B_FULL, 'cashier', { username: `brdel_hist_${TS}` });
  await addUser(id('u_cashier_new'), B_FULL, 'cashier', { username: `brdel_new_${TS}` });
  await addUser(id('u_manager'), B_FULL, 'manager', { username: `brdel_mgr_${TS}` });
  await db.exec('UPDATE branches SET manager_id = ? WHERE id = ?', [id('u_manager'), B_FULL]);
  await db.exec("INSERT INTO categories (id, tenant_id, name, branch_id) VALUES (?, ?, ?, ?)", [id('cat_full'), T, `Full Cat ${TS}`, B_FULL]);
  await db.exec("INSERT INTO items (id, tenant_id, name, branch_id, active) VALUES (?, ?, 'Sold Product', ?, true)", [id('it_hist'), T, B_FULL]);
  await db.exec("INSERT INTO items (id, tenant_id, name, branch_id, active) VALUES (?, ?, 'Unused Product', ?, true)", [id('it_new'), T, B_FULL]);
  await db.exec("INSERT INTO product_barcodes (id, tenant_id, product_id, barcode, branch_id, barcode_type) VALUES (?, ?, ?, ?, ?, 'MANUFACTURER')", [id('pb_new'), T, id('it_new'), `89${TS}`, B_FULL]);
  await db.exec("INSERT INTO stock_moves (id, tenant_id, item_id, qty_milli, kind, branch_id, location) VALUES (?, ?, ?, 9000, 'opening', ?, 'MAIN')", [id('sm_full'), T, id('it_hist'), B_FULL]);
  await db.exec("INSERT INTO number_series (tenant_id, series, branch_id, next_no) VALUES (?, 'FULL', ?, 5)", [T, B_FULL]);
  await db.exec("INSERT INTO promotions (id, tenant_id, name, type, start_date, end_date, branch_id) VALUES (?, ?, 'Unused promo', 'percentage', '2026-11-01', '2026-12-31', ?)", [id('promo_full'), T, B_FULL]);
  await db.exec("INSERT INTO parties (id, tenant_id, type, name, branch_id) VALUES (?, ?, 'customer', 'Full Customer', ?)", [id('party_full'), T, B_FULL]);
  await db.exec("INSERT INTO card_terminals (id, tenant_id, branch_id, name, provider, connection_mode) VALUES (?, ?, ?, 'Full POS', 'mock', 'standalone')", [id('term_full'), T, B_FULL]);
  await db.exec("INSERT INTO shifts (id, tenant_id, user_id, branch_id, counter, counter_id, status) VALUES (?, ?, ?, ?, 'FULL-C01', ?, 'closed')", [id('shf_full'), T, id('u_cashier_hist'), B_FULL, cnt]);
  await addBill(B_FULL, id('u_cashier_hist'), id('it_hist'), cnt);
  await db.exec(
    "INSERT INTO stock_transfers (id, tenant_id, transfer_number, from_branch, to_branch, requested_by, status) VALUES (?, ?, ?, ?, ?, ?, 'completed')",
    [id('trf_full'), T, `TRF-${TS}`, B_FULL, B_MAIN, id('u_manager')],
  );
  await db.exec("INSERT INTO stock_transfer_lines (id, tenant_id, transfer_id, item_id, qty_milli) VALUES (?, ?, ?, ?, 1000)", [id('trfl_full'), T, id('trf_full'), id('it_hist')]);

  // BLOCKED: a promotion that was already used on a bill must stay tied to the branch.
  await db.exec("INSERT INTO counters (id, tenant_id, branch_id, name, code, status) VALUES (?, ?, ?, 'Blocked C1', 'BLK-C01', 'ACTIVE')", [id('cnt_blk'), T, B_BLOCKED]);
  await addUser(id('u_blk_cashier'), B_BLOCKED, 'cashier', { username: `brdel_blk_${TS}` });
  const blkBill = await addBill(B_BLOCKED, id('u_blk_cashier'), null, id('cnt_blk'));
  await db.exec("INSERT INTO promotions (id, tenant_id, name, type, start_date, end_date, branch_id) VALUES (?, ?, 'Used promo', 'percentage', '2026-11-01', '2026-12-31', ?)", [id('promo_blk'), T, B_BLOCKED]);
  await db.exec("INSERT INTO promotion_usage (id, tenant_id, promotion_id, invoice_id, discount_minor) VALUES (?, ?, ?, ?, 100)", [id('pu_blk'), T, id('promo_blk'), blkBill]);

  // FAILING: a table the delete code does not know about still points at the branch, so the delete
  // must fail late (after many changes) and roll ALL of them back.
  await db.exec("INSERT INTO counters (id, tenant_id, branch_id, name, code, status) VALUES (?, ?, ?, 'Fail C1', 'FAIL-C01', 'ACTIVE')", [id('cnt_fail'), T, B_FAIL]);
  await addUser(id('u_fail_cashier'), B_FAIL, 'cashier', { username: `brdel_fail_${TS}` });
  await addBill(B_FAIL, id('u_fail_cashier'), null, id('cnt_fail'));
  await db.exec(`CREATE TABLE ${FAIL_TABLE} (id TEXT PRIMARY KEY, branch_id TEXT NOT NULL REFERENCES branches(id))`);
  await db.exec(`INSERT INTO ${FAIL_TABLE} (id, branch_id) VALUES ('x', ?)`, [B_FAIL]);
});

after(async () => {
  try { await removeTestShop(); } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await db.close();
  }
});

test('nonexistent branch returns 404', async () => {
  const r = await call('DELETE', `/api/branches/${id('br_nope')}?confirm=NOPE`);
  assert.equal(r.status, 404);
});

test('missing or wrong confirmation code is refused and deletes nothing', async () => {
  const missing = await call('DELETE', `/api/branches/${B_EMPTY}`);
  assert.equal(missing.status, 400);
  assert.equal(missing.body?.error?.code, 'CONFIRMATION_REQUIRED');
  const wrong = await call('DELETE', `/api/branches/${B_EMPTY}?confirm=WRONG`);
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body?.error?.code, 'CONFIRMATION_MISMATCH');
  assert.equal(await count('SELECT count(*)::int AS n FROM branches WHERE id = ?', [B_EMPTY]), 1);
});

test('MAIN branch is protected', async () => {
  const r = await call('DELETE', `/api/branches/${B_MAIN}?confirm=MAIN`);
  assert.equal(r.status, 400);
  assert.equal(r.body?.error?.code, 'MAIN_PROTECTED');
});

test('delete impact reports counters, cashiers and the assigned manager', async () => {
  const r = await call('GET', `/api/branches/${B_FULL}/delete-impact`);
  assert.equal(r.status, 200);
  assert.equal(r.body.countersCount, 1);
  assert.equal(r.body.counterLoginsCount, 1);
  assert.equal(r.body.cashiersCount, 2);
  assert.equal(r.body.managerName, `User ${id('u_manager')}`);
  assert.equal(r.body.canDelete, true);
  assert.equal(r.body.billsCount, 1);
});

test('branch with no dependencies is deleted', async () => {
  const r = await call('DELETE', `/api/branches/${B_EMPTY}?confirm=empty`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await count('SELECT count(*)::int AS n FROM branches WHERE id = ?', [B_EMPTY]), 0);
});

test('genuine dependency gives a clear 409 and changes nothing', async () => {
  const impact = await call('GET', `/api/branches/${B_BLOCKED}/delete-impact`);
  assert.equal(impact.body.canDelete, false);
  assert.equal(impact.body.blockers[0].key, 'used_promotions');

  const r = await call('DELETE', `/api/branches/${B_BLOCKED}?confirm=BLOCKED`);
  assert.equal(r.status, 409);
  assert.equal(r.body?.error?.code, 'BRANCH_HAS_DEPENDENCIES');
  assert.match(r.body.error.message, /dependent records still exist.*promotions already used/);
  assert.equal(await count('SELECT count(*)::int AS n FROM branches WHERE id = ?', [B_BLOCKED]), 1);
  assert.equal(await count('SELECT count(*)::int AS n FROM counters WHERE branch_id = ?', [B_BLOCKED]), 1);
  assert.equal(await count('SELECT count(*)::int AS n FROM users WHERE id = ? AND deleted_at IS NULL', [id('u_blk_cashier')]), 1);
});

test('failure late in the delete rolls everything back (no partial delete)', async () => {
  const r = await call('DELETE', `/api/branches/${B_FAIL}?confirm=FAILING`);
  assert.equal(r.status, 409);
  assert.equal(r.body?.error?.code, 'BRANCH_HAS_DEPENDENCIES');
  assert.ok(!/SQL|constraint|violates/i.test(r.body.error.message), 'no raw database error is exposed');
  // Everything the delete had already changed before failing is back.
  assert.equal(await count('SELECT count(*)::int AS n FROM branches WHERE id = ?', [B_FAIL]), 1);
  assert.equal(await count('SELECT count(*)::int AS n FROM counters WHERE branch_id = ?', [B_FAIL]), 1);
  assert.equal(await count('SELECT count(*)::int AS n FROM users WHERE id = ? AND branch_id = ? AND deleted_at IS NULL', [id('u_fail_cashier'), B_FAIL]), 1);
  assert.equal(await count('SELECT count(*)::int AS n FROM invoices WHERE tenant_id = ? AND branch_id = ?', [T, B_FAIL]), 1);
});

test('full branch: set-up removed, people handled, history kept, other branches untouched', async () => {
  const before = {
    mainCounters: await count('SELECT count(*)::int AS n FROM counters WHERE branch_id = ?', [B_MAIN]),
    mainItems: await count('SELECT count(*)::int AS n FROM items WHERE branch_id = ?', [B_MAIN]),
    mainBills: await count('SELECT count(*)::int AS n FROM invoices WHERE branch_id = ?', [B_MAIN]),
    mainStock: await count('SELECT COALESCE(SUM(qty_milli),0)::bigint AS n FROM stock_moves WHERE branch_id = ? OR (branch_id IS NULL AND location = ?)', [B_MAIN, 'MAIN']),
  };

  const r = await call('DELETE', `/api/branches/${B_FULL}?confirm=FULL`);
  assert.equal(r.status, 200, JSON.stringify(r.body));

  // Branch and its set-up are gone.
  assert.equal(await count('SELECT count(*)::int AS n FROM branches WHERE id = ?', [B_FULL]), 0);
  assert.equal(await count('SELECT count(*)::int AS n FROM counters WHERE id = ?', [id('cnt_full')]), 0);
  assert.equal(await count('SELECT count(*)::int AS n FROM categories WHERE id = ?', [id('cat_full')]), 0);
  assert.equal(await count('SELECT count(*)::int AS n FROM number_series WHERE tenant_id = ? AND series = ?', [T, 'FULL']), 0);
  assert.equal(await count('SELECT count(*)::int AS n FROM promotions WHERE id = ?', [id('promo_full')]), 0);
  assert.equal(await count('SELECT count(*)::int AS n FROM card_terminals WHERE id = ?', [id('term_full')]), 0);
  assert.equal(await count('SELECT count(*)::int AS n FROM product_barcodes WHERE id = ?', [id('pb_new')]), 0);

  // People: cashier with history deactivated (username freed), others deleted, manager only unassigned.
  const hist = await one('SELECT active, deleted_at, username, branch_id FROM users WHERE id = ?', [id('u_cashier_hist')]);
  assert.ok(hist, 'cashier with bills/shifts is kept for history');
  assert.equal(hist.active, false);
  assert.ok(hist.deletedAt ?? hist.deleted_at);
  assert.equal(hist.username, null);
  assert.equal(await count('SELECT count(*)::int AS n FROM users WHERE id = ?', [id('u_cashier_new')]), 0);
  assert.equal(await count('SELECT count(*)::int AS n FROM users WHERE id = ?', [id('u_counter_login')]), 0);
  const mgr = await one('SELECT active, deleted_at, branch_id FROM users WHERE id = ?', [id('u_manager')]);
  assert.equal(mgr.active, true);
  assert.equal(mgr.deletedAt ?? mgr.deleted_at ?? null, null);
  assert.equal(mgr.branchId ?? mgr.branch_id ?? null, null);

  // Products: unused one deleted, sold one kept but inactive.
  assert.equal(await count('SELECT count(*)::int AS n FROM items WHERE id = ?', [id('it_new')]), 0);
  const sold = await one('SELECT active, branch_id FROM items WHERE id = ?', [id('it_hist')]);
  assert.equal(sold.active, false);

  // History kept with the old names.
  const bill = await one(
    'SELECT branch_id, branch_name_snapshot, counter_name_snapshot, cashier_name_snapshot, counter_id FROM invoices WHERE tenant_id = ? AND created_by = ?',
    [T, id('u_cashier_hist')],
  );
  assert.equal(bill.branchId ?? bill.branch_id ?? null, null);
  assert.equal(bill.branchNameSnapshot ?? bill.branch_name_snapshot, 'Full Branch');
  assert.equal(bill.counterNameSnapshot ?? bill.counter_name_snapshot, 'Full C1');
  assert.equal(bill.cashierNameSnapshot ?? bill.cashier_name_snapshot, `User ${id('u_cashier_hist')}`);
  assert.equal(await count('SELECT count(*)::int AS n FROM payments WHERE tenant_id = ? AND created_by = ?', [T, id('u_cashier_hist')]), 1);
  const shift = await one('SELECT branch_name_snapshot FROM shifts WHERE id = ?', [id('shf_full')]);
  assert.equal(shift.branchNameSnapshot ?? shift.branch_name_snapshot, 'Full Branch');
  assert.equal(await count('SELECT count(*)::int AS n FROM stock_transfers WHERE id = ?', [id('trf_full')]), 1);
  assert.equal(await count('SELECT count(*)::int AS n FROM parties WHERE id = ?', [id('party_full')]), 1);
  const move = await one('SELECT branch_id, location FROM stock_moves WHERE id = ?', [id('sm_full')]);
  assert.equal(move.location, 'DELETED-FULL', 'old stock is not counted as MAIN stock via the location fallback');

  // Other branches untouched.
  assert.equal(await count('SELECT count(*)::int AS n FROM counters WHERE branch_id = ?', [B_MAIN]), before.mainCounters);
  assert.equal(await count('SELECT count(*)::int AS n FROM items WHERE branch_id = ?', [B_MAIN]), before.mainItems);
  assert.equal(await count('SELECT count(*)::int AS n FROM invoices WHERE branch_id = ?', [B_MAIN]), before.mainBills);
  assert.equal(
    await count('SELECT COALESCE(SUM(qty_milli),0)::bigint AS n FROM stock_moves WHERE branch_id = ? OR (branch_id IS NULL AND location = ?)', [B_MAIN, 'MAIN']),
    before.mainStock,
  );
  assert.equal(await count('SELECT count(*)::int AS n FROM users WHERE id = ? AND deleted_at IS NULL', [id('u_main_cashier')]), 1);

  // Deleted branch no longer listed.
  const list = await call('GET', '/api/branches');
  const ids = (list.body?.branches ?? list.body ?? []).map((b: any) => b.id);
  assert.ok(!ids.includes(B_FULL));
});
