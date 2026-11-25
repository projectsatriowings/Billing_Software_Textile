import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

test('bulk barcode UI: verify CSS tokens, media queries, and role themes', () => {
  const cssPath = path.resolve('client/src/components/bulk-barcode.css');
  assert.ok(fs.existsSync(cssPath), 'bulk-barcode.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify Admin Deep Plum theme
  assert.ok(css.includes('#49364A'), 'Admin Deep Plum primary (#49364A) must be defined');
  assert.ok(css.includes('--bb-primary-soft: #F5EDF4'), 'Admin plum soft background must be defined');
  assert.ok(css.includes('--bb-primary-border: #D8CBD8'), 'Admin plum border must be defined');

  // Verify Store Manager Deep Burgundy theme
  assert.ok(css.includes('#653B4B'), 'Store Manager Deep Burgundy primary (#653B4B) must be defined');
  assert.ok(css.includes('--bb-primary-soft: #F5ECF0'), 'Store Manager burgundy soft background must be defined');
  assert.ok(css.includes('--bb-primary-border: #D9C8D0'), 'Store Manager burgundy border must be defined');

  // Verify role scoped selectors
  assert.ok(css.includes('.theme-manager'), 'Must support .theme-manager selector');
  assert.ok(css.includes('.theme-admin') || css.includes('.theme-super-admin'), 'Must support .theme-admin selector');

  // Verify Flexbox layout & Sticky Footer (Prevents button clipping)
  assert.ok(css.includes('display: flex'), 'Dialog must use flexbox');
  assert.ok(css.includes('flex-direction: column'), 'Dialog must be flex column');
  assert.ok(css.includes('flex-shrink: 0'), 'Footer and header must have flex-shrink: 0');
  assert.ok(css.includes('flex: 1 1 0') || css.includes('flex: 1'), 'Main body must take remaining height');
  assert.ok(css.includes('overflow-y: auto'), 'Panels must scroll independently');

  // Verify Safe Area support (Android/iOS)
  assert.ok(css.includes('env(safe-area-inset-top)'), 'Must support env(safe-area-inset-top)');
  assert.ok(css.includes('env(safe-area-inset-bottom)'), 'Must support env(safe-area-inset-bottom)');

  // Verify Responsive Breakpoints
  assert.ok(css.includes('@media screen and (max-width: 860px)'), 'Tablet breakpoint (<= 860px / 768px) must be defined');
  assert.ok(css.includes('@media screen and (max-width: 600px)'), 'Mobile breakpoint (<= 600px / 430px / 390px) must be defined');
  assert.ok(css.includes('@media screen and (max-width: 380px)'), 'Small mobile breakpoint (<= 380px / 360px) must be defined');

  // Verify Footer buttons have minHeight and disabled states
  assert.ok(css.includes('.bulk-barcode-btn:disabled'), 'Must style disabled button state');
  assert.ok(css.includes('.bulk-barcode-btn-primary'), 'Primary button must be styled');
  assert.ok(css.includes('.bulk-barcode-btn-secondary'), 'Secondary button must be styled');
});

test('bulk barcode UI: verify BulkBarcodeModal component integrates theme and responsive classes', () => {
  const tsxPath = path.resolve('client/src/components/BulkBarcodeModal.tsx');
  assert.ok(fs.existsSync(tsxPath), 'BulkBarcodeModal.tsx must exist');
  const tsx = fs.readFileSync(tsxPath, 'utf8');

  // Verify CSS import
  assert.ok(tsx.includes("import './bulk-barcode.css'"), 'Must import bulk-barcode.css');

  // Verify role detection
  assert.ok(tsx.includes('isManager'), 'Must detect manager role');
  assert.ok(tsx.includes('theme-manager'), 'Must apply theme-manager class');
  assert.ok(tsx.includes('theme-admin'), 'Must apply theme-admin class');

  // Verify mobile sub-tab state
  assert.ok(tsx.includes('mobileSubTab'), 'Must have mobileSubTab state for tablet & mobile');

  // Verify semantic class names
  assert.ok(tsx.includes('bulk-barcode-backdrop'), 'Must have bulk-barcode-backdrop class');
  assert.ok(tsx.includes('bulk-barcode-dialog'), 'Must have bulk-barcode-dialog class');
  assert.ok(tsx.includes('bulk-barcode-header'), 'Must have bulk-barcode-header class');
  assert.ok(tsx.includes('bulk-barcode-config'), 'Must have bulk-barcode-config class');
  assert.ok(tsx.includes('bulk-barcode-footer'), 'Must have bulk-barcode-footer class');
  assert.ok(tsx.includes('bulk-print-confirm-btn'), 'Must preserve bulk-print-confirm-btn ID');
});
