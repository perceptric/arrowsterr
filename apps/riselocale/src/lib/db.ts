// The Postgres connection. Every query that touches a workspace's data filters by workspace_id.

import pg from "pg";

export type Queryable = { query: <R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) => Promise<pg.QueryResult<R>> };

const globalForPool = globalThis as unknown as { rlPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!globalForPool.rlPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Add DATABASE_URL to the server's settings.");
    globalForPool.rlPool = new pg.Pool({
      connectionString: url,
      max: Number(process.env.PG_POOL_MAX) || 10,
      ssl: process.env.PGSSL === "no-verify" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalForPool.rlPool;
}

export async function rows<R extends pg.QueryResultRow>(sql: string, params: unknown[] = [], c: Queryable = pool()): Promise<R[]> {
  return (await c.query<R>(sql, params)).rows;
}

export async function row<R extends pg.QueryResultRow>(sql: string, params: unknown[] = [], c: Queryable = pool()): Promise<R | null> {
  return (await c.query<R>(sql, params)).rows[0] ?? null;
}

/** Run fn in one transaction. Rolls back on any error. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>, p: pg.Pool = pool()): Promise<T> {
  const c = await p.connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
