import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

test('Android native system bars: verify MainActivity.java dynamic role & navigation bar support', () => {
  const javaPath = path.resolve('android/app/src/main/java/com/a2z/billing/MainActivity.java');
  assert.ok(fs.existsSync(javaPath), 'MainActivity.java must exist');
  const java = fs.readFileSync(javaPath, 'utf8');

  // Verify JavascriptInterface class and method
  assert.ok(java.includes('class SystemBarsBridge'), 'Must declare SystemBarsBridge class');
  assert.ok(java.includes('@JavascriptInterface'), 'Must annotate with @JavascriptInterface');
  assert.ok(java.includes('public void setSystemBars'), 'Must have setSystemBars method');
  assert.ok(java.includes('"AndroidSystemBars"'), 'Must register AndroidSystemBars bridge name');

  // Verify dynamic bar color & icon mode
  assert.ok(java.includes('private int currentBarColor'), 'Must track currentBarColor state');
  assert.ok(java.includes('private boolean currentLightBackground'), 'Must track currentLightBackground state');
  assert.ok(java.includes('getWindow().setStatusBarColor(currentBarColor)'), 'Must update status bar color');
  assert.ok(java.includes('getWindow().setNavigationBarColor(currentBarColor)'), 'Must update navigation bar color');
  assert.ok(java.includes('controller.setAppearanceLightStatusBars(currentLightBackground)'), 'Must set light/dark status bar icons');
  assert.ok(java.includes('controller.setAppearanceLightNavigationBars(currentLightBackground)'), 'Must set light/dark nav bar buttons');

  // Verify SharedPreferences persistence to prevent launch glitches
  assert.ok(java.includes('a2z_system_bars'), 'Must persist system bar settings in SharedPreferences');
  assert.ok(java.includes('KEY_BAR_COLOR'), 'Must persist bar color key');
  assert.ok(java.includes('KEY_LIGHT_BG'), 'Must persist light bg key');

  // Verify lifecycle synchronization
  assert.ok(java.includes('public void onResume()'), 'Must reapply on resume');
  assert.ok(java.includes('public void onConfigurationChanged('), 'Must reapply on configuration change');
});

test('Frontend role theme & system bars: verify App.tsx role-based colors and transitions', () => {
  const appPath = path.resolve('client/src/App.tsx');
  assert.ok(fs.existsSync(appPath), 'App.tsx must exist');
  const app = fs.readFileSync(appPath, 'utf8');

  // Verify applyRoleSystemBars helper
  assert.ok(app.includes('export const applyRoleSystemBars ='), 'Must export applyRoleSystemBars helper');
  assert.ok(app.includes('#FAF8FA'), 'Super Admin color #FAF8FA must be defined');
  assert.ok(app.includes('#EFE7EB'), 'Store Manager color #EFE7EB must be defined');
  assert.ok(app.includes('#0F2D2E'), 'Default/Cashier color #0F2D2E must be defined');

  // Verify Super Admin logic
  assert.ok(app.includes("r === 'owner' || r === 'admin' || r === 'super_admin'"), 'Must handle all Super Admin role variants');

  // Verify Store Manager logic
  assert.ok(app.includes("r === 'manager' || r === 'store_manager'"), 'Must handle all Store Manager role variants');

  // Verify Capacitor StatusBar and AndroidSystemBars bridge invocations
  assert.ok(app.includes('StatusBar.setStyle('), 'Must set Capacitor StatusBar style');
  assert.ok(app.includes('StatusBar.setBackgroundColor('), 'Must set Capacitor StatusBar background color');
  assert.ok(app.includes('AndroidSystemBars') && app.includes('.setSystemBars('), 'Must call native AndroidSystemBars bridge');

  // Verify role synchronization effect triggers on [user?.role, view]
  assert.ok(app.includes('applyRoleSystemBars(user?.role, isLoginPage)'), 'Effect must trigger system bar sync with role and view');

  // Verify initial mount uses applyRoleSystemBars instead of hardcoded dark teal
  assert.ok(
    app.includes('applyRoleSystemBars(user?.role, view === \'login\''),
    'Mount effect must invoke applyRoleSystemBars dynamically'
  );
});
