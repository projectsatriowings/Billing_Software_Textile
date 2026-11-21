// server/src/routes/moduleManagement.ts
import { requireUser } from '../auth.ts';
import { bad, forbidden, type Router, type Handler } from '../http.ts';
import { newId } from '../security.ts';
import { audit } from '../audit.ts';
import { requireDeveloperMode } from './developer.ts';
import {
  DEFAULT_ROLE_MODULE_ACCESS,
  type RoleModuleAccessConfig,
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

    // Cashier interface is completely independent from Module Management
    if (ctx.user.role === 'cashier') return;

    const access = await getTenantModuleAccess(ctx.db, ctx.user.tenantId);
    const canonicalRole = (ctx.user.role === 'owner' || isSuperAdmin ? 'owner' : ctx.user.role) as 'owner' | 'manager';
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

    const body = ctx.body as {
      access?: RoleModuleAccessConfig;
      changes?: Array<{ role: 'owner' | 'manager' | 'cashier'; moduleKey: string; enabled: boolean }>;
    };

    if (!body || typeof body !== 'object') {
      throw bad('Invalid configuration payload provided.', 'INVALID_PAYLOAD');
    }

    const tenantId = user.tenantId;
    const currentConfig = await getTenantModuleAccess(ctx.db, tenantId);

    // Collect all requested changes to evaluate (only Super Admin and Store Manager)
    const candidateChanges: Array<{
      role: 'owner' | 'manager';
      moduleKey: string;
      enabled: boolean;
    }> = [];

    if (Array.isArray(body.changes)) {
      for (const ch of body.changes) {
        if (!ch || typeof ch !== 'object') continue;
        const role = ch.role as 'owner' | 'manager';
        if (role !== 'owner' && role !== 'manager') continue;
        if (typeof ch.moduleKey !== 'string' || !ch.moduleKey.trim()) continue;
        candidateChanges.push({
          role,
          moduleKey: ch.moduleKey.trim(),
          enabled: Boolean(ch.enabled),
        });
      }
    } else if (body.access && typeof body.access === 'object') {
      const roles: Array<'owner' | 'manager'> = ['owner', 'manager'];
      for (const role of roles) {
        const moduleMap = body.access[role];
        if (moduleMap && typeof moduleMap === 'object') {
          for (const [moduleKey, enabled] of Object.entries(moduleMap)) {
            candidateChanges.push({
              role,
              moduleKey,
              enabled: Boolean(enabled),
            });
          }
        }
      }
    } else {
      throw bad('Payload must provide either "changes" array or "access" object.', 'INVALID_PAYLOAD');
    }

    // Validate mandatory locks and filter only items that actually changed compared to currentConfig
    const toUpdate: Array<{
      role: 'owner' | 'manager';
      moduleKey: string;
      effectiveEnabled: boolean;
    }> = [];

    const seen = new Set<string>();

    for (const ch of candidateChanges) {
      // Super Admin Settings cannot be disabled
      if (ch.role === 'owner' && ch.moduleKey === 'settings' && ch.enabled === false) {
        throw bad('Settings is mandatory for Super Admin and cannot be disabled.', 'SETTINGS_LOCKED');
      }

      const effectiveEnabled = ch.role === 'owner' && ch.moduleKey === 'settings' ? true : ch.enabled;
      const currentVal = currentConfig[ch.role]?.[ch.moduleKey];

      // Only update if value actually changed in DB
      if (currentVal !== effectiveEnabled) {
        const compositeKey = `${ch.role}:${ch.moduleKey}`;
        if (!seen.has(compositeKey)) {
          seen.add(compositeKey);
          toUpdate.push({
            role: ch.role,
            moduleKey: ch.moduleKey,
            effectiveEnabled,
          });
        }
      }
    }

    // If no changes exist, return early without any DB queries
    if (toUpdate.length === 0) {
      return {
        success: true,
        message: 'Module access is up to date (no changes detected)',
        access: currentConfig,
        updatedCount: 0,
      };
    }

    // Execute a single bulk INSERT statement in one database roundtrip
    const rowPlaceholders = '(?, ?, ?, ?, ?, ?, now())';
    const sql = `INSERT INTO role_module_access (id, tenant_id, role, module_key, enabled, updated_by, updated_at)
                 VALUES ${toUpdate.map(() => rowPlaceholders).join(', ')}
                 ON CONFLICT (tenant_id, role, module_key)
                 DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`;

    const params: any[] = [];
    for (const item of toUpdate) {
      params.push(newId('rma'), tenantId, item.role, item.moduleKey, item.effectiveEnabled, user.id);
    }

    await ctx.db.tx(async (tx: any) => {
      await tx.exec(sql, params);
    });

    // Update in-memory cache directly without re-querying the database
    const updatedConfig: RoleModuleAccessConfig = {
      owner: { ...currentConfig.owner },
      manager: { ...currentConfig.manager },
      cashier: { ...currentConfig.cashier },
    };

    for (const item of toUpdate) {
      updatedConfig[item.role][item.moduleKey] = item.effectiveEnabled;
    }
    updatedConfig.owner.settings = true;

    accessCache.set(tenantId, { config: updatedConfig, timestamp: Date.now() });

    // Non-blocking audit log
    audit(ctx.db, ctx, {
      action: 'module_access.update',
      entity: 'role_module_access',
      entityId: 'role_modules',
      detail: {
        updatedBy: user.name,
        updatedCount: toUpdate.length,
        changes: toUpdate.map((u) => ({ role: u.role, moduleKey: u.moduleKey, enabled: u.effectiveEnabled })),
      },
    }).catch((err) => console.error('[ModuleManagement] Audit log error:', err));

    return {
      success: true,
      message: `Successfully updated ${toUpdate.length} module configuration${toUpdate.length > 1 ? 's' : ''}`,
      access: updatedConfig,
      updatedCount: toUpdate.length,
    };
  });
}
