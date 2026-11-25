import test from 'node:test';
import assert from 'node:assert/strict';
import { syncItemStockStatus, type DeactivationReason, type DbClientOrTx } from '../../server/src/services/stockStatus.ts';

// ---------------------------------------------------------------------------
// Mock In-Memory Database for Stock Status Sync Testing
// ---------------------------------------------------------------------------
interface MockItem {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  track_stock: boolean;
  active: boolean;
  deactivation_reason: string | null;
}

interface MockStockMove {
  item_id: string;
  tenant_id: string;
  branch_id: string | null;
  location: string | null;
  qty_milli: number;
}

function createMockDb(initialItems: MockItem[], initialMoves: MockStockMove[]): DbClientOrTx & {
  items: Map<string, MockItem>;
  moves: MockStockMove[];
} {
  const itemsMap = new Map<string, MockItem>();
  for (const it of initialItems) {
    itemsMap.set(it.id, { ...it });
  }
  const moves = [...initialMoves];

  const mockDb: DbClientOrTx & { items: Map<string, MockItem>; moves: MockStockMove[] } = {
    items: itemsMap,
    moves,
    query: async <T = any>(sql: string, params: unknown[] = []): Promise<T[]> => {
      // Branch query
      if (sql.includes('FROM branches')) {
        return [] as T[];
      }
      // Main items and stock query
      if (sql.includes('FROM items i')) {
        const tenantId = params[params.length - 2] as string;
        const requestedIds = params[params.length - 1] as string[];
        const targetBranchId = params[0] as string | null;

        const results: any[] = [];
        for (const id of requestedIds) {
          const it = itemsMap.get(id);
          if (!it || it.tenant_id !== tenantId) continue;

          // Calculate stock from moves
          const branchToCheck = targetBranchId || it.branch_id;
          let stockMilli = 0;
          for (const m of moves) {
            if (m.item_id !== it.id || m.tenant_id !== tenantId) continue;
            // Exclude damaged/defective
            if (m.location && (m.location.toUpperCase() === 'DAMAGED' || m.location.toUpperCase() === 'DEFECTIVE')) {
              continue;
            }
            if (branchToCheck) {
              if (m.branch_id === branchToCheck || (m.branch_id === null && m.location && m.location.toUpperCase() === branchToCheck.toUpperCase())) {
                stockMilli += m.qty_milli;
              }
            } else {
              stockMilli += m.qty_milli;
            }
          }

          results.push({
            id: it.id,
            tenant_id: it.tenant_id,
            branch_id: it.branch_id,
            track_stock: it.track_stock,
            active: it.active,
            deactivation_reason: it.deactivation_reason,
            stock_milli: stockMilli,
          });
        }
        return results as T[];
      }
      return [] as T[];
    },
    exec: async (sql: string, params: unknown[] = []): Promise<{ rowCount: number }> => {
      if (sql.includes('UPDATE items SET active = ?')) {
        const [nextActive, nextReason, itemId, tenantId] = params as [boolean, string | null, string, string];
        const it = itemsMap.get(itemId);
        if (it && it.tenant_id === tenantId) {
          it.active = nextActive;
          it.deactivation_reason = nextReason;
          return { rowCount: 1 };
        }
      }
      return { rowCount: 0 };
    },
  };

  return mockDb;
}

// ---------------------------------------------------------------------------
// 1. Core Stock Status Transition Matrix
// ---------------------------------------------------------------------------
test('Rule: Stock = 10 units -> Product is ACTIVE', async () => {
  const db = createMockDb(
    [
      { id: 'item_1', tenant_id: 't1', branch_id: 'br_main', track_stock: true, active: false, deactivation_reason: 'out_of_stock' },
    ],
    [
      { item_id: 'item_1', tenant_id: 't1', branch_id: 'br_main', location: 'MAIN', qty_milli: 10_000 },
    ],
  );

  const res = await syncItemStockStatus(db, 't1', ['item_1'], 'br_main');
  assert.equal(res.length, 1);
  assert.equal(res[0].active, true, 'Product must be ACTIVE when stock = 10 units');
  assert.equal(res[0].deactivationReason, null);
  assert.equal(res[0].changed, true);

  // Verify persistence in DB
  const inDb = db.items.get('item_1');
  assert.equal(inDb?.active, true);
  assert.equal(inDb?.deactivation_reason, null);
});

test('Rule: Stock decreases 1 to 0 -> Automatically INACTIVE (out_of_stock)', async () => {
  const db = createMockDb(
    [
      { id: 'item_2', tenant_id: 't1', branch_id: 'br_main', track_stock: true, active: true, deactivation_reason: null },
    ],
    [
      { item_id: 'item_2', tenant_id: 't1', branch_id: 'br_main', location: 'MAIN', qty_milli: 1_000 },
      { item_id: 'item_2', tenant_id: 't1', branch_id: 'br_main', location: 'MAIN', qty_milli: -1_000 }, // sale of 1 unit
    ],
  );

  const res = await syncItemStockStatus(db, 't1', ['item_2'], 'br_main');
  assert.equal(res.length, 1);
  assert.equal(res[0].stockMilli, 0);
  assert.equal(res[0].active, false, 'Product must automatically become INACTIVE when stock reaches 0');
  assert.equal(res[0].deactivationReason, 'out_of_stock');
  assert.equal(res[0].changed, true);

  // Verify persistence in DB
  const inDb = db.items.get('item_2');
  assert.equal(inDb?.active, false);
  assert.equal(inDb?.deactivation_reason, 'out_of_stock');
});

test('Rule: Inactive product receives 20 units -> Automatically ACTIVE', async () => {
  const db = createMockDb(
    [
      { id: 'item_3', tenant_id: 't1', branch_id: 'br_main', track_stock: true, active: false, deactivation_reason: 'out_of_stock' },
    ],
    [
      { item_id: 'item_3', tenant_id: 't1', branch_id: 'br_main', location: 'MAIN', qty_milli: 20_000 }, // Restock of 20 units
    ],
  );

  const res = await syncItemStockStatus(db, 't1', ['item_3'], 'br_main');
  assert.equal(res.length, 1);
  assert.equal(res[0].stockMilli, 20_000);
  assert.equal(res[0].active, true, 'Product must automatically reactivate when restocked with 20 units');
  assert.equal(res[0].deactivationReason, null);
  assert.equal(res[0].changed, true);

  const inDb = db.items.get('item_3');
  assert.equal(inDb?.active, true);
  assert.equal(inDb?.deactivation_reason, null);
});

test('Rule: Stock decreases 5 to 2 -> Remains ACTIVE', async () => {
  const db = createMockDb(
    [
      { id: 'item_4', tenant_id: 't1', branch_id: 'br_main', track_stock: true, active: true, deactivation_reason: null },
    ],
    [
      { item_id: 'item_4', tenant_id: 't1', branch_id: 'br_main', location: 'MAIN', qty_milli: 5_000 },
      { item_id: 'item_4', tenant_id: 't1', branch_id: 'br_main', location: 'MAIN', qty_milli: -3_000 }, // Remaining = 2
    ],
  );

  const res = await syncItemStockStatus(db, 't1', ['item_4'], 'br_main');
  assert.equal(res.length, 1);
  assert.equal(res[0].stockMilli, 2_000);
  assert.equal(res[0].active, true, 'Product must remain ACTIVE when stock decreases from 5 to 2');
  assert.equal(res[0].deactivationReason, null);
  assert.equal(res[0].changed, false);
});

// ---------------------------------------------------------------------------
// 2. Manual Product Status Preservation
// ---------------------------------------------------------------------------
test('Rule: Manual inactive product receives stock -> Remains INACTIVE', async () => {
  // A manager explicitly deactivated item_5 (manual deactivation)
  const db = createMockDb(
    [
      { id: 'item_5', tenant_id: 't1', branch_id: 'br_main', track_stock: true, active: false, deactivation_reason: 'manual' },
    ],
    [
      { item_id: 'item_5', tenant_id: 't1', branch_id: 'br_main', location: 'MAIN', qty_milli: 50_000 }, // Received 50 units
    ],
  );

  const res = await syncItemStockStatus(db, 't1', ['item_5'], 'br_main');
  assert.equal(res.length, 1);
  assert.equal(res[0].stockMilli, 50_000);
  assert.equal(res[0].active, false, 'Manual inactive product must NEVER automatically reactivate on stock receipt');
  assert.equal(res[0].deactivationReason, 'manual', 'Must preserve manual deactivation reason');
  assert.equal(res[0].changed, false);

  const inDb = db.items.get('item_5');
  assert.equal(inDb?.active, false);
  assert.equal(inDb?.deactivation_reason, 'manual');
});

// ---------------------------------------------------------------------------
// 3. Non-Stock Tracking Products (track_stock = false)
// ---------------------------------------------------------------------------
test('Rule: Non-stock tracking products (services/labor) remain active regardless of stock', async () => {
  const db = createMockDb(
    [
      { id: 'srv_1', tenant_id: 't1', branch_id: 'br_main', track_stock: false, active: true, deactivation_reason: null },
    ],
    [], // 0 stock moves
  );

  const res = await syncItemStockStatus(db, 't1', ['srv_1'], 'br_main');
  assert.equal(res.length, 1);
  assert.equal(res[0].active, true, 'track_stock = false products must remain active regardless of stock moves');
  assert.equal(res[0].changed, false);
});

// ---------------------------------------------------------------------------
// 4. Branch Stock Isolation
// ---------------------------------------------------------------------------
test('Rule: Branch stock isolation determines status strictly per branch', async () => {
  // Main branch has 0 stock; Tambaram branch has 15 units
  const db = createMockDb(
    [
      { id: 'item_main', tenant_id: 't1', branch_id: 'br_main', track_stock: true, active: true, deactivation_reason: null },
      { id: 'item_tambaram', tenant_id: 't1', branch_id: 'br_tambaram', track_stock: true, active: true, deactivation_reason: null },
    ],
    [
      // Main branch: 0 stock
      { item_id: 'item_main', tenant_id: 't1', branch_id: 'br_main', location: 'MAIN', qty_milli: 0 },
      // Tambaram branch: 15 units
      { item_id: 'item_tambaram', tenant_id: 't1', branch_id: 'br_tambaram', location: 'TAMBARAM', qty_milli: 15_000 },
    ],
  );

  // Sync Main branch: should become inactive
  const resMain = await syncItemStockStatus(db, 't1', ['item_main'], 'br_main');
  assert.equal(resMain[0].active, false, 'Main branch product with 0 stock must become INACTIVE');
  assert.equal(resMain[0].deactivationReason, 'out_of_stock');

  // Sync Tambaram branch: should remain active
  const resTambaram = await syncItemStockStatus(db, 't1', ['item_tambaram'], 'br_tambaram');
  assert.equal(resTambaram[0].active, true, 'Tambaram branch product with 15 units must remain ACTIVE');
  assert.equal(resTambaram[0].deactivationReason, null);
});

// ---------------------------------------------------------------------------
// 5. Damaged and Defective Returns Exclusion
// ---------------------------------------------------------------------------
test('Rule: Damaged and defective returns do NOT reactivate an out-of-stock product', async () => {
  const db = createMockDb(
    [
      { id: 'item_dmg', tenant_id: 't1', branch_id: 'br_main', track_stock: true, active: false, deactivation_reason: 'out_of_stock' },
    ],
    [
      // Damaged return should be ignored in available stock
      { item_id: 'item_dmg', tenant_id: 't1', branch_id: 'br_main', location: 'DAMAGED', qty_milli: 5_000 },
    ],
  );

  const res = await syncItemStockStatus(db, 't1', ['item_dmg'], 'br_main');
  assert.equal(res[0].stockMilli, 0, 'Available stock must exclude DAMAGED goods');
  assert.equal(res[0].active, false, 'Damaged return cannot reactivate an out-of-stock product');
  assert.equal(res[0].deactivationReason, 'out_of_stock');
});

test('Rule: Resellable returns reactivate an out-of-stock product', async () => {
  const db = createMockDb(
    [
      { id: 'item_resell', tenant_id: 't1', branch_id: 'br_main', track_stock: true, active: false, deactivation_reason: 'out_of_stock' },
    ],
    [
      // Resellable return in MAIN location adds to available stock
      { item_id: 'item_resell', tenant_id: 't1', branch_id: 'br_main', location: 'MAIN', qty_milli: 3_000 },
    ],
  );

  const res = await syncItemStockStatus(db, 't1', ['item_resell'], 'br_main');
  assert.equal(res[0].stockMilli, 3_000);
  assert.equal(res[0].active, true, 'Resellable return must reactivate out-of-stock product');
  assert.equal(res[0].deactivationReason, null);
});
