// Moves stock that was received into another branch's product record ("small box") onto the
// branch's own product record ("big box").
//
// A stray record is a stock move in branch B for an item that belongs to a different branch, when
// branch B has its own item with the same SKU or barcode. For each one:
//   - stock_moves in branch B           -> re-pointed to B's own item
//   - invoice_lines of those bills      -> re-pointed to B's own item
//   - product_barcodes in branch B      -> moved to B's own item (dropped if B's item already has it)
//
// Usage:
//   node scripts/merge-stray-branch-items.mjs            dry run: makes the changes, prints them, ROLLS BACK
//   node scripts/merge-stray-branch-items.mjs --apply    makes the changes and COMMITS
import pg from 'pg';

try { process.loadEnvFile('.env'); } catch { /* env may already be set */ }

const APPLY = process.argv.includes('--apply');
const url = String(process.env.DATABASE_URL || '').replace(/&?channel_binding=require/, '');
if (!url) throw new Error('DATABASE_URL is not set');

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
await client.connect();

const fmt = (milli) => (Number(milli) / 1000).toLocaleString('en-IN');

async function branchStock(itemId, branchId) {
  const r = await client.query(
    'SELECT COALESCE(SUM(qty_milli), 0)::bigint AS s FROM stock_moves WHERE item_id = $1 AND branch_id = $2',
    [itemId, branchId],
  );
  return r.rows[0].s;
}

try {
  await client.query('BEGIN');

  const { rows: groups } = await client.query(`
    SELECT i.tenant_id, i.name, sm.branch_id, b.name AS branch_name,
           sm.item_id AS stray_item, own.id AS own_item
    FROM stock_moves sm
    JOIN items i ON i.id = sm.item_id
    JOIN branches b ON b.id = sm.branch_id
    JOIN LATERAL (
      SELECT o.id FROM items o
      WHERE o.tenant_id = i.tenant_id AND o.branch_id = sm.branch_id AND o.id <> i.id
        AND (
          (NULLIF(TRIM(o.sku), '') IS NOT NULL AND UPPER(TRIM(o.sku)) = UPPER(TRIM(i.sku)))
          OR (NULLIF(TRIM(o.barcode), '') IS NOT NULL AND TRIM(o.barcode) = TRIM(i.barcode))
        )
      ORDER BY o.active DESC, o.created_at ASC
      LIMIT 1
    ) own ON true
    WHERE sm.branch_id IS NOT NULL AND sm.branch_id <> i.branch_id
    GROUP BY 1, 2, 3, 4, 5, 6
    ORDER BY 1, 4, 2`);

  if (groups.length === 0) {
    console.log('Nothing to fix: no stray product records found.');
  }

  for (const g of groups) {
    const ownBefore = await branchStock(g.own_item, g.branch_id);
    const strayBefore = await branchStock(g.stray_item, g.branch_id);

    const { rows: moves } = await client.query(
      `SELECT id, kind, qty_milli, ref_type, ref_id, created_at FROM stock_moves
       WHERE item_id = $1 AND branch_id = $2 ORDER BY created_at`,
      [g.stray_item, g.branch_id],
    );
    const invoiceIds = [...new Set(moves.filter((m) => m.ref_type === 'invoice' && m.ref_id).map((m) => m.ref_id))];

    const movesRes = await client.query(
      'UPDATE stock_moves SET item_id = $1 WHERE item_id = $2 AND branch_id = $3',
      [g.own_item, g.stray_item, g.branch_id],
    );
    const linesRes = invoiceIds.length
      ? await client.query(
          'UPDATE invoice_lines SET item_id = $1 WHERE item_id = $2 AND invoice_id = ANY($3::text[])',
          [g.own_item, g.stray_item, invoiceIds],
        )
      : { rowCount: 0 };
    // Barcodes linked to the stray record in this branch: drop duplicates, move the rest.
    const bcDropped = await client.query(
      `DELETE FROM product_barcodes pb
       WHERE pb.product_id = $1 AND pb.branch_id = $2
         AND EXISTS (SELECT 1 FROM product_barcodes o WHERE o.product_id = $3 AND o.branch_id = $2 AND o.barcode = pb.barcode)`,
      [g.stray_item, g.branch_id, g.own_item],
    );
    const bcMoved = await client.query(
      'UPDATE product_barcodes SET product_id = $1 WHERE product_id = $2 AND branch_id = $3',
      [g.own_item, g.stray_item, g.branch_id],
    );

    const ownAfter = await branchStock(g.own_item, g.branch_id);
    const strayAfter = await branchStock(g.stray_item, g.branch_id);

    console.log(`\n${g.name}  @ ${g.branch_name} (${g.branch_id})`);
    console.log(`  small box ${g.stray_item}  ->  big box ${g.own_item}`);
    for (const m of moves) {
      const when = new Date(m.created_at).toISOString().slice(0, 16).replace('T', ' ');
      console.log(`    move ${m.kind.padEnd(9)} ${fmt(m.qty_milli).padStart(6)}  ${when}  ${m.ref_type ?? ''} ${m.ref_id ?? ''}`);
    }
    console.log(`  stock moves moved: ${movesRes.rowCount}, bill lines moved: ${linesRes.rowCount}, barcodes moved: ${bcMoved.rowCount}, duplicate barcodes dropped: ${bcDropped.rowCount}`);
    console.log(`  big box stock:   ${fmt(ownBefore)} -> ${fmt(ownAfter)}`);
    console.log(`  small box stock: ${fmt(strayBefore)} -> ${fmt(strayAfter)}`);
  }

  if (APPLY) {
    await client.query('COMMIT');
    console.log('\nAPPLIED: changes committed.');
  } else {
    await client.query('ROLLBACK');
    console.log('\nDRY RUN: all changes rolled back. Run with --apply to commit.');
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Failed, nothing changed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
