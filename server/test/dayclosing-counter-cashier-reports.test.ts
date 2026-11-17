import assert from 'node:assert/strict';
import http from 'node:http';
import test, { after, before } from 'node:test';
import { createApp } from '../src/app.ts';
import { connectWire } from '../src/db/wire.ts';
import { migrate, type DB } from '../src/db/index.ts';
import { startTestDb, type TestDb } from './support/testdb.ts';

let pg: TestDb | null = null;
let db: DB;
let server: http.Server;
let base = '';
let ownerToken = '';
let cashier1Token = '';
let cashier2Token = '';
let tenantId = '';
let branchId = '';
let cashier1Id = '';
let cashier2Id = '';
let counter1Id = '';
let counter2Id = '';

before(async () => {
  try {
  pg = await startTestDb();
  if (!pg) throw new Error('Local test database could not be started');
  db = await connectWire(pg.url);
  await migrate(db);

  server = http.createServer(createApp(db, { secret: 'test-secret-dayclosing-reports-2026', log: false }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;

  // 1. Register Owner
  const regRes = await api('POST', '/api/auth/register', {
    name: 'Day Closing Reports Supermarket',
    ownerName: 'Priya Admin',
    email: 'admin@reportsclosing.com',
    password: 'Password123!',
    businessType: 'supermarket',
  });
  assert.equal(regRes.status, 200);
  ownerToken = regRes.body.token;
  tenantId = regRes.body.shop.id;

  // 2. Fetch Branch
  const branchesRes = await api('GET', '/api/branches', undefined, ownerToken);
  branchId = branchesRes.body.branches?.[0]?.id || 'MAIN';

  // 3. Create Counters
  const c1Res = await api('POST', '/api/counters', {
    name: 'Counter Express 01',
    code: 'CNT-01',
    branchId,
  }, ownerToken);
  counter1Id = c1Res.body.id || 'CNT-01';

  const c2Res = await api('POST', '/api/counters', {
    name: 'Counter Retail 02',
    code: 'CNT-02',
    branchId,
  }, ownerToken);
  counter2Id = c2Res.body.id || 'CNT-02';

  // 4. Create Two Cashiers
  const cash1Res = await api('POST', '/api/users', {
    name: 'Kavitha Cashier',
    email: 'kavitha@reportsclosing.com',
    password: 'Password123!',
    role: 'cashier',
    branchId,
    assignedLocation: branchId,
  }, ownerToken);
  assert.equal(cash1Res.status, 200);
  cashier1Id = cash1Res.body.id;

  const cash2Res = await api('POST', '/api/users', {
    name: 'Sangeetha Cashier',
    email: 'sangeetha@reportsclosing.com',
    password: 'Password123!',
    role: 'cashier',
    branchId,
    assignedLocation: branchId,
  }, ownerToken);
  assert.equal(cash2Res.status, 200);
  cashier2Id = cash2Res.body.id;

  const login1 = await api('POST', '/api/auth/login', {
    identifier: 'kavitha@reportsclosing.com',
    password: 'Password123!',
  });
  cashier1Token = login1.body.token;

  const login2 = await api('POST', '/api/auth/login', {
    identifier: 'sangeetha@reportsclosing.com',
    password: 'Password123!',
  });
  cashier2Token = login2.body.token;

  // 5. Create Product
  const itemRes = await api('POST', '/api/items', {
    name: 'Organic Milk 1L',
    sku: 'MILK-1L',
    priceMinor: 6000,
    costMinor: 4500,
    taxRateBps: 500,
  }, ownerToken);
  const itemId = itemRes.body.id;

  // 6. Create Transactions on 2026-11-17:
  // Transaction A: Cashier 1 on Counter 1 (₹1,200 Cash)
  const today = '2026-11-17';
  await db.exec(
    `INSERT INTO invoices (
      id, tenant_id, branch_id, client_id, rule_version, share_token, number, bdate, status, kind,
      subtotal_minor, total_minor, paid_minor, taxable_minor,
      cgst_minor, sgst_minor, igst_minor, discount_minor, created_by, counter, counter_id, counter_name_snapshot, created_at
    ) VALUES ('inv_test_c1', ?, ?, 'cli_c1', '1.0', 'tok_c1', 'INV-001', ?, 'posted', 'sale', 12000, 12000, 12000, 11428, 286, 286, 0, 0, ?, 'CNT-01', ?, 'Counter Express 01', now())`,
    [tenantId, branchId, today, cashier1Id, counter1Id],
  );
  await db.exec(
    `INSERT INTO invoice_lines (id, tenant_id, branch_id, invoice_id, pos, item_id, name, qty_milli, price_minor, cost_minor, total_minor, taxable_minor, tax_rate_bp, inclusive)
     VALUES ('il_test_c1', ?, ?, 'inv_test_c1', 0, ?, 'Organic Milk 1L', 2000, 6000, 4500, 12000, 11428, 500, true)`,
    [tenantId, branchId, itemId],
  );
  await db.exec(
    `INSERT INTO payments (id, tenant_id, branch_id, invoice_id, bdate, kind, method, amount_minor, created_by, counter, counter_id, created_at)
     VALUES ('pay_test_c1', ?, ?, 'inv_test_c1', ?, 'receipt', 'cash', 12000, ?, 'CNT-01', ?, now())`,
    [tenantId, branchId, today, cashier1Id, counter1Id],
  );

  // Transaction B: Cashier 2 on Counter 2 (₹1,800 UPI)
  await db.exec(
    `INSERT INTO invoices (
      id, tenant_id, branch_id, client_id, rule_version, share_token, number, bdate, status, kind,
      subtotal_minor, total_minor, paid_minor, taxable_minor,
      cgst_minor, sgst_minor, igst_minor, discount_minor, created_by, counter, counter_id, counter_name_snapshot, created_at
    ) VALUES ('inv_test_c2', ?, ?, 'cli_c2', '1.0', 'tok_c2', 'INV-002', ?, 'posted', 'sale', 18000, 18000, 18000, 17142, 429, 429, 0, 0, ?, 'CNT-02', ?, 'Counter Retail 02', now())`,
    [tenantId, branchId, today, cashier2Id, counter2Id],
  );
  await db.exec(
    `INSERT INTO invoice_lines (id, tenant_id, branch_id, invoice_id, pos, item_id, name, qty_milli, price_minor, cost_minor, total_minor, taxable_minor, tax_rate_bp, inclusive)
     VALUES ('il_test_c2', ?, ?, 'inv_test_c2', 0, ?, 'Organic Milk 1L', 3000, 6000, 4500, 18000, 17142, 500, true)`,
    [tenantId, branchId, itemId],
  );
  await db.exec(
    `INSERT INTO payments (id, tenant_id, branch_id, invoice_id, bdate, kind, method, amount_minor, created_by, counter, counter_id, created_at)
     VALUES ('pay_test_c2', ?, ?, 'inv_test_c2', ?, 'receipt', 'upi', 18000, ?, 'CNT-02', ?, now())`,
    [tenantId, branchId, today, cashier2Id, counter2Id],
  );

  // Transaction C: Unassigned Counter Exception (₹600 Card)
  await db.exec(
    `INSERT INTO invoices (
      id, tenant_id, branch_id, client_id, rule_version, share_token, number, bdate, status, kind,
      subtotal_minor, total_minor, paid_minor, taxable_minor,
      cgst_minor, sgst_minor, igst_minor, discount_minor, created_by, counter, counter_id, created_at
    ) VALUES ('inv_test_unassigned', ?, ?, 'cli_c3', '1.0', 'tok_c3', 'INV-003', ?, 'posted', 'sale', 6000, 6000, 6000, 5714, 143, 143, 0, 0, ?, NULL, NULL, now())`,
    [tenantId, branchId, today, cashier1Id],
  );
  await db.exec(
    `INSERT INTO invoice_lines (id, tenant_id, branch_id, invoice_id, pos, item_id, name, qty_milli, price_minor, cost_minor, total_minor, taxable_minor, tax_rate_bp, inclusive)
     VALUES ('il_test_unassigned', ?, ?, 'inv_test_unassigned', 0, ?, 'Organic Milk 1L', 1000, 6000, 4500, 6000, 5714, 500, true)`,
    [tenantId, branchId, itemId],
  );
  await db.exec(
    `INSERT INTO payments (id, tenant_id, branch_id, invoice_id, bdate, kind, method, amount_minor, created_by, counter, counter_id, created_at)
     VALUES ('pay_test_unassigned', ?, ?, 'inv_test_unassigned', ?, 'receipt', 'card', 6000, ?, NULL, NULL, now())`,
    [tenantId, branchId, today, cashier1Id],
  );
  } catch (err) {
    console.error('BEFORE HOOK ERROR:', err);
    throw err;
  }
});

after(async () => {
  if (server) {
    (server as any).closeAllConnections?.();
    await new Promise<void>((r) => server.close(() => r()));
  }
  if (pg) pg.stop();
});

test('1. Counter-wise Sales Report isolates transactions by counter and separates unassigned exceptions', async () => {
  const res = await api('GET', `/api/day-closing/counter-sales?branchId=${branchId}&date=2026-11-17`, undefined, ownerToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.counters.length, 3); // CNT-01, CNT-02, UNASSIGNED

  // CNT-01 check
  const c1 = res.body.counters.find((c: any) => c.counterCode === 'CNT-01');
  assert.ok(c1, 'CNT-01 counter exists in report');
  assert.equal(c1.invoicesCount, 1);
  assert.equal(c1.netSalesMinor, 12000);
  assert.equal(c1.collections.cash, 12000);
  assert.equal(c1.collections.upi, 0);

  // CNT-02 check
  const c2 = res.body.counters.find((c: any) => c.counterCode === 'CNT-02');
  assert.ok(c2, 'CNT-02 counter exists in report');
  assert.equal(c2.invoicesCount, 1);
  assert.equal(c2.netSalesMinor, 18000);
  assert.equal(c2.collections.upi, 18000);
  assert.equal(c2.collections.cash, 0);

  // Unassigned exception check
  const unassigned = res.body.counters.find((c: any) => c.isException === true);
  assert.ok(unassigned, 'Unassigned counter group isolated');
  assert.equal(unassigned.netSalesMinor, 6000);
  assert.equal(unassigned.collections.card, 6000);
  assert.equal(res.body.exceptionCount, 1);

  // Consolidated total matches exact sum (12000 + 18000 + 6000 = 36000)
  assert.equal(res.body.consolidatedTotal.grossSalesMinor, 36000);
  assert.equal(res.body.consolidatedTotal.netSalesMinor, 36000);
  assert.equal(res.body.consolidatedTotal.invoicesCount, 3);
  assert.equal(res.body.consolidatedTotal.collections.cash, 12000);
  assert.equal(res.body.consolidatedTotal.collections.upi, 18000);
  assert.equal(res.body.consolidatedTotal.collections.card, 6000);
  assert.equal(res.body.consolidatedTotal.collections.total, 36000);
});

test('2. Cashier-wise Sales Report isolates transactions by cashier attribution without mixing', async () => {
  const res = await api('GET', `/api/day-closing/cashier-sales?branchId=${branchId}&date=2026-11-17`, undefined, ownerToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  // Cashier 1 has transaction A (12000) + transaction C (6000) = 18000
  const k1 = res.body.cashiers.find((c: any) => c.cashierId === cashier1Id);
  assert.ok(k1, 'Kavitha cashier exists');
  assert.equal(k1.invoicesCount, 2);
  assert.equal(k1.netSalesMinor, 18000);
  assert.equal(k1.collections.cash, 12000);
  assert.equal(k1.collections.card, 6000);

  // Cashier 2 has transaction B (18000)
  const k2 = res.body.cashiers.find((c: any) => c.cashierId === cashier2Id);
  assert.ok(k2, 'Sangeetha cashier exists');
  assert.equal(k2.invoicesCount, 1);
  assert.equal(k2.netSalesMinor, 18000);
  assert.equal(k2.collections.upi, 18000);

  // Consolidated matches exact total with zero discrepancies
  assert.equal(res.body.consolidatedTotal.netSalesMinor, 36000);
  assert.equal(res.body.consolidatedTotal.invoicesCount, 3);
});

test('3. Smart Day Closing Schedule & Reminder Settings API gets and saves config', async () => {
  // Save custom schedule
  const saveRes = await api('POST', '/api/day-closing/schedules', {
    branchId,
    expectedClosingTime: '21:30',
    firstReminderMinutesBefore: 45,
    secondReminderMinutesBefore: 20,
    finalReminderAtClosing: true,
    overdueReminderIntervalMinutes: 25,
    autoAlertOverdue: true,
    enabled: true,
  }, ownerToken);
  assert.equal(saveRes.status, 200);
  assert.equal(saveRes.body.success, true);
  assert.equal(saveRes.body.schedule.expectedClosingTime, '21:30');

  // Fetch saved schedule
  const getRes = await api('GET', `/api/day-closing/schedules?branchId=${branchId}`, undefined, ownerToken);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.schedule.expectedClosingTime, '21:30');
  assert.equal(getRes.body.schedule.firstReminderMinutesBefore, 45);
});

test('4. Closing Compliance Monitoring reports accurate register matrix & completion %', async () => {
  const compRes = await api('GET', `/api/day-closing/compliance?branchId=${branchId}&date=2026-11-17`, undefined, ownerToken);
  assert.equal(compRes.status, 200);
  assert.equal(compRes.body.success, true);
  assert.equal(compRes.body.expectedClosingTime, '21:30');
  assert.ok(compRes.body.summary.totalRegisters >= 2);
  assert.ok(Array.isArray(compRes.body.cashierMatrix));
});

test('5. In-app reminders trigger notification creation and cashier unread count updates', async () => {
  // Send reminder to Cashier 1
  const sendRes = await api('POST', '/api/day-closing/send-reminder', {
    branchId,
    cashierId: cashier1Id,
    date: '2026-11-17',
    reminderType: 'final',
    message: 'Time to seal your register for today.',
  }, ownerToken);
  assert.equal(sendRes.status, 200);
  assert.equal(sendRes.body.success, true);

  // Cashier 1 fetches notifications
  const notifRes = await api('GET', `/api/day-closing/notifications?branchId=${branchId}`, undefined, cashier1Token);
  assert.equal(notifRes.status, 200);
  assert.ok(notifRes.body.notifications.length >= 1);
  const myNotif = notifRes.body.notifications.find((n: any) => n.id === sendRes.body.notificationId);
  assert.ok(myNotif);
  assert.equal(myNotif.title, 'Final Closing Reminder');

  // Cashier marks notification read
  const readRes = await api('POST', `/api/day-closing/notifications/${myNotif.id}/read`, {}, cashier1Token);
  assert.equal(readRes.status, 200);
});

async function api(method: string, path: string, body?: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
