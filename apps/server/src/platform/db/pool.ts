// The raw connection pool. Only repo.ts files and platform/* may import this file (lint rule).
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { DatabaseHandle } from './types';

// DATE columns stay as 'YYYY-MM-DD' strings. The default parser makes a Date at local midnight,
// which shifts the day depending on the server's time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (value: string) => value);

const pools = new WeakMap<DatabaseHandle, pg.Pool>();

export function createDatabase(
  url: string,
  opts: { max: number; applicationName: string },
): DatabaseHandle {
  const pool = new pg.Pool({
    connectionString: url,
    max: opts.max,
    application_name: opts.applicationName,
  });
  const handle = Object.freeze({}) as DatabaseHandle;
  pools.set(handle, pool);
  return handle;
}

export function poolOf(db: DatabaseHandle): pg.Pool {
  const pool = pools.get(db);
  if (!pool) throw new Error('Unknown or closed database handle.');
  return pool;
}

/** Drizzle on the pool (not in a transaction). For platform code such as Better-Auth's adapter. */
export function drizzleOf(db: DatabaseHandle): NodePgDatabase {
  return drizzle({ client: poolOf(db) });
}

export async function pingDatabase(db: DatabaseHandle): Promise<boolean> {
  try {
    await poolOf(db).query('select 1');
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(db: DatabaseHandle): Promise<void> {
  const pool = pools.get(db);
  if (!pool) return;
  pools.delete(db);
  await pool.end();
}
