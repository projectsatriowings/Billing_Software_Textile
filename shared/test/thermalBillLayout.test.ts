import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBillDoc, type PrintableBill } from '../bill.ts';
import type { PrintTemplate } from '../types.ts';

const tpl: PrintTemplate = {
  paper: 'thermal80',
  showHsn: false,
  showDiscount: true,
  showTaxBreakup: true,
  showUnit: true,
  qr: 'none',
  header: 'Super Store of Shopping World',
  footer: 'Thank you for shopping with us!',
  terms: 'E.&O.E.',
  copies: 1,
  language: 'en',
};

test('thermal receipt layout: numeric quantity only, GST column after RATE, no bottom GST breakdown', () => {
  const bill: PrintableBill = {
    number: 'INV-2026-001',
    dateText: '25 Nov 2026 04:30 pm',
    kind: 'sale',
    status: 'issued',
    shop: {
      name: 'A2Z Super Store',
      address: '123 Main Bazaar, Chennai',
      phone: '9876543210',
      gstin: '33AAAAA0000A1Z5',
      logoUrl: '',
    },
    customer: {
      name: 'Ramesh Kumar',
      phone: '9840012345',
      gstin: '',
    },
    lines: [
      {
        name: 'Tata Salt Vacuum Evaporated',
        qtyMilli: 1000, // 1 pkt
        unit: 'pkt',
        mrpMinor: 3300,
        priceMinor: 2800,
        taxRateBp: 0, // 0%
        taxableMinor: 2800,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 0,
        totalMinor: 2800,
        discountMinor: 0,
      },
      {
        name: 'Aashirvaad Superior MP Sharbati Atta 5kg',
        qtyMilli: 1000, // 1 bag
        unit: 'bag',
        mrpMinor: 31700,
        priceMinor: 27500,
        taxRateBp: 500, // 5%
        taxableMinor: 27500,
        cgstMinor: 688,
        sgstMinor: 687,
        igstMinor: 0,
        totalMinor: 28875,
        discountMinor: 0,
      },
    ],
    totals: {
      subtotalMinor: 30300,
      discountMinor: 0,
      taxableMinor: 30300,
      cgstMinor: 688,
      sgstMinor: 687,
      igstMinor: 0,
      roundOffMinor: 25,
      totalMinor: 31700,
      paidMinor: 31700,
      balanceMinor: 0,
    },
    payments: [
      { method: 'cash', amountMinor: 31700 },
    ],
    customFields: [
      { label: 'Counter', value: 'MAIN-POS' },
    ],
    intra: true,
  };

  const html = renderBillDoc(bill, tpl);

  // 1. Verify Table Header column ordering: NAME, QTY, MRP, RATE, %, AMT
  assert.ok(html.includes('<th class="col-name">NAME</th>'), 'Header must have NAME');
  assert.ok(html.includes('<th class="col-qty">QTY</th>'), 'Header must have QTY');
  assert.ok(html.includes('<th class="col-mrp">MRP</th>'), 'Header must have MRP');
  assert.ok(html.includes('<th class="col-store">RATE</th>'), 'Header must have RATE');
  assert.ok(html.includes('<th class="col-gst">%</th>'), 'Header must have % column');
  assert.ok(html.includes('<th class="col-total">AMT</th>'), 'Header must have AMT');

  // Verify column header sequence in HTML
  const nameIdx = html.indexOf('<th class="col-name">NAME</th>');
  const qtyIdx = html.indexOf('<th class="col-qty">QTY</th>');
  const mrpIdx = html.indexOf('<th class="col-mrp">MRP</th>');
  const rateIdx = html.indexOf('<th class="col-store">RATE</th>');
  const gstIdx = html.indexOf('<th class="col-gst">%</th>');
  const totalIdx = html.indexOf('<th class="col-total">AMT</th>');

  assert.ok(nameIdx < qtyIdx, 'NAME before QTY');
  assert.ok(qtyIdx < mrpIdx, 'QTY before MRP');
  assert.ok(mrpIdx < rateIdx, 'MRP before RATE');
  assert.ok(rateIdx < gstIdx, 'RATE before GST');
  assert.ok(gstIdx < totalIdx, 'GST before TOTAL PRICE');

  // 1b. Verify alignments in CSS: QTY (center), MRP (left), RATE (left), GST % (right), AMT (right)
  assert.ok(html.includes('.th-bill-table thead th.col-qty{text-align:center'), 'QTY header is center-aligned');
  assert.ok(html.includes('.th-bill-table thead th.col-mrp{text-align:left'), 'MRP header is left-aligned');
  assert.ok(html.includes('.th-bill-table thead th.col-store{text-align:left'), 'RATE header is left-aligned');
  assert.ok(html.includes('.th-bill-table thead th.col-gst{text-align:right'), 'GST % header is right-aligned');
  assert.ok(html.includes('.th-bill-table thead th.col-total{text-align:right'), 'AMT header is right-aligned');

  assert.ok(html.includes('.th-bill-table td.col-qty{text-align:center'), 'QTY cell is center-aligned');
  assert.ok(html.includes('.th-bill-table td.col-mrp{text-align:left'), 'MRP cell is left-aligned');
  assert.ok(html.includes('.th-bill-table td.col-store{text-align:left'), 'RATE cell is left-aligned');
  assert.ok(html.includes('.th-bill-table td.col-gst{text-align:right'), 'GST % cell is right-aligned');
  assert.ok(html.includes('.th-bill-table td.col-total{text-align:right'), 'AMT cell is right-aligned');

  // 2. Verify Quantity Column has only numeric value (no 'pkt', no 'bag')
  assert.ok(html.includes('<td class="col-qty">1</td>'), 'Quantity must be numeric "1"');
  assert.ok(!html.includes('<td class="col-qty">1 pkt</td>'), 'Quantity must NOT have unit "pkt"');
  assert.ok(!html.includes('<td class="col-qty">1 bag</td>'), 'Quantity must NOT have unit "bag"');

  // 3. Verify GST column in table rows
  assert.ok(html.includes('<td class="col-gst">0%</td>'), 'First item has 0% GST');
  assert.ok(html.includes('<td class="col-gst">5%</td>'), 'Second item has 5% GST');

  // 4. Verify bottom GST breakdown box is completely removed
  assert.ok(!html.includes('th-gst-box'), 'Bottom GST box must NOT be rendered');
  assert.ok(!html.includes('GST Value'), 'Bottom "GST Value" heading must NOT be present');
  assert.ok(!html.includes('Total GST'), 'Bottom "Total GST" must NOT be present');

  // 5. Verify existing critical receipt details are preserved
  assert.ok(html.includes('Total Quantity: <b>2.00</b>'), 'Total Quantity must remain');
  assert.ok(html.includes('Total Items: <b>2</b>'), 'Total Items must remain');
  assert.ok(html.includes('Round off'), 'Round off must remain');
  assert.ok(html.includes('E.&O.E.'), 'E.&O.E. must remain');
  assert.ok(html.includes('Net Value'), 'Net Value must remain');
  assert.ok(html.includes('₹317.00'), 'Net Value amount ₹317.00 must remain');

  // 6. Verify complete product name is rendered without ellipsis or truncation
  assert.ok(html.includes('Aashirvaad Superior MP Sharbati Atta 5kg'), 'Complete product name must be rendered without truncation');
  assert.ok(!html.includes('Aashirvaad Superior MP...'), 'Ellipsis must not appear in product name');
  assert.ok(!html.includes('Superior MP...'), 'Ellipsis must not appear');
});

test('thermal receipt layout: long product names wrap completely across lines with no ellipsis truncation', () => {
  const longBill: PrintableBill = {
    number: 'INV-2026-LONG',
    dateText: '25 Nov 2026 05:00 pm',
    kind: 'sale',
    status: 'issued',
    shop: {
      name: 'A2Z Super Store',
      address: '123 Main Bazaar, Chennai',
      phone: '9876543210',
      gstin: '33AAAAA0000A1Z5',
      logoUrl: '',
    },
    customer: {
      name: 'Priya Sharma',
      phone: '9840054321',
      gstin: '',
    },
    lines: [
      {
        name: 'Aashirvaad Superior MP Sharbati Atta 5kg',
        qtyMilli: 1000,
        unit: 'bag',
        mrpMinor: 31700,
        priceMinor: 27500,
        taxRateBp: 500,
        taxableMinor: 27500,
        cgstMinor: 688,
        sgstMinor: 687,
        igstMinor: 0,
        totalMinor: 28875,
        discountMinor: 0,
      },
      {
        name: 'Colgate Strong Teeth Dental Cream 200g',
        qtyMilli: 1000,
        unit: 'pcs',
        mrpMinor: 13300,
        priceMinor: 11500,
        taxRateBp: 1800,
        taxableMinor: 11500,
        cgstMinor: 1035,
        sgstMinor: 1035,
        igstMinor: 0,
        totalMinor: 13570,
        discountMinor: 0,
      },
      {
        name: 'Dettol Original Germ Protection Bathing Soap 125g',
        qtyMilli: 1000,
        unit: 'pcs',
        mrpMinor: 7900,
        priceMinor: 6800,
        taxRateBp: 1800,
        taxableMinor: 6800,
        cgstMinor: 612,
        sgstMinor: 612,
        igstMinor: 0,
        totalMinor: 8024,
        discountMinor: 0,
      },
      {
        name: 'Fortune Sunlite Refined Sunflower Oil 1L',
        qtyMilli: 1000,
        unit: 'pouch',
        mrpMinor: 16700,
        priceMinor: 14500,
        taxRateBp: 500,
        taxableMinor: 14500,
        cgstMinor: 363,
        sgstMinor: 362,
        igstMinor: 0,
        totalMinor: 15225,
        discountMinor: 0,
      },
      {
        name: 'India Gate Basmati Rice Feast Rozzana 5kg',
        qtyMilli: 1000,
        unit: 'bag',
        mrpMinor: 48300,
        priceMinor: 42000,
        taxRateBp: 500,
        taxableMinor: 42000,
        cgstMinor: 1050,
        sgstMinor: 1050,
        igstMinor: 0,
        totalMinor: 44100,
        discountMinor: 0,
      },
    ],
    totals: {
      subtotalMinor: 102300,
      discountMinor: 0,
      taxableMinor: 102300,
      cgstMinor: 3748,
      sgstMinor: 3746,
      igstMinor: 0,
      roundOffMinor: 6,
      totalMinor: 109794,
      paidMinor: 109794,
      balanceMinor: 0,
    },
    payments: [
      { method: 'cash', amountMinor: 109794 },
    ],
    customFields: [],
    intra: true,
  };

  const html = renderBillDoc(longBill, tpl);

  // Assert full product names are rendered intact
  assert.ok(html.includes('Aashirvaad Superior MP Sharbati Atta 5kg'));
  assert.ok(html.includes('Colgate Strong Teeth Dental Cream 200g'));
  assert.ok(html.includes('Dettol Original Germ Protection Bathing Soap 125g'));
  assert.ok(html.includes('Fortune Sunlite Refined Sunflower Oil 1L'));
  assert.ok(html.includes('India Gate Basmati Rice Feast Rozzana 5kg'));

  // Assert NO truncation ellipsis appears anywhere in item lines
  assert.ok(!html.includes('Aashirvaad Superior MP...'));
  assert.ok(!html.includes('Colgate Str...'));
  assert.ok(!html.includes('Dettol Orig...'));
  assert.ok(!html.includes('Fortune Sunlite Ref...'));
  assert.ok(!html.includes('India Gate Basmati Ric...'));

  // Verify structure
  assert.ok(html.includes('<span class="th-idx">1.</span>'));
  assert.ok(html.includes('<span class="th-idx">2.</span>'));
  assert.ok(html.includes('<span class="th-idx">3.</span>'));
  assert.ok(html.includes('<span class="th-idx">4.</span>'));
  assert.ok(html.includes('<span class="th-idx">5.</span>'));
  assert.ok(html.includes('class="th-name-title"'));
});
