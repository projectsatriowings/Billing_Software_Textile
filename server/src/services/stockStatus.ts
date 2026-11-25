export type DeactivationReason = 'out_of_stock' | 'manual' | null;

export interface StockSyncResult {
  itemId: string;
  previousActive: boolean;
  active: boolean;
  deactivationReason: DeactivationReason;
  stockMilli: number;
  changed: boolean;
}

export interface DbClientOrTx {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string, params?: unknown[]): Promise<any>;
  one?<T = any>(sql: string, params?: unknown[]): Promise<T | undefined | null>;
}

/**
 * Synchronizes the active/inactive status and deactivation_reason of items based on their
 * branch stock availability.
 *
 * Business Rules:
 * 1. If track_stock is false, stock does not affect active status.
 * 2. If available stock reaches 0 (or <= 0) and item is currently active:
 *    -> Automatically set active = false, deactivation_reason = 'out_of_stock'.
 * 3. When an inactive product is restocked (available stock > 0):
 *    -> If deactivation_reason === 'out_of_stock' (or null / historical zero-stock):
 *       -> Automatically set active = true, deactivation_reason = NULL.
 *    -> If deactivation_reason === 'manual':
 *       -> PRESERVE MANUAL STATUS! Do NOT reactivate when stock arrives.
 * 4. Branch-specific stock quantity:
 *    Calculates stock based on stock_moves for the target branch (excluding DAMAGED/DEFECTIVE returns).
 */
export async function syncItemStockStatus(
  db: DbClientOrTx,
  tenantId: string,
  itemIds: string | string[],
  branchIdOrCode?: string | null,
): Promise<StockSyncResult[]> {
  const rawList = Array.isArray(itemIds) ? itemIds : [itemIds];
  const ids = Array.from(new Set(rawList.map((id) => (id ? String(id).trim() : '')).filter(Boolean)));
  if (ids.length === 0) return [];

  let targetBranchId: string | null = null;
  let targetBranchCode: string | null = null;

  if (branchIdOrCode) {
    const branchRows = await db.query<{ id: string; code: string }>(
      'SELECT id, code FROM branches WHERE tenant_id = ? AND (id = ? OR UPPER(code) = UPPER(?)) AND deleted_at IS NULL LIMIT 1',
      [tenantId, branchIdOrCode, branchIdOrCode],
    );
    if (branchRows && branchRows.length > 0) {
      targetBranchId = branchRows[0].id;
      targetBranchCode = branchRows[0].code;
    } else {
      targetBranchId = branchIdOrCode;
      targetBranchCode = branchIdOrCode;
    }
  }

  // Fetch items along with their live branch stock from stock_moves
  const items = await db.query<{
    id: string;
    tenant_id: string;
    branch_id: string | null;
    track_stock: boolean;
    active: boolean;
    deactivation_reason: string | null;
    stock_milli: string | number;
  }>(
    `SELECT
       i.id,
       i.tenant_id,
       i.branch_id,
       i.track_stock,
       i.active,
       i.deactivation_reason,
       COALESCE((
         SELECT SUM(sm.qty_milli)
         FROM stock_moves sm
         WHERE sm.item_id = i.id
           AND sm.tenant_id = i.tenant_id
           AND (
             (COALESCE(?, i.branch_id) IS NOT NULL AND (
               sm.branch_id = COALESCE(?, i.branch_id)
               OR (sm.branch_id IS NULL AND (
                 UPPER(sm.location) = UPPER(COALESCE(?, i.branch_id))
                 OR UPPER(sm.location) = UPPER(?)
               ))
             ))
             OR (COALESCE(?, i.branch_id) IS NULL)
           )
           AND (sm.location IS NULL OR UPPER(sm.location) NOT IN ('DAMAGED', 'DEFECTIVE'))
       ), 0)::bigint AS stock_milli
     FROM items i
     WHERE i.tenant_id = ? AND i.id = ANY(?)`,
    [
      targetBranchId,
      targetBranchId,
      targetBranchId,
      targetBranchCode || targetBranchId || '',
      targetBranchId,
      tenantId,
      ids,
    ],
  );

  const results: StockSyncResult[] = [];

  for (const item of items) {
    const trackStock = Boolean(item.track_stock);
    const currentActive = Boolean(item.active);
    const currentReason = (item.deactivation_reason as DeactivationReason) || null;
    const stockMilli = Number(item.stock_milli || 0);

    if (!trackStock) {
      results.push({
        itemId: item.id,
        previousActive: currentActive,
        active: currentActive,
        deactivationReason: currentReason,
        stockMilli,
        changed: false,
      });
      continue;
    }

    let nextActive = currentActive;
    let nextReason: DeactivationReason = currentReason;
    let changed = false;

    if (stockMilli <= 0) {
      if (currentActive) {
        // Active item hit 0 stock -> automatically change status to INACTIVE
        nextActive = false;
        nextReason = 'out_of_stock';
        changed = true;
      } else {
        // Item is already inactive. If reason is not set or was already out_of_stock, ensure it is recorded
        if (!currentReason) {
          nextReason = 'out_of_stock';
          changed = true;
        }
        // If currentReason === 'manual', preserve 'manual'
      }
    } else {
      // Available stock > 0
      if (!currentActive) {
        if (currentReason === 'out_of_stock' || !currentReason) {
          // Inactive product receives stock -> automatically change status back to ACTIVE
          nextActive = true;
          nextReason = null;
          changed = true;
        }
        // If currentReason === 'manual': PRESERVE manual product status!
        // Do NOT automatically reactivate when stock becomes available.
      } else {
        if (currentReason) {
          nextReason = null;
          changed = true;
        }
      }
    }

    if (changed) {
      await db.exec(
        'UPDATE items SET active = ?, deactivation_reason = ?, updated_at = now() WHERE id = ? AND tenant_id = ?',
        [nextActive, nextReason, item.id, tenantId],
      );
    }

    results.push({
      itemId: item.id,
      previousActive: currentActive,
      active: nextActive,
      deactivationReason: nextReason,
      stockMilli,
      changed,
    });
  }

  return results;
}
