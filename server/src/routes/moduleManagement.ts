// server/src/routes/moduleManagement.ts
import { requireUser } from '../auth.ts';
import { bad, forbidden, type Router, type Handler } from '../http.ts';
import { newId } from '../security.ts';
import { audit } from '../audit.ts';
import { requireDeveloperMode } from './developer.ts';
import {
  DEFAULT_ROLE_MODULE_ACCESS,
  CASHIER_MANDATORY_MODULES,
  type RoleModuleAccessConfig,
  type ModuleAccessMap,
} from '../../../shared/modules.ts';

// In-memory cache for fast module authorization checks (5-minute TTL, invalidated on update)
const accessCache = new Map<string, { config: RoleModuleAccessConfig; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getTenantModuleAccess(
  db: any,
  tenantId: string
): Promise<RoleModuleAccessConfig> {
  const cached = accessCache.get(tenantId);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.config;
  }

  // Deep clone default configuration
  const result: RoleModuleAccessConfig = {
    owner: { ...DEFAULT_ROLE_MODULE_ACCESS.owner },
    manager: { ...DEFAULT_ROLE_MODULE_ACCESS.manager },
    cashier: { ...DEFAULT_ROLE_MODULE_ACCESS.cashier },
  };

  try {
    const rows = await db.query(
      'SELECT role, module_key, enabled FROM role_module_access WHERE tenant_id = ?',
      [tenantId]
    );

    for (const r of rows) {
      const role = r.role as 'owner' | 'manager' | 'cashier';
      if (result[role]) {
        result[role][r.moduleKey ?? r.module_key] = Boolean(r.enabled);
      }
    }
  } catch (err) {
    // If table not yet migrated, fall back gracefully to defaults
    console.warn('[ModuleManagement] Falling back to default role access:', (err as any)?.message);
  }

  // Super Admin Settings is PERMANENTLY locked on
  result.owner.settings = true;

  // Cashier mandatory modules are PERMANENTLY locked on
  for (const modKey of CASHIER_MANDATORY_MODULES) {
    result.cashier[modKey] = true;
  }

  accessCache.set(tenantId, { config: result, timestamp: now });
  return result;
}

export function invalidateModuleAccessCache(tenantId: string) {
  accessCache.delete(tenantId);
}

/**
 * Route middleware to enforce module-level access.
 * Rejects with 403 FORBIDDEN if the requesting user's role has this module turned off.
 */
export function requireModule(moduleKey: string): Handler {
  return async (ctx) => {
    if (!ctx.user) throw forbidden('Authentication required');
    const isSuperAdmin = ctx.user.role === 'owner' || String(ctx.user.role).toUpperCase() === 'SUPER_ADMIN';

    // Super Admin always has access to Settings
    if (isSuperAdmin && moduleKey === 'settings') return;

    // Cashier always has access to mandatory modules
    if (ctx.user.role === 'cashier' && (CASHIER_MANDATORY_MODULES as readonly string[]).includes(moduleKey)) return;

    const access = await getTenantModuleAccess(ctx.db, ctx.user.tenantId);
    const canonicalRole = (ctx.user.role === 'owner' || isSuperAdmin ? 'owner' : ctx.user.role) as 'owner' | 'manager' | 'cashier';
    const roleMap = access[canonicalRole] || DEFAULT_ROLE_MODULE_ACCESS[canonicalRole] || DEFAULT_ROLE_MODULE_ACCESS.owner;

    // If sub-module, check parent module first
    if (moduleKey.includes('.')) {
      const parentKey = moduleKey.split('.')[0];
      if (roleMap[parentKey] === false) {
        throw forbidden('This module is currently disabled for your role.', 'MODULE_DISABLED', {
          module: moduleKey,
          parent: parentKey,
        });
      }
    }

    if (roleMap[moduleKey] === false) {
      throw forbidden('This module is currently disabled for your role.', 'MODULE_DISABLED', {
        module: moduleKey,
      });
    }
  };
}

export function registerModuleManagement(r: Router, tokens: { secret: string }) {
  // 1. GET /api/module-access - Load current configuration for tenant
  r.get('/api/module-access', requireUser, async (ctx) => {
    const tenantId = ctx.user!.tenantId;
    const config = await getTenantModuleAccess(ctx.db, tenantId);
    return {
      success: true,
      access: config,
    };
  });

  // 2. PUT /api/module-access - Save module access configuration (Developer Mode REQUIRED)
  r.put('/api/module-access', requireUser, requireDeveloperMode(tokens), async (ctx) => {
    const user = ctx.user!;
    const isSuperAdmin = user.role === 'owner' || String(user.role).toUpperCase() === 'SUPER_ADMIN';

    if (!isSuperAdmin) {
      throw forbidden('Only Super Admin with Developer Mode can manage module access permissions.', 'SUPER_ADMIN_REQUIRED');
    }

    const body = ctx.body as { access?: RoleModuleAccessConfig };
    if (!body || !body.access || typeof body.access !== 'object') {
      throw bad('Invalid configuration payload provided.', 'INVALID_PAYLOAD');
    }

    const { access } = body;

    // Strict backend enforcement: Super Admin Settings is locked on
    if (access.owner && access.owner.settings === false) {
      throw bad('Settings is mandatory for Super Admin and cannot be disabled.', 'SETTINGS_LOCKED');
    }

    // Strict backend enforcement: Cashier mandatory modules are locked on
    if (access.cashier) {
      for (const modKey of CASHIER_MANDATORY_MODULES) {
        if (access.cashier[modKey] === false) {
          throw bad(
            `Module "${modKey}" is mandatory for Cashier access and cannot be disabled.`,
            'CASHIER_MODULE_LOCKED'
          );
        }
      }
    }

    const tenantId = user.tenantId;
    const roles: Array<'owner' | 'manager' | 'cashier'> = ['owner', 'manager', 'cashier'];

    await ctx.db.tx(async (tx: any) => {
      for (const role of roles) {
        const moduleMap: ModuleAccessMap = access[role] || {};
        for (const [moduleKey, enabled] of Object.entries(moduleMap)) {
          // Double safeguard: Settings for Super Admin and Cashier mandatory modules are always true
          const isCashierMandatory = role === 'cashier' && (CASHIER_MANDATORY_MODULES as readonly string[]).includes(moduleKey);
          const effectiveEnabled = (role === 'owner' && moduleKey === 'settings') || isCashierMandatory
            ? true
            : Boolean(enabled);

          await tx.exec(
            `INSERT INTO role_module_access (id, tenant_id, role, module_key, enabled, updated_by, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, now())
             ON CONFLICT (tenant_id, role, module_key)
             DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`,
            [newId('rma'), tenantId, role, moduleKey, effectiveEnabled, user.id]
          );
        }
      }
    });

    invalidateModuleAccessCache(tenantId);
    const updated = await getTenantModuleAccess(ctx.db, tenantId);

    await audit(ctx.db, ctx, {
      action: 'module_access.update',
      entity: 'role_module_access',
      entityId: 'role_modules',
      detail: {
        updatedBy: user.name,
        roles: Object.keys(access),
      },
    });

    return {
      success: true,
      message: 'Module access updated successfully',
      access: updated,
    };
  });
}
