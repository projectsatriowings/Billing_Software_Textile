import assert from 'node:assert/strict';
import http from 'node:http';
import test, { after, before } from 'node:test';
import { createApp } from '../src/app.ts';
import { connectDb, type DB } from '../src/db/index.ts';
import { signToken, hashPassword, passwordStamp, newId } from '../src/security.ts';
import { DEFAULT_ROLE_MODULE_ACCESS } from '../../shared/modules.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-long-enough-32-chars-at-least';
const TEST_TENANT = 't_mod_test_' + Date.now();
const BRANCH_MAIN = 'b_main_mod_' + Date.now();

let db: DB;
let server: http.Server;
let base = '';
let ownerToken = '';
let managerToken = '';
let cashierToken = '';
let ownerId = '';
let managerId = '';
let cashierId = '';

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
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, body: json };
}

before(async () => {
  db = await connectDb();

  // Create tenant
  await db.exec(
    "INSERT INTO tenants (id, name, invoice_prefix, state_code) VALUES (?, 'Module Access Test Store', 'MAT', '33')",
    [TEST_TENANT]
  );

  // Create main branch
  await db.exec(
    "INSERT INTO branches (id, tenant_id, code, name, active) VALUES (?, ?, 'MAIN', 'Main Central Branch', true)",
    [BRANCH_MAIN, TEST_TENANT]
  );

  const pwd = hashPassword('TestPass123!');
  const stamp = passwordStamp(pwd);

  ownerId = 'u_owner_' + Date.now();
  await db.exec(
    "INSERT INTO users (id, tenant_id, branch_id, name, email, password_hash, role, active) VALUES (?, ?, ?, 'Sangeetha SuperAdmin', ?, ?, 'owner', true)",
    [ownerId, TEST_TENANT, BRANCH_MAIN, `owner_${Date.now()}@test.com`, pwd]
  );
  ownerToken = signToken({ sub: ownerId, tid: TEST_TENANT, role: 'owner', ph: stamp, branchId: BRANCH_MAIN }, JWT_SECRET, 3600);

  managerId = 'u_mgr_' + Date.now();
  await db.exec(
    "INSERT INTO users (id, tenant_id, branch_id, name, email, password_hash, role, active) VALUES (?, ?, ?, 'Kavitha Manager', ?, ?, 'manager', true)",
    [managerId, TEST_TENANT, BRANCH_MAIN, `mgr_${Date.now()}@test.com`, pwd]
  );
  managerToken = signToken({ sub: managerId, tid: TEST_TENANT, role: 'manager', ph: stamp, branchId: BRANCH_MAIN }, JWT_SECRET, 3600);

  cashierId = 'u_csh_' + Date.now();
  await db.exec(
    "INSERT INTO users (id, tenant_id, branch_id, name, email, password_hash, role, active) VALUES (?, ?, ?, 'Anitha Cashier', ?, ?, 'cashier', true)",
    [cashierId, TEST_TENANT, BRANCH_MAIN, `csh_${Date.now()}@test.com`, pwd]
  );
  cashierToken = signToken({ sub: cashierId, tid: TEST_TENANT, role: 'cashier', ph: stamp, branchId: BRANCH_MAIN }, JWT_SECRET, 3600);

  server = http.createServer(createApp(db, { secret: JWT_SECRET, log: false }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as any;
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('1. GET /api/module-access returns complete role access mapping', async () => {
  const res = await api('GET', '/api/module-access', {}, undefined, ownerToken);
  assert.equal(res.status, 200);
  assert.ok(res.body.success);
  assert.ok(res.body.access);

  // Check structure for 3 roles
  assert.ok(res.body.access.owner);
  assert.ok(res.body.access.manager);
  assert.ok(res.body.access.cashier);

  // Super Admin defaults
  assert.equal(res.body.access.owner.settings, true);
  assert.equal(res.body.access.owner.dashboard, true);

  // Cashier defaults
  assert.equal(res.body.access.cashier.pos, true);
  assert.equal(res.body.access.cashier.dashboard, false);
});

test('2. PUT /api/module-access rejects non-superadmin users with 403', async () => {
  const updatePayload = {
    access: {
      ...DEFAULT_ROLE_MODULE_ACCESS,
    },
  };

  const mgrRes = await api('PUT', '/api/module-access', {}, updatePayload, managerToken);
  assert.equal(mgrRes.status, 403);

  const cshRes = await api('PUT', '/api/module-access', {}, updatePayload, cashierToken);
  assert.equal(cshRes.status, 403);
});

test('3. PUT /api/module-access strictly rejects attempts to disable Settings for Super Admin', async () => {
  const maliciousPayload = {
    access: {
      ...DEFAULT_ROLE_MODULE_ACCESS,
      owner: {
        ...DEFAULT_ROLE_MODULE_ACCESS.owner,
        settings: false, // Illegal attempt
      },
    },
  };

  const res = await api('PUT', '/api/module-access', {}, maliciousPayload, ownerToken);
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'SETTINGS_LOCKED');
});

test('4. Super Admin can update module access for roles and changes persist', async () => {
  const newConfig = {
    ...DEFAULT_ROLE_MODULE_ACCESS,
    manager: {
      ...DEFAULT_ROLE_MODULE_ACCESS.manager,
      promotions: false, // Disable promotions module for Store Manager
    },
  };

  const putRes = await api('PUT', '/api/module-access', {}, { access: newConfig }, ownerToken);
  assert.equal(putRes.status, 200);
  assert.ok(putRes.body.success);
  assert.equal(putRes.body.access.manager.promotions, false);

  // Verify GET returns updated configuration
  const getRes = await api('GET', '/api/module-access', {}, undefined, managerToken);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.access.manager.promotions, false);
});

test('5. Backend middleware blocks access to disabled modules with 403 MODULE_DISABLED', async () => {
  // Store Manager hitting /api/promotions when promotions is disabled for manager
  const blockedRes = await api('GET', '/api/promotions', {}, undefined, managerToken);
  assert.equal(blockedRes.status, 403);
  assert.equal(blockedRes.body.error?.code, 'MODULE_DISABLED');

  // Super Admin hitting /api/promotions is unblocked
  const ownerRes = await api('GET', '/api/promotions', {}, undefined, ownerToken);
  assert.equal(ownerRes.status, 200);

  // Re-enable promotions for manager
  const restoreConfig = {
    ...DEFAULT_ROLE_MODULE_ACCESS,
    manager: {
      ...DEFAULT_ROLE_MODULE_ACCESS.manager,
      promotions: true,
    },
  };
  const putRes = await api('PUT', '/api/module-access', {}, { access: restoreConfig }, ownerToken);
  assert.equal(putRes.status, 200);

  // Store Manager can now hit /api/promotions again
  const allowedRes = await api('GET', '/api/promotions', {}, undefined, managerToken);
  assert.equal(allowedRes.status, 200);
});
