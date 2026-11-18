import { requirePerm } from '../auth.ts';
import { bad, conflict, notFound, V, type Router } from '../http.ts';
import { newId } from '../security.ts';
import { audit } from '../audit.ts';
import { normalizePhone } from '../../../shared/whatsapp.ts';
import { validateGstin } from '../../../shared/tax.ts';
import type { WholesaleCustomer } from '../../../shared/types.ts';

function mapWholesaleCustomerRow(r: any): WholesaleCustomer {
  const billingAddr = r.billingAddress ?? r.billing_address ?? r.address ?? null;
  const shippingAddr = r.shippingAddress ?? r.shipping_address ?? billingAddr;
  const unpaidMinor = Number(r.unpaidInvoicesMinor ?? r.unpaid_invoices_minor ?? 0);
  return {
    id: r.id,
    tenantId: r.tenantId ?? r.tenant_id,
    branchId: r.branchId ?? r.branch_id ?? null,
    name: r.name,
    companyName: r.companyName ?? r.company_name ?? r.name,
    contactPerson: r.contactPerson ?? r.contact_person ?? null,
    phone: r.phone ?? null,
    email: r.email ?? null,
    gstin: r.gstin ?? null,
    stateCode: r.stateCode ?? r.state_code ?? null,
    billingAddress: billingAddr,
    shippingAddress: shippingAddr,
    address: billingAddr,
    registrationType: (r.registrationType ?? r.registration_type) || (r.gstin ? 'registered' : 'unregistered'),
    creditLimitMinor: Number(r.creditLimitMinor ?? r.credit_limit_minor ?? 0),
    active: r.active !== false,
    unpaidInvoicesMinor: unpaidMinor,
    duesMinor: unpaidMinor,
    custom: (r.custom && typeof r.custom === 'object') ? r.custom : {},
    createdAt: r.createdAt ?? r.created_at,
    updatedAt: r.updatedAt ?? r.updated_at,
  };
}

export function registerWholesaleCustomers(r: Router) {
  // GET /api/wholesale/customers (and alias /api/wholesale-customers)
  const listHandler = async (ctx: any) => {
    const tenantId = ctx.user!.tenantId;
    const search = typeof ctx.query.search === 'string' ? ctx.query.search.trim().toLowerCase() : '';
    const branchId = typeof ctx.query.branchId === 'string' ? ctx.query.branchId.trim() : '';
    const includeInactive = ctx.query.includeInactive === '1' || ctx.query.includeInactive === 'true';
    const limit = Math.min(500, Math.max(1, parseInt(ctx.query.limit as string) || 200));

    let sql = `
      SELECT
        wc.*,
        COALESCE(
          (SELECT SUM(i.balance_minor) FROM invoices i WHERE (i.wholesale_customer_id = wc.id OR i.party_id = wc.id) AND i.tenant_id = wc.tenant_id AND i.status = 'posted'),
          0
        )::bigint AS unpaid_invoices_minor
      FROM wholesale_customers wc
      WHERE wc.tenant_id = ?
    `;
    const params: unknown[] = [tenantId];

    if (!includeInactive) {
      sql += ' AND wc.active = TRUE';
    }

    if (branchId && branchId.toLowerCase() !== 'all') {
      sql += ' AND (wc.branch_id IS NULL OR wc.branch_id = ?)';
      params.push(branchId);
    }

    if (search) {
      sql += ' AND (lower(wc.name) LIKE ? OR lower(COALESCE(wc.company_name, \'\')) LIKE ? OR wc.phone LIKE ? OR lower(COALESCE(wc.gstin, \'\')) LIKE ? OR lower(COALESCE(wc.contact_person, \'\')) LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    sql += ' ORDER BY lower(wc.name) ASC LIMIT ?';
    params.push(limit);

    const rows = await ctx.db.query(sql, params);
    return { customers: rows.map(mapWholesaleCustomerRow) };
  };

  r.get('/api/wholesale/customers', requirePerm('parties.view'), listHandler);
  r.get('/api/wholesale-customers', requirePerm('parties.view'), listHandler);

  // GET /api/wholesale/customers/:id
  const getHandler = async (ctx: any) => {
    const tenantId = ctx.user!.tenantId;
    const row = await ctx.db.one(
      `SELECT
        wc.*,
        COALESCE(
          (SELECT SUM(i.balance_minor) FROM invoices i WHERE (i.wholesale_customer_id = wc.id OR i.party_id = wc.id) AND i.tenant_id = wc.tenant_id AND i.status = 'posted'),
          0
        )::bigint AS unpaid_invoices_minor
      FROM wholesale_customers wc
      WHERE wc.id = ? AND wc.tenant_id = ?`,
      [ctx.params.id, tenantId]
    );
    if (!row) throw notFound('Wholesale customer not found');
    return { customer: mapWholesaleCustomerRow(row) };
  };

  r.get('/api/wholesale/customers/:id', requirePerm('parties.view'), getHandler);
  r.get('/api/wholesale-customers/:id', requirePerm('parties.view'), getHandler);

  // POST /api/wholesale/customers
  const createHandler = async (ctx: any) => {
    const tenantId = ctx.user!.tenantId;
    const b = ctx.body || {};

    const name = V.str(b.name, 'Wholesale customer / company name', { min: 1, max: 150 });
    const companyName = V.optStr(b.companyName ?? b.company_name, 'Company name', 150) || name;
    const contactPerson = V.optStr(b.contactPerson ?? b.contact_person, 'Contact person', 100);

    let rawPhone = V.optStr(b.phone ?? b.mobileNumber ?? b.mobile_number, 'Mobile number', 25);
    let phone: string | null = null;
    if (rawPhone) {
      phone = normalizePhone(rawPhone) || rawPhone.trim();
    }

    const email = V.optStr(b.email, 'Email address', 100);

    let rawGstin = V.optStr(b.gstin, 'GSTIN', 20);
    let gstin: string | null = null;
    let stateCode = V.optStr(b.stateCode ?? b.state_code, 'State code', 5);

    if (rawGstin) {
      const cleanGstin = rawGstin.trim().toUpperCase();
      if (!validateGstin(cleanGstin)) {
        throw bad('Invalid GSTIN format (must be 15 alphanumeric characters)', 'VALIDATION', { field: 'gstin' });
      }
      gstin = cleanGstin;
      if (!stateCode) {
        stateCode = cleanGstin.slice(0, 2);
      }
    }

    const billingAddress = V.optStr(b.billingAddress ?? b.billing_address ?? b.address, 'Billing address', 500);
    const shippingAddress = V.optStr(b.shippingAddress ?? b.shipping_address, 'Shipping address', 500) || billingAddress;

    const registrationType = (b.registrationType || (gstin ? 'registered' : 'unregistered')) === 'registered' ? 'registered' : 'unregistered';
    const creditLimitMinor = Math.max(0, V.int(b.creditLimitMinor ?? b.credit_limit_minor ?? 0, 'Credit limit', { min: 0 }));
    const branchId = V.optStr(b.branchId ?? b.branch_id, 'Branch ID', 50);

    // Uniqueness checks in wholesale_customers table
    if (phone) {
      const existingPhone = await ctx.db.one(
        'SELECT id, name FROM wholesale_customers WHERE tenant_id = ? AND phone = ?',
        [tenantId, phone]
      );
      if (existingPhone) {
        throw conflict(`A wholesale customer with mobile number "${phone}" already exists ("${existingPhone.name}")`);
      }
    }

    if (gstin) {
      const existingGstin = await ctx.db.one(
        'SELECT id, name FROM wholesale_customers WHERE tenant_id = ? AND gstin = ?',
        [tenantId, gstin]
      );
      if (existingGstin) {
        throw conflict(`A wholesale customer with GSTIN "${gstin}" already exists ("${existingGstin.name}")`);
      }
    }

    const id = newId('wc');
    await ctx.db.exec(
      `INSERT INTO wholesale_customers (
        id, tenant_id, branch_id, name, company_name, contact_person, phone, email, gstin, state_code,
        billing_address, shipping_address, registration_type, credit_limit_minor, active, custom, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?::jsonb, now(), now())`,
      [
        id,
        tenantId,
        branchId || null,
        name,
        companyName,
        contactPerson || null,
        phone,
        email || null,
        gstin,
        stateCode || null,
        billingAddress || null,
        shippingAddress || null,
        registrationType,
        creditLimitMinor,
        JSON.stringify(b.custom && typeof b.custom === 'object' ? b.custom : {}),
      ]
    );

    await audit(ctx.db, ctx, {
      action: 'wholesale_customer.create',
      entity: 'wholesale_customer',
      entityId: id,
      detail: { name, phone, gstin, registrationType },
    });

    const created = await ctx.db.one('SELECT * FROM wholesale_customers WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    return { customer: mapWholesaleCustomerRow(created) };
  };

  r.post('/api/wholesale/customers', requirePerm('parties.write'), createHandler);
  r.post('/api/wholesale-customers', requirePerm('parties.write'), createHandler);

  // PUT /api/wholesale/customers/:id
  const updateHandler = async (ctx: any) => {
    const tenantId = ctx.user!.tenantId;
    const existing = await ctx.db.one(
      'SELECT * FROM wholesale_customers WHERE id = ? AND tenant_id = ?',
      [ctx.params.id, tenantId]
    );
    if (!existing) throw notFound('Wholesale customer not found');

    const b = ctx.body || {};
    const name = V.optStr(b.name, 'Customer name', 150) ?? existing.name;
    const companyName = V.optStr(b.companyName ?? b.company_name, 'Company name', 150) ?? existing.companyName ?? existing.company_name ?? name;
    const contactPerson = V.optStr(b.contactPerson ?? b.contact_person, 'Contact person', 100) ?? existing.contactPerson ?? existing.contact_person ?? null;

    let phone = existing.phone;
    if (b.phone !== undefined || b.mobileNumber !== undefined || b.mobile_number !== undefined) {
      const rawP = V.optStr(b.phone ?? b.mobileNumber ?? b.mobile_number, 'Mobile number', 25);
      phone = rawP ? (normalizePhone(rawP) || rawP.trim()) : null;
    }

    const email = b.email !== undefined ? V.optStr(b.email, 'Email address', 100) : existing.email;

    let gstin = existing.gstin;
    let stateCode = b.stateCode !== undefined ? V.optStr(b.stateCode ?? b.state_code, 'State code', 5) : existing.stateCode ?? existing.state_code;

    if (b.gstin !== undefined) {
      const rawG = V.optStr(b.gstin, 'GSTIN', 20);
      if (rawG) {
        const cleanG = rawG.trim().toUpperCase();
        if (!validateGstin(cleanG)) {
          throw bad('Invalid GSTIN format (must be 15 alphanumeric characters)', 'VALIDATION', { field: 'gstin' });
        }
        gstin = cleanG;
        if (!stateCode) stateCode = cleanG.slice(0, 2);
      } else {
        gstin = null;
      }
    }

    const billingAddress = b.billingAddress !== undefined || b.address !== undefined
      ? V.optStr(b.billingAddress ?? b.billing_address ?? b.address, 'Billing address', 500)
      : (existing.billingAddress ?? existing.billing_address);

    const shippingAddress = b.shippingAddress !== undefined
      ? V.optStr(b.shippingAddress ?? b.shipping_address, 'Shipping address', 500)
      : (existing.shippingAddress ?? existing.shipping_address ?? billingAddress);

    const registrationType = (b.registrationType || (gstin ? 'registered' : 'unregistered')) === 'registered' ? 'registered' : 'unregistered';
    const creditLimitMinor = b.creditLimitMinor !== undefined || b.credit_limit_minor !== undefined
      ? Math.max(0, V.int(b.creditLimitMinor ?? b.credit_limit_minor ?? 0, 'Credit limit', { min: 0 }))
      : Number(existing.creditLimitMinor ?? existing.credit_limit_minor ?? 0);

    const active = b.active !== undefined ? Boolean(b.active) : existing.active !== false;

    // Uniqueness checks excluding current record
    if (phone) {
      const dupPhone = await ctx.db.one(
        'SELECT id, name FROM wholesale_customers WHERE tenant_id = ? AND phone = ? AND id <> ?',
        [tenantId, phone, existing.id]
      );
      if (dupPhone) {
        throw conflict(`A wholesale customer with mobile number "${phone}" already exists ("${dupPhone.name}")`);
      }
    }

    if (gstin) {
      const dupGstin = await ctx.db.one(
        'SELECT id, name FROM wholesale_customers WHERE tenant_id = ? AND gstin = ? AND id <> ?',
        [tenantId, gstin, existing.id]
      );
      if (dupGstin) {
        throw conflict(`A wholesale customer with GSTIN "${gstin}" already exists ("${dupGstin.name}")`);
      }
    }

    await ctx.db.exec(
      `UPDATE wholesale_customers SET
        name = ?,
        company_name = ?,
        contact_person = ?,
        phone = ?,
        email = ?,
        gstin = ?,
        state_code = ?,
        billing_address = ?,
        shipping_address = ?,
        registration_type = ?,
        credit_limit_minor = ?,
        active = ?,
        updated_at = now()
      WHERE id = ? AND tenant_id = ?`,
      [
        name,
        companyName,
        contactPerson,
        phone,
        email,
        gstin,
        stateCode,
        billingAddress,
        shippingAddress,
        registrationType,
        creditLimitMinor,
        active,
        existing.id,
        tenantId,
      ]
    );

    await audit(ctx.db, ctx, {
      action: 'wholesale_customer.update',
      entity: 'wholesale_customer',
      entityId: existing.id,
      detail: { name, phone, gstin, registrationType },
    });

    const updated = await ctx.db.one('SELECT * FROM wholesale_customers WHERE id = ? AND tenant_id = ?', [existing.id, tenantId]);
    return { customer: mapWholesaleCustomerRow(updated) };
  };

  r.put('/api/wholesale/customers/:id', requirePerm('parties.write'), updateHandler);
  r.put('/api/wholesale-customers/:id', requirePerm('parties.write'), updateHandler);

  // DELETE /api/wholesale/customers/:id
  const deleteHandler = async (ctx: any) => {
    const tenantId = ctx.user!.tenantId;
    const existing = await ctx.db.one(
      'SELECT id, name FROM wholesale_customers WHERE id = ? AND tenant_id = ?',
      [ctx.params.id, tenantId]
    );
    if (!existing) throw notFound('Wholesale customer not found');

    // Check if invoices are attached
    const hasInvoices = await ctx.db.one(
      'SELECT 1 FROM invoices WHERE tenant_id = ? AND (wholesale_customer_id = ? OR party_id = ?) LIMIT 1',
      [tenantId, existing.id, existing.id]
    );

    if (hasInvoices) {
      // Soft-delete to preserve invoice audit trails
      await ctx.db.exec(
        'UPDATE wholesale_customers SET active = FALSE, updated_at = now() WHERE id = ? AND tenant_id = ?',
        [existing.id, tenantId]
      );
    } else {
      await ctx.db.exec(
        'DELETE FROM wholesale_customers WHERE id = ? AND tenant_id = ?',
        [existing.id, tenantId]
      );
    }

    await audit(ctx.db, ctx, {
      action: 'wholesale_customer.delete',
      entity: 'wholesale_customer',
      entityId: existing.id,
      detail: { name: existing.name, soft: Boolean(hasInvoices) },
    });

    return { ok: true, deleted: true, softDeleted: Boolean(hasInvoices) };
  };

  r.delete('/api/wholesale/customers/:id', requirePerm('parties.write'), deleteHandler);
  r.delete('/api/wholesale-customers/:id', requirePerm('parties.write'), deleteHandler);
}
