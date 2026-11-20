import { audit } from '../audit.ts';
import { requirePerm, requireUser } from '../auth.ts';
import { bad, notFound, V, type Router } from '../http.ts';
import { decryptSecret, encryptSecret } from '../security.ts';
import { validateRazorpayCredentials } from '../services/razorpayService.ts';
import { validatePaytmCredentials } from '../services/paytmService.ts';
import { validatePhonePeCredentials } from '../services/phonepeService.ts';
import { env } from '../env.ts';
import { j } from '../db/index.ts';

export interface PublicPaymentSettings {
  upiEnabled: boolean;
  qrType: 'static' | 'dynamic';
  provider: 'manual' | 'razorpay' | 'paytm' | 'phonepe';
  staticUpiId: string | null;
  staticMerchantName: string | null;
  rzpEnabled: boolean;
  rzpMode: 'test' | 'live';
  rzpKeyId: string | null;
  hasKeySecret: boolean;
  hasWebhookSecret: boolean;
  maskedKeySecret?: string;
  rzpQrExpiryMinutes: number;
  paytmEnabled: boolean;
  paytmMode: 'test' | 'live';
  paytmMid: string | null;
  hasPaytmKey: boolean;
  paytmWebsite: string;
  phonepeEnabled: boolean;
  phonepeMode: 'test' | 'live';
  phonepeMid: string | null;
  hasPhonePeSaltKey: boolean;
  phonepeSaltIndex: string;
  bankEnabled?: boolean;
  bankAccountName?: string | null;
  bankAccountNo?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  bankBranch?: string | null;
  status: 'not_configured' | 'connected' | 'error';
  statusMessage: string | null;
  enabledMethods: string[];
}

export function registerPaymentSettings(r: Router) {
  // Get payment settings for the authenticated shop
  r.get('/api/shop/payment-settings', requireUser, async (ctx) => {
    const tenantId = ctx.user!.tenantId;

    const row = await ctx.db.one('SELECT * FROM shop_payment_settings WHERE tenant_id = ?', [tenantId]);
    if (!row) {
      // Pull shop defaults if available
      const shop = await ctx.db.one('SELECT name, upi_id FROM tenants WHERE id = ?', [tenantId]);
      return {
        upiEnabled: true,
        qrType: 'static',
        provider: 'manual',
        staticUpiId: shop?.upiId || shop?.upi_id || null,
        staticMerchantName: shop?.name || null,
        rzpEnabled: false,
        rzpMode: 'test',
        rzpKeyId: null,
        hasKeySecret: false,
        hasWebhookSecret: false,
        rzpQrExpiryMinutes: 10,
        paytmEnabled: false,
        paytmMode: 'test',
        paytmMid: null,
        hasPaytmKey: false,
        paytmWebsite: 'DEFAULT',
        phonepeEnabled: false,
        phonepeMode: 'test',
        phonepeMid: null,
        hasPhonePeSaltKey: false,
        phonepeSaltIndex: '1',
        bankEnabled: false,
        bankAccountName: shop?.name || null,
        bankAccountNo: null,
        bankIfsc: null,
        bankName: null,
        bankBranch: null,
        status: 'not_configured',
        statusMessage: null,
        enabledMethods: ['cash', 'upi', 'card', 'credit'],
      } satisfies PublicPaymentSettings;
    }

    const hasSecret = Boolean(row.rzpKeySecretEncrypted || row.rzp_key_secret_encrypted);
    const hasWebSecret = Boolean(row.rzpWebhookSecretEncrypted || row.rzp_webhook_secret_encrypted);
    const hasPaytmKey = Boolean(row.paytmMerchantKeyEncrypted || row.paytm_merchant_key_encrypted);
    const hasPhonePeSaltKey = Boolean(row.phonepeSaltKeyEncrypted || row.phonepe_salt_key_encrypted);

    let methods: string[] = ['cash', 'upi', 'card', 'credit'];
    const rawMethods = row.enabledMethods || row.enabled_methods;
    if (Array.isArray(rawMethods)) {
      methods = rawMethods.filter((m: string) => typeof m === 'string');
    } else if (typeof rawMethods === 'string') {
      try {
        methods = JSON.parse(rawMethods).filter((m: string) => typeof m === 'string');
      } catch {
        // use default
      }
    }

    const bankEnabled = Boolean(row.bankEnabled ?? row.bank_enabled ?? false);
    if (bankEnabled && !methods.includes('bank')) {
      methods.push('bank');
    } else if (!bankEnabled && methods.includes('bank')) {
      methods = methods.filter((m) => m !== 'bank');
    }

    return {
      upiEnabled: Boolean(row.upiEnabled ?? row.upi_enabled ?? true),
      qrType: (row.qrType || row.qr_type || 'static') as 'static' | 'dynamic',
      provider: (row.provider || 'manual') as 'manual' | 'razorpay' | 'paytm' | 'phonepe',
      staticUpiId: row.staticUpiId || row.static_upi_id || null,
      staticMerchantName: row.staticMerchantName || row.static_merchant_name || null,
      rzpEnabled: Boolean(row.rzpEnabled ?? row.rzp_enabled ?? false),
      rzpMode: (row.rzpMode || row.rzp_mode || 'test') as 'test' | 'live',
      rzpKeyId: row.rzpKeyId || row.rzp_key_id || null,
      hasKeySecret: hasSecret,
      hasWebhookSecret: hasWebSecret,
      maskedKeySecret: hasSecret ? '••••••••••••••••' : undefined,
      rzpQrExpiryMinutes: Number(row.rzpQrExpiryMinutes || row.rzp_qr_expiry_minutes || 10),
      paytmEnabled: Boolean(row.paytmEnabled ?? row.paytm_enabled ?? false),
      paytmMode: (row.paytmMode || row.paytm_mode || 'test') as 'test' | 'live',
      paytmMid: row.paytmMid || row.paytm_mid || null,
      hasPaytmKey,
      paytmWebsite: row.paytmWebsite || row.paytm_website || 'DEFAULT',
      phonepeEnabled: Boolean(row.phonepeEnabled ?? row.phonepe_enabled ?? false),
      phonepeMode: (row.phonepeMode || row.phonepe_mode || 'test') as 'test' | 'live',
      phonepeMid: row.phonepeMid || row.phonepe_mid || null,
      hasPhonePeSaltKey,
      phonepeSaltIndex: row.phonepeSaltIndex || row.phonepe_salt_index || '1',
      bankEnabled,
      bankAccountName: row.bankAccountName || row.bank_account_name || null,
      bankAccountNo: row.bankAccountNo || row.bank_account_no || null,
      bankIfsc: row.bankIfsc || row.bank_ifsc || null,
      bankName: row.bankName || row.bank_name || null,
      bankBranch: row.bankBranch || row.bank_branch || null,
      status: (row.status || 'not_configured') as 'not_configured' | 'connected' | 'error',
      statusMessage: row.statusMessage || row.status_message || null,
      enabledMethods: methods,
    } satisfies PublicPaymentSettings;
  });

  // Save / Update payment settings (Owner or Manager only)
  r.put('/api/shop/payment-settings', requirePerm('settings'), async (ctx) => {
    const tenantId = ctx.user!.tenantId;
    const b = ctx.body ?? {};
    const target = typeof b.target === 'string' ? b.target : null;

    // Fetch existing settings first so partial updates don't wipe out unprovided fields
    const existing = await ctx.db.one('SELECT * FROM shop_payment_settings WHERE tenant_id = ?', [tenantId]);

    const upiEnabled = b.upiEnabled !== undefined
      ? V.bool(b.upiEnabled, true)
      : (existing ? Boolean(existing.upi_enabled ?? existing.upiEnabled) : true);

    const qrType = b.qrType !== undefined
      ? V.oneOf(b.qrType, 'QR type', ['static', 'dynamic'] as const, 'static')
      : (existing ? (existing.qr_type || 'static') : 'static');

    const provider = b.provider !== undefined
      ? V.oneOf(b.provider, 'Provider', ['manual', 'razorpay', 'paytm', 'phonepe'] as const, 'manual')
      : (existing ? (existing.provider || 'manual') : 'manual');

    const staticUpiId = b.staticUpiId !== undefined
      ? V.optStr(b.staticUpiId, 'Static UPI ID', 100)
      : (existing?.static_upi_id ?? null);

    const staticMerchantName = b.staticMerchantName !== undefined
      ? V.optStr(b.staticMerchantName, 'Merchant name', 80)
      : (existing?.static_merchant_name ?? null);

    // Razorpay Fields
    const rzpEnabled = b.rzpEnabled !== undefined
      ? V.bool(b.rzpEnabled, false)
      : (existing ? Boolean(existing.rzp_enabled ?? existing.rzpEnabled) : false);

    const rzpMode = b.rzpMode !== undefined
      ? V.oneOf(b.rzpMode, 'Razorpay mode', ['test', 'live'] as const, 'test')
      : (existing?.rzp_mode || 'test');

    const rzpKeyId = b.rzpKeyId !== undefined
      ? V.optStr(b.rzpKeyId, 'Key ID', 100)
      : (existing?.rzp_key_id ?? null);

    const rzpKeySecret = V.optStr(b.rzpKeySecret, 'Key Secret', 200);
    const rzpWebhookSecret = V.optStr(b.rzpWebhookSecret, 'Webhook Secret', 200);
    const rzpQrExpiryMinutes = b.rzpQrExpiryMinutes !== undefined
      ? (V.int(b.rzpQrExpiryMinutes, 'Expiry minutes', { min: 1, max: 60 }) || 15)
      : (Number(existing?.rzp_qr_expiry_minutes) || 15);

    // Paytm Fields
    const paytmEnabled = b.paytmEnabled !== undefined
      ? V.bool(b.paytmEnabled, false)
      : (existing ? Boolean(existing.paytm_enabled ?? existing.paytmEnabled) : false);

    const paytmMode = b.paytmMode !== undefined
      ? V.oneOf(b.paytmMode, 'Paytm mode', ['test', 'live'] as const, 'test')
      : (existing?.paytm_mode || 'test');

    const paytmMid = b.paytmMid !== undefined
      ? V.optStr(b.paytmMid, 'Paytm MID', 100)
      : (existing?.paytm_mid ?? null);

    const paytmMerchantKey = V.optStr(b.paytmMerchantKey, 'Paytm Merchant Key', 200);
    const paytmWebsite = b.paytmWebsite !== undefined
      ? (V.optStr(b.paytmWebsite, 'Paytm Website', 50) || 'DEFAULT')
      : (existing?.paytm_website || 'DEFAULT');

    // PhonePe Fields
    const phonepeEnabled = b.phonepeEnabled !== undefined
      ? V.bool(b.phonepeEnabled, false)
      : (existing ? Boolean(existing.phonepe_enabled ?? existing.phonepeEnabled) : false);

    const phonepeMode = b.phonepeMode !== undefined
      ? V.oneOf(b.phonepeMode, 'PhonePe mode', ['test', 'live'] as const, 'test')
      : (existing?.phonepe_mode || 'test');

    const phonepeMid = b.phonepeMid !== undefined
      ? V.optStr(b.phonepeMid, 'PhonePe MID', 100)
      : (existing?.phonepe_mid ?? null);

    const phonepeSaltKey = V.optStr(b.phonepeSaltKey, 'PhonePe Salt Key', 200);
    const phonepeSaltIndex = b.phonepeSaltIndex !== undefined
      ? (V.optStr(b.phonepeSaltIndex, 'PhonePe Salt Index', 10) || '1')
      : (existing?.phonepe_salt_index || '1');

    // Bank Details Fields
    const bankEnabled = b.bankEnabled !== undefined
      ? V.bool(b.bankEnabled, false)
      : (existing ? Boolean(existing.bank_enabled ?? existing.bankEnabled) : false);

    const bankAccountName = b.bankAccountName !== undefined
      ? V.optStr(b.bankAccountName, 'Bank Account Name', 100)
      : (existing?.bank_account_name ?? null);

    const bankAccountNo = b.bankAccountNo !== undefined
      ? V.optStr(b.bankAccountNo, 'Bank Account Number', 50)
      : (existing?.bank_account_no ?? null);

    const bankIfsc = b.bankIfsc !== undefined
      ? V.optStr(b.bankIfsc, 'Bank IFSC Code', 20)
      : (existing?.bank_ifsc ?? null);

    const bankName = b.bankName !== undefined
      ? V.optStr(b.bankName, 'Bank Name', 100)
      : (existing?.bank_name ?? null);

    const bankBranch = b.bankBranch !== undefined
      ? V.optStr(b.bankBranch, 'Bank Branch', 100)
      : (existing?.bank_branch ?? null);

    // Enabled methods list
    let methods: string[] = ['cash', 'upi', 'card', 'credit'];
    if (Array.isArray(b.enabledMethods)) {
      methods = b.enabledMethods.filter((m: string) => typeof m === 'string');
      if (!methods.includes('cash')) methods.unshift('cash'); // Cash always allowed
    } else if (existing) {
      const rawMethods = existing.enabledMethods || existing.enabled_methods;
      if (Array.isArray(rawMethods)) {
        methods = rawMethods.filter((m: string) => typeof m === 'string');
      } else if (typeof rawMethods === 'string') {
        try {
          methods = JSON.parse(rawMethods).filter((m: string) => typeof m === 'string');
        } catch {}
      }
    }
    if (bankEnabled && !methods.includes('bank')) {
      methods.push('bank');
    } else if (!bankEnabled && methods.includes('bank')) {
      methods = methods.filter((m) => m !== 'bank');
    }

    const masterKey = env.jwtSecret || 'adaptive-billing-payment-master-secret-32-chars';

    // Handle Razorpay secrets
    let rzpKeySecretEncrypted = existing?.rzpKeySecretEncrypted || existing?.rzp_key_secret_encrypted || null;
    if (rzpKeySecret) {
      rzpKeySecretEncrypted = encryptSecret(rzpKeySecret.trim(), masterKey);
    }
    let rzpWebhookSecretEncrypted = existing?.rzpWebhookSecretEncrypted || existing?.rzp_webhook_secret_encrypted || null;
    if (rzpWebhookSecret) {
      rzpWebhookSecretEncrypted = encryptSecret(rzpWebhookSecret.trim(), masterKey);
    }

    // Handle Paytm secrets
    let paytmMerchantKeyEncrypted = existing?.paytmMerchantKeyEncrypted || existing?.paytm_merchant_key_encrypted || null;
    if (paytmMerchantKey) {
      paytmMerchantKeyEncrypted = encryptSecret(paytmMerchantKey.trim(), masterKey);
    }

    // Handle PhonePe secrets
    let phonepeSaltKeyEncrypted = existing?.phonepeSaltKeyEncrypted || existing?.phonepe_salt_key_encrypted || null;
    if (phonepeSaltKey) {
      phonepeSaltKeyEncrypted = encryptSecret(phonepeSaltKey.trim(), masterKey);
    }

    let status: 'not_configured' | 'connected' | 'error' = (existing?.status as any) || 'not_configured';
    let statusMessage: string | null = existing?.status_message || null;

    // Validate provider credentials only when target matches or credentials explicitly changed
    if (target === 'razorpay' || (!target && (b.rzpKeyId !== undefined || b.rzpKeySecret !== undefined || b.rzpEnabled !== undefined))) {
      if (rzpEnabled && rzpKeyId) {
        const activeSecret = rzpKeySecret || (rzpKeySecretEncrypted ? decryptSecret(rzpKeySecretEncrypted, masterKey) : null);
        if (activeSecret) {
          const valRes = await validateRazorpayCredentials({ keyId: rzpKeyId, keySecret: activeSecret });
          if (valRes.valid) {
            status = 'connected';
            statusMessage = `Razorpay verified (${rzpMode} mode)`;
          } else {
            status = 'error';
            statusMessage = valRes.error || 'Razorpay authentication failed';
          }
        } else {
          status = 'not_configured';
          statusMessage = 'Razorpay Key Secret is required';
        }
      } else if (!rzpEnabled) {
        if (upiEnabled && staticUpiId) {
          status = 'connected';
          statusMessage = 'Static UPI configured';
        } else {
          status = 'not_configured';
          statusMessage = null;
        }
      }
    } else if (target === 'paytm' || (!target && (b.paytmMid !== undefined || b.paytmMerchantKey !== undefined))) {
      if (paytmEnabled && paytmMid) {
        const activeKey = paytmMerchantKey || (paytmMerchantKeyEncrypted ? decryptSecret(paytmMerchantKeyEncrypted, masterKey) : null);
        if (activeKey) {
          const valRes = await validatePaytmCredentials({ mid: paytmMid, merchantKey: activeKey, mode: paytmMode });
          if (valRes.valid) {
            status = 'connected';
            statusMessage = `Paytm verified (${paytmMode} mode)`;
          } else {
            status = 'error';
            statusMessage = valRes.error || 'Paytm authentication failed';
          }
        }
      }
    } else if (target === 'phonepe' || (!target && (b.phonepeMid !== undefined || b.phonepeSaltKey !== undefined))) {
      if (phonepeEnabled && phonepeMid) {
        const activeSalt = phonepeSaltKey || (phonepeSaltKeyEncrypted ? decryptSecret(phonepeSaltKeyEncrypted, masterKey) : null);
        if (activeSalt) {
          const valRes = await validatePhonePeCredentials({ mid: phonepeMid, saltKey: activeSalt, saltIndex: phonepeSaltIndex, mode: phonepeMode });
          if (valRes.valid) {
            status = 'connected';
            statusMessage = `PhonePe verified (${phonepeMode} mode)`;
          } else {
            status = 'error';
            statusMessage = valRes.error || 'PhonePe authentication failed';
          }
        }
      }
    } else if (target === 'qr') {
      if (upiEnabled && staticUpiId) {
        status = 'connected';
        statusMessage = 'Static UPI configured';
      }
    }

    if (existing) {
      await ctx.db.exec(
        `UPDATE shop_payment_settings
         SET upi_enabled = ?, qr_type = ?, provider = ?, static_upi_id = ?, static_merchant_name = ?,
             rzp_enabled = ?, rzp_mode = ?, rzp_key_id = ?, rzp_key_secret_encrypted = ?, rzp_webhook_secret_encrypted = ?, rzp_qr_expiry_minutes = ?,
             paytm_enabled = ?, paytm_mode = ?, paytm_mid = ?, paytm_merchant_key_encrypted = ?, paytm_website = ?,
             phonepe_enabled = ?, phonepe_mode = ?, phonepe_mid = ?, phonepe_salt_key_encrypted = ?, phonepe_salt_index = ?,
             bank_enabled = ?, bank_account_name = ?, bank_account_no = ?, bank_ifsc = ?, bank_name = ?, bank_branch = ?,
             status = ?, status_message = ?, enabled_methods = ?, updated_at = now()
         WHERE tenant_id = ?`,
        [
          upiEnabled,
          qrType,
          provider,
          staticUpiId,
          staticMerchantName,
          rzpEnabled,
          rzpMode,
          rzpKeyId,
          rzpKeySecretEncrypted,
          rzpWebhookSecretEncrypted,
          rzpQrExpiryMinutes,
          paytmEnabled,
          paytmMode,
          paytmMid,
          paytmMerchantKeyEncrypted,
          paytmWebsite,
          phonepeEnabled,
          phonepeMode,
          phonepeMid,
          phonepeSaltKeyEncrypted,
          phonepeSaltIndex,
          bankEnabled,
          bankAccountName,
          bankAccountNo,
          bankIfsc,
          bankName,
          bankBranch,
          status,
          statusMessage,
          j(methods),
          tenantId,
        ]
      );
    } else {
      await ctx.db.exec(
        `INSERT INTO shop_payment_settings (
           tenant_id, upi_enabled, qr_type, provider, static_upi_id, static_merchant_name,
           rzp_enabled, rzp_mode, rzp_key_id, rzp_key_secret_encrypted, rzp_webhook_secret_encrypted, rzp_qr_expiry_minutes,
           paytm_enabled, paytm_mode, paytm_mid, paytm_merchant_key_encrypted, paytm_website,
           phonepe_enabled, phonepe_mode, phonepe_mid, phonepe_salt_key_encrypted, phonepe_salt_index,
           bank_enabled, bank_account_name, bank_account_no, bank_ifsc, bank_name, bank_branch,
           status, status_message, enabled_methods
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          upiEnabled,
          qrType,
          provider,
          staticUpiId,
          staticMerchantName,
          rzpEnabled,
          rzpMode,
          rzpKeyId,
          rzpKeySecretEncrypted,
          rzpWebhookSecretEncrypted,
          rzpQrExpiryMinutes,
          paytmEnabled,
          paytmMode,
          paytmMid,
          paytmMerchantKeyEncrypted,
          paytmWebsite,
          phonepeEnabled,
          phonepeMode,
          phonepeMid,
          phonepeSaltKeyEncrypted,
          phonepeSaltIndex,
          bankEnabled,
          bankAccountName,
          bankAccountNo,
          bankIfsc,
          bankName,
          bankBranch,
          status,
          statusMessage,
          j(methods),
        ]
      );
    }

    await audit(ctx.db, ctx, {
      action: 'payment_settings.update',
      entity: 'shop_payment_settings',
      entityId: tenantId,
      detail: {
        qrType,
        provider,
        rzpEnabled,
        rzpMode,
        rzpKeyId,
        paytmEnabled,
        paytmMode,
        paytmMid,
        phonepeEnabled,
        phonepeMode,
        phonepeMid,
        status,
      },
    });

    return {
      upiEnabled,
      qrType,
      provider,
      staticUpiId,
      staticMerchantName,
      rzpEnabled,
      rzpMode,
      rzpKeyId,
      hasKeySecret: Boolean(rzpKeySecretEncrypted),
      hasWebhookSecret: Boolean(rzpWebhookSecretEncrypted),
      maskedKeySecret: rzpKeySecretEncrypted ? '••••••••••••••••' : undefined,
      rzpQrExpiryMinutes,
      paytmEnabled,
      paytmMode,
      paytmMid,
      hasPaytmKey: Boolean(paytmMerchantKeyEncrypted),
      paytmWebsite,
      phonepeEnabled,
      phonepeMode,
      phonepeMid,
      hasPhonePeSaltKey: Boolean(phonepeSaltKeyEncrypted),
      phonepeSaltIndex,
      bankEnabled,
      bankAccountName,
      bankAccountNo,
      bankIfsc,
      bankName,
      bankBranch,
      status,
      statusMessage,
      enabledMethods: methods,
    } satisfies PublicPaymentSettings;
  });
}
