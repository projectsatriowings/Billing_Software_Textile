import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/env.ts';
import { connectDb } from '../src/db/index.ts';
import { newId } from '../src/security.ts';

test('Wholesale Customer Management Separation from Retail Customers', async (t) => {
  const db = await connectDb();
  const tenantId = `t_wh_sep_${Date.now()}`;

  await t.test('Setup tenant with branches', async () => {
    await db.exec(
      "INSERT INTO tenants (id, name, invoice_prefix) VALUES (?, 'Wholesale Separation Test Mart', 'WST')",
      [tenantId]
    );
    await db.exec(
      "INSERT INTO branches (id, tenant_id, code, name) VALUES (?, ?, 'MAIN', 'Main Branch')",
      [`br_${tenantId}`, tenantId]
    );
  });

  const testRetailPhone = '9876543211';
  const testWholesalePhone = '9876543299';
  let wholesaleCustId = '';
  let retailCustId = '';

  await t.test('1. Create retail customer -> saves ONLY to parties table', async () => {
    retailCustId = newId('p');
    await db.exec(
      `INSERT INTO parties (id, tenant_id, branch_id, type, name, phone, address, credit_limit_minor, active)
       VALUES (?, ?, ?, 'customer', 'Priya Sundaram (Retail)', ?, 'Chennai', 50000, TRUE)`,
      [retailCustId, tenantId, `br_${tenantId}`, testRetailPhone]
    );

    // Verify it exists in parties
    const inParties = await db.one('SELECT id, name FROM parties WHERE id = ? AND tenant_id = ?', [retailCustId, tenantId]);
    assert.ok(inParties, 'Retail customer must be in parties');

    // Verify it DOES NOT exist in wholesale_customers
    const inWholesale = await db.one('SELECT id FROM wholesale_customers WHERE (id = ? OR phone = ?) AND tenant_id = ?', [retailCustId, testRetailPhone, tenantId]);
    assert.equal(inWholesale, undefined, 'Retail customer must NOT be in wholesale_customers table');
  });

  await t.test('2. Create wholesale customer -> saves ONLY to wholesale_customers table', async () => {
    wholesaleCustId = newId('wc');
    await db.exec(
      `INSERT INTO wholesale_customers (
        id, tenant_id, branch_id, name, company_name, contact_person, phone, email, gstin,
        state_code, billing_address, shipping_address, registration_type, credit_limit_minor, active
      ) VALUES (?, ?, ?, 'Rikhabdas Fabrics Pvt Ltd', 'Rikhabdas Fabrics', 'Mr. Rikhabdas', ?, 'rikhab@fabrics.com',
        '24AAACR9377A1ZH', '24', 'Surat Textile Market', 'Surat Warehouse', 'registered', 2000000, TRUE)`,
      [wholesaleCustId, tenantId, `br_${tenantId}`, testWholesalePhone]
    );

    // Verify it exists in wholesale_customers
    const inWholesale = await db.one('SELECT id, name, gstin, registration_type FROM wholesale_customers WHERE id = ? AND tenant_id = ?', [wholesaleCustId, tenantId]);
    assert.ok(inWholesale, 'Wholesale customer must be in wholesale_customers');
    assert.equal(inWholesale.name, 'Rikhabdas Fabrics Pvt Ltd');
    assert.equal(inWholesale.registrationType ?? (inWholesale as any).registration_type, 'registered');

    // Verify it DOES NOT exist in parties table
    const inParties = await db.one('SELECT id FROM parties WHERE (id = ? OR phone = ?) AND tenant_id = ?', [wholesaleCustId, testWholesalePhone, tenantId]);
    assert.equal(inParties, undefined, 'Wholesale customer must NOT be in parties table');
  });

  await t.test('3. Query wholesale customers -> returns only wholesale customer, retail is excluded', async () => {
    const list = await db.query(
      'SELECT id, name, phone, gstin FROM wholesale_customers WHERE tenant_id = ? AND active = TRUE',
      [tenantId]
    );
    assert.equal(list.length, 1, 'Wholesale query should return exactly 1 wholesale customer');
    assert.equal(list[0].id, wholesaleCustId);
    assert.equal(list[0].name, 'Rikhabdas Fabrics Pvt Ltd');

    // Confirm retail customer is not in this query
    const retailInList = list.find((c) => c.phone === testRetailPhone);
    assert.equal(retailInList, undefined, 'Retail customer must not be returned in wholesale list');
  });

  await t.test('4. Query retail customers -> returns only retail customer, wholesale is excluded', async () => {
    const list = await db.query(
      "SELECT id, name, phone FROM parties WHERE tenant_id = ? AND type = 'customer' AND active = TRUE",
      [tenantId]
    );
    assert.equal(list.length, 1, 'Retail query should return exactly 1 retail customer');
    assert.equal(list[0].id, retailCustId);
    assert.equal(list[0].name, 'Priya Sundaram (Retail)');

    // Confirm wholesale customer is not in this query
    const wholesaleInList = list.find((c) => c.phone === testWholesalePhone);
    assert.equal(wholesaleInList, undefined, 'Wholesale customer must not be returned in retail list');
  });

  await t.test('5. Wholesale invoice links wholesale_customer_id, leaves party_id null', async () => {
    const invId = newId('inv');
    const shareToken = newId('tok');
    await db.exec(
      `INSERT INTO invoices (
        id, tenant_id, branch_id, client_id, number, kind, status, bdate,
        party_id, wholesale_customer_id, customer_name, customer_phone, customer_gstin,
        subtotal_minor, taxable_minor, total_minor, balance_minor, share_token, rule_version, invoice_type
      ) VALUES (?, ?, ?, 'cid_test', 'WH-TEST-01', 'sale', 'posted', '2026-11-18',
        NULL, ?, 'Rikhabdas Fabrics Pvt Ltd', ?, '24AAACR9377A1ZH',
        100000, 100000, 100000, 50000, ?, '1.0', 'wholesale')`,
      [invId, tenantId, `br_${tenantId}`, wholesaleCustId, testWholesalePhone, shareToken]
    );

    const invoiceRow = await db.one('SELECT * FROM invoices WHERE id = ?', [invId]);
    assert.ok(invoiceRow);
    assert.ok(!invoiceRow.partyId && !invoiceRow.party_id, 'party_id should be null/falsy for wholesale invoice');
    assert.equal(invoiceRow.wholesaleCustomerId ?? invoiceRow.wholesale_customer_id, wholesaleCustId);

    // Verify wholesale customer dues calculation
    const duesRow = await db.one<any>(
      `SELECT COALESCE(SUM(balance_minor), 0)::bigint as dues
       FROM invoices
       WHERE tenant_id = ? AND wholesale_customer_id = ? AND status = 'posted'`,
      [tenantId, wholesaleCustId]
    );
    assert.equal(Number(duesRow?.dues), 50000, 'Dues for wholesale customer must reflect 50000 paise');

    // Clean up test invoice
    await db.exec('DELETE FROM invoices WHERE id = ?', [invId]);
  });

  await t.test('6. Teardown test tenant data', async () => {
    await db.exec('DELETE FROM invoices WHERE tenant_id = ?', [tenantId]);
    await db.exec('DELETE FROM wholesale_customers WHERE tenant_id = ?', [tenantId]);
    await db.exec('DELETE FROM parties WHERE tenant_id = ?', [tenantId]);
    await db.exec('DELETE FROM branches WHERE tenant_id = ?', [tenantId]);
    await db.exec('DELETE FROM tenants WHERE id = ?', [tenantId]);
    await db.close();
  });
});
