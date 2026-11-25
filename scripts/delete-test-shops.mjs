// Deletes the shops left behind by the automated tests (server/test/*.test.ts), together with
// their fake logins, branches, counters and any other rows. Test shops are recognised by their id:
// a test prefix followed by a 12+ digit timestamp, e.g. t_wh_test_1794665440615.
// Real/demo shops (t_demo_supermarket, t_demo_pharmacy, ...) never match and are not touched.
//
// Usage:
//   node scripts/delete-test-shops.mjs            dry run: deletes inside a transaction, prints, ROLLS BACK
//   node scripts/delete-test-shops.mjs --apply    deletes and COMMITS
import pg from 'pg';

try { process.loadEnvFile('.env'); } catch { /* env may already be set */ }

const APPLY = process.argv.includes('--apply');
const TEST_ID = '_[0-9]{12,}$';

const url = String(process.env.DATABASE_URL || '').replace(/&?channel_binding=require/, '');
if (!url) throw new Error('DATABASE_URL is not set');
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
await client.connect();

const q = (sql, params) => client.query(sql, params);

try {
  const testShops = (await q(`SELECT id, name FROM tenants WHERE id ~ $1 ORDER BY id`, [TEST_ID])).rows;
  const keptShops = (await q(`SELECT id, name FROM tenants WHERE id !~ $1 ORDER BY id`, [TEST_ID])).rows;
  const ids = testShops.map((t) => t.id);

  // Every table that has a tenant_id column (except tenants itself).
  const tables = (await q(
    `SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'tenant_id' AND table_name <> 'tenants'
     ORDER BY table_name`,
  )).rows.map((r) => r.table_name);

  const countFor = async (t, list) => (await q(`SELECT count(*)::int AS n FROM "${t}" WHERE tenant_id = ANY($1)`, [list])).rows[0].n;
  const keptIds = keptShops.map((t) => t.id);
  const keptBefore = {};
  for (const t of ['users', 'branches', 'counters', 'categories', 'role_module_access']) keptBefore[t] = await countFor(t, keptIds);

  await q('BEGIN');

  // Break the branch <-> user cycle first.
  await q(`UPDATE branches SET manager_id = NULL WHERE tenant_id = ANY($1)`, [ids]);
  await q(`UPDATE users SET counter_id = NULL, branch_id = NULL WHERE tenant_id = ANY($1)`, [ids]);
  await q(`DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ANY($1))`, [ids]);

  // Delete table by table; if a table is still referenced, retry it after the others (savepoints).
  const deleted = {};
  let pending = [...tables];
  for (let pass = 0; pending.length && pass < tables.length + 1; pass++) {
    const failed = [];
    for (const t of pending) {
      await q('SAVEPOINT s');
      try {
        const r = await q(`DELETE FROM "${t}" WHERE tenant_id = ANY($1)`, [ids]);
        deleted[t] = (deleted[t] || 0) + r.rowCount;
        await q('RELEASE SAVEPOINT s');
      } catch {
        await q('ROLLBACK TO SAVEPOINT s');
        failed.push(t);
      }
    }
    if (failed.length === pending.length) throw new Error('Could not delete from: ' + failed.join(', '));
    pending = failed;
  }
  const shopsDeleted = (await q(`DELETE FROM tenants WHERE id = ANY($1)`, [ids])).rowCount;

  console.log(`TEST SHOPS DELETED: ${shopsDeleted}`);
  for (const [t, n] of Object.entries(deleted)) if (n > 0) console.log(`  ${t.padEnd(24)} ${String(n).padStart(5)} rows`);

  console.log(`\nKEPT SHOPS (${keptShops.length}):`);
  for (const s of keptShops) console.log(`  ${s.id.padEnd(22)} ${s.name}`);
  console.log('KEPT SHOPS\' DATA (before -> after, must be equal):');
  let changed = false;
  for (const t of Object.keys(keptBefore)) {
    const after = await countFor(t, keptIds);
    if (after !== keptBefore[t]) changed = true;
    console.log(`  ${t.padEnd(24)} ${keptBefore[t]} -> ${after}`);
  }
  if (changed) throw new Error('A kept shop lost rows — aborting.');

  console.log('\nLEFT IN DATABASE:');
  for (const t of ['tenants', 'users', 'branches', 'counters']) {
    console.log(`  ${t.padEnd(24)} ${(await q(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n}`);
  }

  if (APPLY) {
    await q('COMMIT');
    console.log('\nAPPLIED: test shops deleted and committed.');
  } else {
    await q('ROLLBACK');
    console.log('\nDRY RUN: nothing deleted (rolled back). Run with --apply to delete.');
  }
} catch (err) {
  await q('ROLLBACK').catch(() => {});
  console.error('Failed, nothing changed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
