// withTx (plan §3.3): one pg client, one transaction, handed out as both a Drizzle instance and a
// pg-boss executor, so state changes and the jobs they create commit or roll back together.
//
//   await withTx(ctx, async (tx) => {
//     const report = await lostReportTransition(tx, draft, 'SUBMIT', { values });
//     await deps.boss.send('match-lost-report', { reportId: report.id }, { db: tx.jobs });
//   });
import { drizzle } from 'drizzle-orm/node-postgres';
import { poolOf } from './pool';
import type { RequestCtx, Tx } from './types';

export type { Actor, DatabaseHandle, RequestCtx, Tx } from './types';

export async function withTx<T>(
  ctx: RequestCtx,
  fn: (tx: Tx) => Promise<T>,
  opts: { readOnly?: boolean } = {},
): Promise<T> {
  const client = await poolOf(ctx.db).connect();
  let broken: Error | undefined;
  try {
    await client.query(opts.readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
    // Groundwork for row-level security (plan §15): the tenant is visible to SQL for this transaction.
    await client.query("select set_config('app.tenant_id', $1, true)", [ctx.tenantId]);
    const tx: Tx = {
      db: drizzle({ client }),
      jobs: { executeSql: (text, values) => client.query(text, values) },
      tenantId: ctx.tenantId,
      actor: ctx.actor,
      requestId: ctx.requestId,
      now: ctx.clock.now(),
    };
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // The connection is unusable; destroy it instead of returning it to the pool.
      broken = rollbackErr instanceof Error ? rollbackErr : new Error('ROLLBACK failed');
    }
    throw err;
  } finally {
    client.release(broken);
  }
}
