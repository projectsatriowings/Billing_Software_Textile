// Wipes all business data so the app can be re-tested with fresh uploads.
// KEEPS: logins (users) and what they need to sign in — tenants (shops), branches, counters —
// plus role/module access, product categories and the schema migration history.
// Everything else (sales, products, stock, customers, shifts, closings, settings, number series,
// logs ...) is emptied for ALL shops.
//
// Usage:
//   node scripts/wipe-test-data.mjs            dry run: wipes inside a transaction, prints, ROLLS BACK
//   node scripts/wipe-test-data.mjs --apply    wipes and COMMITS (cannot be undone — back up first)
import pg from 'pg';

try { process.loadEnvFile('.env'); } catch { /* env may already be set */ }

const APPLY = process.argv.includes('--apply');
const KEEP = new Set(['users', 'tenants', 'branches', 'counters', 'role_module_access', 'categories', 'schema_migrations']);

const url = String(process.env.DATABASE_URL || '').replace(/&?channel_binding=require/, '');
if (!url) throw new Error('DATABASE_URL is not set');
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
await client.connect();

const count = async (t) => (await client.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n;

try {
  const tables = (await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  )).rows.map((r) => r.table_name);
  const wipe = tables.filter((t) => !KEEP.has(t));

  // A kept table must not point at a wiped one, or its rows would be left dangling.
  const blockers = (await client.query(
    `SELECT tc.table_name AS src, kcu.column_name AS col, ccu.table_name AS ref
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
     JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
  )).rows.filter((r) => KEEP.has(r.src) && !KEEP.has(r.ref));
  if (blockers.length) {
    throw new Error('Kept tables reference wiped tables: ' + blockers.map((b) => `${b.src}.${b.col} -> ${b.ref}`).join(', '));
  }

  await client.query('BEGIN');
  const before = {};
  for (const t of wipe) before[t] = await count(t);

  // One TRUNCATE for all wiped tables; no CASCADE, so it fails rather than touching a kept table.
  await client.query(`TRUNCATE ${wipe.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY`);

  console.log('WIPED (rows before -> after):');
  for (const t of wipe) if (before[t] > 0) console.log(`  ${t.padEnd(30)} ${String(before[t]).padStart(6)} -> ${await count(t)}`);
  console.log(`  (+ ${wipe.filter((t) => before[t] === 0).length} tables that were already empty)`);
  console.log('KEPT:');
  for (const t of KEEP) console.log(`  ${t.padEnd(30)} ${String(await count(t)).padStart(6)} rows`);

  if (APPLY) {
    await client.query('COMMIT');
    console.log('\nAPPLIED: data wiped and committed.');
  } else {
    await client.query('ROLLBACK');
    console.log('\nDRY RUN: nothing deleted (rolled back). Run with --apply to wipe.');
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Failed, nothing changed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
