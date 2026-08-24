/**
 * DB facade — dual driver.
 * Primary: PostgreSQL (DATABASE_URL via pg). Fallback (zero-install dev):
 * PGlite — WASM PostgreSQL with pgvector, persisted at <repo>/.tfast-data.
 * Auto-detected on first query; PostgreSQL is tried first.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg, { type QueryResultRow } from 'pg';
import { config } from '../config.js';
import type { TenantScope } from '../core/tenant.js';

export interface DbClient {
  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
  exec(sql: string): Promise<void>;
  release?(): void;
}

export interface DbPool extends DbClient {
  driver: 'pg' | 'pglite';
  connect(): Promise<DbClient>;
  end(): Promise<void>;
}

let dbPromise: Promise<DbPool> | null = null;

async function initPg(): Promise<DbPool> {
  const p = new pg.Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500, max: 10 });
  await p.query('SELECT 1'); // fail fast so we can fall back to PGlite
  return {
    driver: 'pg',
    query: (sql, params = []) => p.query(sql, params),
    exec: (sql) => p.query(sql).then(() => undefined),
    connect: async () => {
      const c = await p.connect();
      return {
        query: (sql, params = []) => c.query(sql, params),
        exec: (sql) => c.query(sql).then(() => undefined),
        release: () => c.release(),
      };
    },
    end: () => p.end(),
  };
}

async function initPGlite(): Promise<DbPool> {
  const [{ PGlite }, { vector }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite-pgvector'),
  ]);
  // <repo>/.tfast-data (three levels up from server/src/db)
  const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.tfast-data');
  const inst = new PGlite(dataDir, { extensions: { vector } });
  await inst.waitReady;
  await inst.exec('CREATE EXTENSION IF NOT EXISTS vector');
  const queryFn: DbClient['query'] = async <T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ) => {
    const r = await inst.query(sql, params as never[]);
    return { rows: r.rows as unknown as T[], rowCount: r.rowCount ?? null };
  };
  return {
    driver: 'pglite',
    query: queryFn,
    exec: async (sql) => {
      await inst.exec(sql);
    },
    connect: async () => ({
      query: queryFn,
      exec: async (sql) => {
        await inst.exec(sql);
      },
      release: () => undefined,
    }),
    end: () => inst.close(),
  };
}

async function initDriver(): Promise<DbPool> {
  try {
    const p = await initPg();
    console.log('[db] driver=pg (PostgreSQL)');
    return p;
  } catch (err) {
    console.warn(
      `[db] PostgreSQL unavailable (${err instanceof Error ? err.message : String(err)}). Falling back to PGlite (dev mode).`,
    );
    const p = await initPGlite();
    console.log('[db] driver=pglite (WASM PostgreSQL + pgvector)');
    return p;
  }
}

export function getPool(): Promise<DbPool> {
  if (!dbPromise) dbPromise = initDriver();
  return dbPromise;
}

/** Facade — keeps `pool.query(...)` call sites unchanged across drivers. */
export const pool = {
  query: async <T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) =>
    (await getPool()).query<T>(sql, params),
  exec: async (sql: string) => (await getPool()).exec(sql),
  connect: async () => (await getPool()).connect(),
  end: async () => (await getPool()).end(),
};

/** Run a callback inside a tenant-scoped transaction (RLS context). */
export async function withTenant<T>(scope: TenantScope, fn: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.agency_id', $1, true)", [scope.agency_id]);
    if (scope.client_id) {
      await client.query("SELECT set_config('app.client_id', $1, true)", [scope.client_id]);
    } else {
      await client.query("SELECT set_config('app.client_id', '', true)");
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release?.();
  }
}
