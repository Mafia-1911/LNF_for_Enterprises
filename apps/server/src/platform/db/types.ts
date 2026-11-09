// Types every layer may use. The raw pool stays in pool.ts, which only repo.ts files and
// platform/* may import (plan §3.2 rule 3).
import type { Role } from '@lf/domain';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Clock } from '../clock';

/** An opaque handle to the database. Services carry it in RequestCtx but can't query with it. */
export type DatabaseHandle = { readonly __database: unique symbol };

/** Who is acting. `system` is used by jobs and timers. */
export type Actor =
  { kind: 'user'; userId: string; role: Role; name: string } | { kind: 'system'; job: string };

/** Everything a service needs to know about the current request or job. */
export type RequestCtx = {
  tenantId: string;
  actor: Actor;
  requestId: string;
  clock: Clock;
  db: DatabaseHandle;
};

/** SQL executor for pg-boss, bound to the same client as the Drizzle transaction. */
export type JobsExecutor = {
  executeSql(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
};

/** A transaction. Pass it to repo functions; only repo.ts files may touch `tx.db`. */
export type Tx = {
  db: NodePgDatabase;
  jobs: JobsExecutor;
  tenantId: string;
  actor: Actor;
  requestId: string;
  /** "Now" for this transaction: read once, so every row written in it gets the same time. */
  now: Date;
};
