import test from 'node:test';
import assert from 'node:assert/strict';

// Pure routing logic extracted from App.tsx handleLocationChange & initAuth (Landing page completely removed)
function resolveRoute(path: string, hashWithPound: string, token: string | null = null, role: string = 'SUPER_ADMIN') {
  const hash = hashWithPound.replace('#', '');
  const isUserManagementRoute = path === '/user-management' || hash === 'user-management';
  const isStockTransferRoute = path === '/stock-transfer' || hash === 'stock-transfer';

  if (!token) {
    // Unauthenticated user: Default route is strictly 'login'
    if (hash === 'register') {
      return { view: 'register', tab: null };
    }
    return { view: 'login', tab: null };
  }

  // Authenticated user
  if (hash === 'login' || hash === 'cashier-login' || hash.startsWith('login')) {
    return { view: 'login', tab: null };
  }
  if (hash === 'register') {
    return { view: 'register', tab: null };
  }
  if (isUserManagementRoute) {
    return { view: 'dashboard', tab: 'user-management' };
  }
  if (isStockTransferRoute) {
    return { view: 'dashboard', tab: 'stock-transfer' };
  }
  if (hash === 'dashboard' || path === '/' || !hash || hash === 'landing') {
    return { view: 'dashboard', tab: 'dashboard' };
  }
  return { view: hash, tab: null };
}

test('1. Open application root (/) unauthenticated -> Login page displays directly', () => {
  const res = resolveRoute('/', '', null);
  assert.equal(res.view, 'login');
});

test('2. Open /user-management unauthenticated -> Login page displays directly', () => {
  const res = resolveRoute('/user-management', '', null);
  assert.equal(res.view, 'login');
});

test('3. Open legacy #landing URL unauthenticated -> Redirects/defaults directly to login', () => {
  const res = resolveRoute('/', '#landing', null);
  assert.equal(res.view, 'login');
});

test('4. Refreshing the application unauthenticated keeps user on Login page', () => {
  const res = resolveRoute('/', '', null);
  assert.equal(res.view, 'login');
});

test('5. Register navigation remains accessible at #register', () => {
  const res = resolveRoute('/', '#register', null);
  assert.equal(res.view, 'register');
});

test('6. Authenticated access to / opens dashboard', () => {
  const res = resolveRoute('/', '', 'valid_token');
  assert.equal(res.view, 'dashboard');
});

test('7. Authenticated access to /user-management opens user-management tab', () => {
  const res = resolveRoute('/user-management', '', 'valid_token');
  assert.equal(res.view, 'dashboard');
  assert.equal(res.tab, 'user-management');
});
