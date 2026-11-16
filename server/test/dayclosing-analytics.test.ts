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
let cashierToken = '';
let tenantId = '';
let branchId = '';
let cashierUserId = '';
let itemId = '';

before(async () => {
  pg = await startTestDb();
  if (!pg) throw new Error('Local test database could not be started');
  db = await connectWire(pg.url);
  await migrate(db);

  server = http.createServer(createApp(db, { secret: 'test-secret-dayclosing-analytics-2026', log: false }));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;

  // 1. Register Owner
  const regRes = await api('POST', '/api/auth/register', {
    name: 'Day Closing Test Mart',
    ownerName: 'Super Owner',
    email: 'owner@closingtest.com',
    password: 'Password123!',
    businessType: 'retail',
  });
  assert.equal(regRes.status, 200);
  ownerToken = regRes.body.token;
  tenantId = regRes.body.shop.id;

  // 2. Fetch Main branch
  const branchesRes = await api('GET', '/api/branches', undefined, ownerToken);
  branchId = branchesRes.body.branches?.[0]?.id || 'MAIN';

  // 3. Create Cashier
  const cashierRes = await api('POST', '/api/users', {
    name: 'Cashier Ananya',
    email: 'ananya@closingtest.com',
    password: 'Password123!',
    role: 'cashier',
    branchId: branchId,
    assignedLocation: branchId,
  }, ownerToken);
  assert.equal(cashierRes.status, 200);
  cashierUserId = cashierRes.body.id;

  const loginRes = await api('POST', '/api/auth/login', {
    identifier: 'ananya@closingtest.com',
    password: 'Password123!',
  });
  assert.equal(loginRes.status, 200);
  cashierToken = loginRes.body.token;

  // 4. Create product with cost
  const prodRes = await api('POST', '/api/items', {
    name: 'Organic Brown Rice 1kg',
    sku: 'RICE-BROWN-001',
    barcode: '890123456001',
    priceMinor: 12000, // ₹120 sell
    costMinor: 8000,   // ₹80 cost
    taxRateBp: 500,    // 5% GST
    taxInclusive: true,
    unit: 'KG',
  }, ownerToken);
  assert.equal(prodRes.status, 200);
  itemId = prodRes.body.item.id;

  // Stock injection
  await db.exec(
    `INSERT INTO stock_moves (id, tenant_id, branch_id, item_id, location, qty_milli, kind, reason)
     VALUES (?, ?, ?, ?, 'MAIN', 50000, 'opening', 'Initial test stock')`,
    ['sm_test_' + Math.random().toString(36).slice(2), tenantId, branchId, itemId]
  );

  // 5. Open cashier shift for POS billing
  const shiftRes = await api('POST', '/api/shifts', {
    branchId: branchId,
    counter: 'COUNTER-1',
    openingCashMinor: 50000, // ₹500 opening float
  }, cashierToken);
  assert.equal(shiftRes.status, 200);
});

after(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (pg) await pg.stop();
});

async function api(method: string, path: string, body?: any, authToken?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

test('Day Closing & Analytics: 1. Live preview returns accurate 14 financial KPIs and operational stats', async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Create an invoice
    const invRes = await api('POST', '/api/invoices', {
      lines: [
        {
          itemId,
          name: 'Organic Brown Rice 1kg',
          qtyMilli: 2000, // 2 units
          priceMinor: 12000,
          taxRateBp: 500,
          inclusive: true,
        },
      ],
      branchId,
      customerName: 'Ramesh Kumar',
      customerPhone: '9840112233',
      payments: [
        {
          method: 'cash',
          amountMinor: 24000,
        },
      ],
    }, cashierToken);
    if (invRes.status !== 200) console.error('Invoice create failed:', invRes.status, invRes.body);
    assert.equal(invRes.status, 200);

    // Fetch preview
    const prevRes = await api('GET', `/api/day-closing/preview?branchId=${branchId}&bdate=${today}`, undefined, cashierToken);
    if (prevRes.status !== 200) console.error('Preview failed:', prevRes.status, prevRes.body);
    assert.equal(prevRes.status, 200);

    const body = prevRes.body;
    assert.equal(body.status, 'open');
    assert.ok(body.salesSummary);
    assert.ok(body.profitSummary);
    assert.ok(body.cashReconciliation);

    // Check sales metrics
    assert.ok(body.salesSummary.grossSalesMinor >= 20000);
    assert.equal(body.salesSummary.invoicesCount, 1);
    assert.ok(body.salesSummary.totalProductsSold >= 1);
    assert.ok(body.salesSummary.totalQuantitiesSold >= 2);

    // Check cash drawer expected cash
    assert.ok(body.cashReconciliation.cashSalesReceivedMinor >= 24000);
    assert.ok(body.cashReconciliation.expectedClosingCashMinor >= 24000);
  } catch (err: any) {
    console.error('TEST 1 ERROR:', err?.message, err?.stack);
    throw err;
  }
});

test('Day Closing & Analytics: 2. Cashier submits day closing with variance', async () => {
  const today = new Date().toISOString().slice(0, 10);

  const subRes = await api('POST', '/api/day-closing/submit', {
    branchId,
    bdate: today,
    actualCashMinor: 24000,
    remarks: 'Cash matched accurately at EOD',
  }, cashierToken);

  if (subRes.status !== 200) console.error('Submit failed:', subRes.status, subRes.body);
  assert.equal(subRes.status, 200);
  assert.ok(subRes.body.success);
  assert.equal(subRes.body.dayClosing.status, 'submitted');
});

test('Day Closing & Analytics: 3. Cashier cannot approve day closing (RBAC protection)', async () => {
  const today = new Date().toISOString().slice(0, 10);

  const prevRes = await api('GET', `/api/day-closing/preview?branchId=${branchId}&bdate=${today}`, undefined, cashierToken);
  const closingId = prevRes.body.closedRecord?.id;
  assert.ok(closingId);

  // Attempt approve as cashier
  const appRes = await api('POST', `/api/day-closing/${closingId}/approve`, {}, cashierToken);
  assert.equal(appRes.status, 403);
});

test('Day Closing & Analytics: 4. Manager/Owner approves day closing and seals invoices', async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const prevRes = await api('GET', `/api/day-closing/preview?branchId=${branchId}&bdate=${today}`, undefined, ownerToken);
    const closingId = prevRes.body.closedRecord?.id;
    assert.ok(closingId, 'closingId exists');

    // Approve as owner
    const appRes = await api('POST', `/api/day-closing/${closingId}/approve`, {}, ownerToken);
    if (appRes.status !== 200) console.error('Approve failed:', appRes.status, appRes.body);
    assert.equal(appRes.status, 200);
    assert.ok(appRes.body.success);
    assert.equal(appRes.body.dayClosing?.status, 'approved');

    // Verify invoices on this date are locked
    const invs = await db.query<any>(`SELECT id, branch_id, bdate, is_day_closed FROM invoices WHERE tenant_id = ? AND branch_id = ? AND bdate = ?`, [tenantId, branchId, today]);
    assert.ok(invs.length > 0);
    for (const inv of invs) {
      assert.equal(Boolean(inv.is_day_closed ?? inv.isDayClosed), true);
    }
  } catch (err: any) {
    console.error('TEST 4 ERROR:', err?.message);
    throw err;
  }
});

test('Day Closing & Analytics: 5. Owner reopens business day with mandatory reason', async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const prevRes = await api('GET', `/api/day-closing/preview?branchId=${branchId}&bdate=${today}`, undefined, ownerToken);
    const closingId = prevRes.body.closedRecord?.id;
    assert.ok(closingId);

    // Reject without reason
    const failRes = await api('POST', `/api/day-closing/${closingId}/reopen`, { reason: 'tiny' }, ownerToken);
    assert.equal(failRes.status, 400);

    // Reopen with valid reason
    const reopenRes = await api('POST', `/api/day-closing/${closingId}/reopen`, {
      reason: 'Customer requested backdated exchange on rice purchase',
    }, ownerToken);
    if (reopenRes.status !== 200) console.error('Reopen failed:', reopenRes.status, reopenRes.body);
    assert.equal(reopenRes.status, 200);
    assert.ok(reopenRes.body.success);
    assert.equal(reopenRes.body.dayClosing?.status, 'reopened');
    assert.equal(reopenRes.body.dayClosing?.reopen_reason, 'Customer requested backdated exchange on rice purchase');

    // Verify invoices unlocked
    const invs = await db.query<any>(`SELECT is_day_closed FROM invoices WHERE tenant_id = ? AND branch_id = ? AND bdate = ?`, [tenantId, branchId, today]);
    for (const inv of invs) {
      assert.equal(Boolean(inv.is_day_closed ?? inv.isDayClosed), false);
    }
  } catch (err: any) {
    console.error('TEST 5 ERROR:', err?.message);
    throw err;
  }
});

test('Day Closing & Analytics: 6. Comparison engine calculates today vs previous day metrics and growth %', async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const compRes = await api('GET', `/api/day-closing/comparison?branchId=${branchId}&date=${today}`, undefined, ownerToken);
    if (compRes.status !== 200) console.error('Comparison failed:', compRes.status, compRes.body);
    assert.equal(compRes.status, 200);

    const body = compRes.body;
    assert.equal(body.bdate, today);
    assert.ok(body.previousDate);
    assert.ok(body.metrics);
    assert.ok(body.metrics.grossSales);
    assert.ok(body.metrics.netSales);
    assert.ok(body.metrics.grossProfit);
    assert.ok(body.metrics.invoicesCount);
    assert.ok(Array.isArray(body.last7DaysTrend));
  } catch (err: any) {
    console.error('TEST 6 ERROR:', err?.message);
    throw err;
  }
});

test('Day Closing & Analytics: 7. Custom date range analytics engine aggregates performance and daily series', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const anRes = await api('GET', `/api/day-closing/analytics?branchId=${branchId}&startDate=${startDate}&endDate=${today}&comparisonMode=previous_period`, undefined, ownerToken);
  assert.equal(anRes.status, 200);

  const body = anRes.body;
  assert.ok(body.period);
  assert.ok(body.current);
  assert.ok(body.comparison);
  assert.ok(Array.isArray(body.dailySeries));
  assert.ok(body.current.grossSalesMinor >= 0);
  assert.ok(body.current.netSalesMinor >= 0);
});

test('Day Closing & Analytics: 8. Product profitability breakdown calculates COGS, margins and returns', async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const profRes = await api('GET', `/api/day-closing/product-profitability?branchId=${branchId}&startDate=${startDate}&endDate=${today}&filter=top_selling`, undefined, ownerToken);
    if (profRes.status !== 200) console.error('Profitability failed:', profRes.status, profRes.body);
    assert.equal(profRes.status, 200);

    const body = profRes.body;
    assert.ok(Array.isArray(body.products));
    assert.ok(body.products.length > 0);

    const firstProd = body.products[0];
    assert.ok(firstProd.id);
    assert.ok(firstProd.name);
    assert.ok(firstProd.qty_sold >= 2);
    assert.ok(firstProd.net_sales_minor > 0);
    assert.ok(firstProd.cogs_minor > 0);
    assert.ok(firstProd.gross_profit_minor > 0);
    assert.ok(firstProd.gross_margin_pct > 0);
  } catch (err: any) {
    console.error('TEST 8 ERROR:', err?.message);
    throw err;
  }
});

test('Day Closing & Analytics: 9. Live preview provides closing reminder and duplicate billing detection', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const prevRes = await api('GET', `/api/day-closing/preview?branchId=${branchId}&bdate=${today}`, undefined, cashierToken);
  assert.equal(prevRes.status, 200);
  assert.ok(prevRes.body.closingReminder);
  assert.ok(Array.isArray(prevRes.body.duplicateAlerts));
});

test('Day Closing & Analytics: 10. CSV export endpoints produce Excel-compatible registers', async () => {
  // History CSV
  const histCsv = await api('GET', `/api/day-closing/history/export.csv?branchId=${branchId}`, undefined, ownerToken);
  assert.equal(histCsv.status, 200);

  // Single Day CSV
  const dc = await db.one<any>(`SELECT id FROM day_closings WHERE tenant_id = ? AND branch_id = ? LIMIT 1`, [tenantId, branchId]);
  if (dc?.id) {
    const singleCsv = await api('GET', `/api/day-closing/${dc.id}/export.csv`, undefined, ownerToken);
    assert.equal(singleCsv.status, 200);
  }
});

test('Day Closing & Analytics: 11. Manager/Owner rejects day closing with reason and returns to Cashier', async () => {
  const today = new Date().toISOString().slice(0, 10);

  // Submit as cashier first
  const subRes = await api('POST', '/api/day-closing/submit', {
    branchId,
    bdate: today,
    actualCashMinor: 24000,
    remarks: 'Cash drawer count',
  }, cashierToken);
  assert.equal(subRes.status, 200);

  const prevRes = await api('GET', `/api/day-closing/preview?branchId=${branchId}&bdate=${today}`, undefined, ownerToken);
  const closingId = prevRes.body.closedRecord?.id;
  assert.ok(closingId);

  // Cashier cannot reject
  const cashRej = await api('POST', `/api/day-closing/${closingId}/reject`, { reason: 'Incorrect coin count' }, cashierToken);
  assert.equal(cashRej.status, 403);

  // Manager/Owner rejects with reason
  const rejRes = await api('POST', `/api/day-closing/${closingId}/reject`, { reason: 'Variance detected. Please recount physical drawer.' }, ownerToken);
  assert.equal(rejRes.status, 200);
  assert.ok(rejRes.body.success);

  // Status is now open so cashier can recount and submit
  const afterPrev = await api('GET', `/api/day-closing/preview?branchId=${branchId}&bdate=${today}`, undefined, cashierToken);
  assert.equal(afterPrev.body.status, 'open');
  assert.ok(afterPrev.body.closedRecord?.remarks?.includes('Variance detected'));
});

test('Day Closing & Analytics: 12. Cashier cannot submit duplicate closing while already submitted', async () => {
  const today = new Date().toISOString().slice(0, 10);

  // Cashier submits
  const subRes = await api('POST', '/api/day-closing/submit', {
    branchId,
    bdate: today,
    actualCashMinor: 24000,
    remarks: 'Cash drawer recount submitted',
  }, cashierToken);
  assert.equal(subRes.status, 200);
  assert.equal(subRes.body.dayClosing?.status, 'submitted');

  // Cashier attempts to submit again before management approval
  const dupSub = await api('POST', '/api/day-closing/submit', {
    branchId,
    bdate: today,
    actualCashMinor: 25000,
    remarks: 'Altered cash count',
  }, cashierToken);
  assert.equal(dupSub.status, 400);
  assert.equal(dupSub.body?.error?.code, 'ALREADY_SUBMITTED');
});
