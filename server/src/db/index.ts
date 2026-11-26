import { MIGRATIONS } from './schema.ts';

/**
 * Thin database layer. All SQL in this project is plain PostgreSQL written with `?` placeholders.
 * Production: the `pg` package against Neon (DATABASE_URL).
 * Dev/test without installing anything: the built-in wire driver against a local trust-auth Postgres.
 */
export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = any>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Returns the affected row count. */
  exec(sql: string, params?: unknown[]): Promise<number>;
}
export interface DB extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly driver: string;
}

export interface RawConn {
  run(sql: string, params: unknown[]): Promise<{ rows: any[]; rowCount: number }>;
  release(): void;
}
export interface RawPool {
  connect(): Promise<RawConn>;
  end(): Promise<void>;
}

/** Convert `?` placeholders to `$1, $2 ...` (ignores ? inside single-quoted strings). */
export function toPgPlaceholders(sql: string): string {
  let out = '';
  let n = 0;
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") inStr = !inStr;
    if (c === '?' && !inStr) out += '$' + ++n;
    else out += c;
  }
  return out;
}

/**
 * Runs a READ-ONLY function with its queries sent to the database in parallel instead of one by one.
 *
 * The database is far away (every query waits ~0.3 s for the round trip), so a report that runs
 * 20 queries in a row takes 6 s even though each query is fast. This helper:
 *   1. does a dry run of `fn` with a recorder that answers every query with "no rows" and notes
 *      each query (SQL + params),
 *   2. sends all the noted queries at once,
 *   3. runs `fn` for real, answering each query from those results.
 * `fn`'s logic is untouched. A query the dry run did not foresee (because its SQL or params depend
 * on an earlier result) simply runs normally at that point, so results are always correct.
 * `fn` must not write: exec() is refused in the dry run.
 */
export async function runWithParallelReads<T>(db: Queryable, fn: (q: Queryable) => Promise<T>): Promise<T> {
  type Call = { kind: 'one' | 'query'; sql: string; params: unknown[] | undefined };
  const keyOf = (kind: string, sql: string, params?: unknown[]) => `${kind}\u0000${sql}\u0000${JSON.stringify(params ?? [])}`;
  const planned = new Map<string, Call>();
  const recorder: Queryable = {
    query: async (sql, params) => { planned.set(keyOf('query', sql, params), { kind: 'query', sql, params }); return []; },
    one: async (sql, params) => { planned.set(keyOf('one', sql, params), { kind: 'one', sql, params }); return undefined; },
    exec: async () => { throw new Error('runWithParallelReads: writes are not allowed in a read-only function'); },
  };
  try {
    await fn(recorder);
  } catch {
    // The dry run sees empty data; if the logic trips over that, we still use whatever it planned.
  }
  const inFlight = new Map<string, Promise<any>>();
  for (const [key, c] of planned) {
    const p = c.kind === 'one' ? db.one(c.sql, c.params) : db.query(c.sql, c.params);
    p.catch(() => {}); // errors surface where the real run awaits this query
    inFlight.set(key, p);
  }
  const replay: Queryable = {
    query: (sql, params) => inFlight.get(keyOf('query', sql, params)) ?? db.query(sql, params),
    one: (sql, params) => inFlight.get(keyOf('one', sql, params)) ?? db.one(sql, params),
    exec: (sql, params) => db.exec(sql, params),
  };
  return fn(replay);
}

/** JSON columns: always pass JSON.stringify(value) so arrays are not mistaken for Postgres arrays. */
export const j = (v: unknown): string => JSON.stringify(v ?? null);

/** snake_case column names -> camelCase keys (top level only; JSON column contents are untouched). */
function camelKeys(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(row)) out[k.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase())] = row[k];
  return out;
}

export function createDB(pool: RawPool, driver: string): DB {
  const bind = (c: RawConn): Queryable => {
    const run = async (sql: string, params: unknown[] = []) => {
      const r = await c.run(toPgPlaceholders(sql), params);
      return { rows: r.rows.map(camelKeys), rowCount: r.rowCount };
    };
    return {
      query: async (sql, params) => (await run(sql, params)).rows as any[],
      one: async (sql, params) => (await run(sql, params)).rows[0] as any,
      exec: async (sql, params) => (await run(sql, params)).rowCount,
    };
  };
  const once = async <T>(f: (q: Queryable) => Promise<T>): Promise<T> => {
    const c = await pool.connect();
    try { return await f(bind(c)); } finally { c.release(); }
  };
  const direct: Queryable = {
    query: (sql, params) => once((q) => q.query(sql, params)),
    one: (sql, params) => once((q) => q.one(sql, params)),
    exec: (sql, params) => once((q) => q.exec(sql, params)),
  };
  return {
    ...direct,
    driver,
    async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
      const c = await pool.connect();
      const q = bind(c);
      try {
        await c.run('BEGIN', []);
        const r = await fn(q);
        await c.run('COMMIT', []);
        return r;
      } catch (e) {
        try { await c.run('ROLLBACK', []); } catch { /* connection may be gone */ }
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}

function normalizeRow(row: any): any {
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (v instanceof Date) row[k] = v.toISOString();
    else if (typeof v === 'bigint') row[k] = Number(v);
  }
  return row;
}

/** Real driver: the `pg` package (works with Neon's pooled or direct connection string). */
export async function connectPg(url: string): Promise<DB> {
  const modName = 'pg'; // dynamic so the project still starts (with a clear message) when pg is not installed
  let pg: any;
  try {
    pg = (await import(modName)).default;
  } catch {
    throw new Error('The "pg" package is not installed. Run "npm install" first.');
  }
  pg.types.setTypeParser(20, (v: string) => Number(v)); // int8 -> number (money is paise, always < 2^53)
  let connUrl = url;
  if (connUrl.includes('sslmode=') && !connUrl.includes('uselibpqcompat=')) {
    const sep = connUrl.includes('?') ? '&' : '?';
    connUrl = `${connUrl}${sep}uselibpqcompat=true`;
  }
  // Opening a new connection to the hosted database costs ~2 s (TLS + auth over a long distance),
  // so connections are kept open for 10 minutes instead of being dropped after 10 s of quiet.
  const pool = new pg.Pool({
    connectionString: connUrl,
    max: Number(process.env.DB_POOL_MAX ?? 20),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 600_000),
    connectionTimeoutMillis: 20_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  // While the app is in use, ping the database every 45 s so the pooled connection (and a
  // scale-to-zero database) stays warm. Stops pinging after 10 minutes without any query.
  let lastActivity = Date.now();
  const warmTimer = setInterval(() => {
    if (Date.now() - lastActivity > 600_000) return;
    pool.query('SELECT 1').catch(() => {});
  }, 45_000);
  warmTimer.unref?.();
  pool.on('error', (e: Error) => {
    console.warn(JSON.stringify({ level: 'warn', msg: 'pg pool error (handled)', error: e.message }));
  });
  pool.on('connect', (client: any) => {
    client.on('error', (err: any) => {
      console.warn(JSON.stringify({ level: 'warn', msg: 'pg client socket error (handled)', error: err?.message || String(err) }));
    });
  });
  const raw: RawPool = {
    async connect() {
      lastActivity = Date.now();
      const client = await pool.connect();
      return {
        async run(sql, params) {
          const r = await client.query(sql, params);
          return { rows: (r.rows as any[]).map(normalizeRow), rowCount: r.rowCount ?? r.rows.length };
        },
        release: () => client.release(),
      };
    },
    end: () => { clearInterval(warmTimer); return pool.end(); },
  };
  return createDB(raw, 'pg');
}

export async function connectDb(): Promise<DB> {
  const driver = process.env.DB_DRIVER ?? 'pg';
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and paste your Neon connection string.');
  if (driver === 'wire') {
    const { connectWire } = await import('./wire.ts');
    return connectWire(url);
  }
  return connectPg(url);
}

/** Apply pending schema migrations (safe to run on every start; serialised with an advisory lock). */
export async function migrate(db: DB): Promise<number[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const applied: number[] = [];
  await db.tx(async (q) => {
    await q.exec('SELECT pg_advisory_xact_lock(727274)');
    const done = new Set((await q.query<{ version: number }>('SELECT version FROM schema_migrations')).map((r) => r.version));
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      for (const stmt of m.statements) await q.exec(stmt);
      await q.exec('INSERT INTO schema_migrations(version) VALUES (?)', [m.version]);
      applied.push(m.version);
    }
  });
  return applied;
}
