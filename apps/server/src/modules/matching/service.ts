// Matching service. TODO(docs/todo.md#matching): rule-based scoring against found items (FR-07).
import { withTx } from '../../platform/db/tx';
import type { RequestCtx } from '../../platform/db/types';
import { countMatchRuns, insertMatchRun } from './repo';

/** Stub: there are no found items yet, so a run finds no candidates and records that it ran. */
export async function matchLostReport(
  ctx: RequestCtx,
  reportId: string,
): Promise<{ candidates: number }> {
  return withTx(ctx, async (tx) => {
    await insertMatchRun(tx, ctx.tenantId, {
      recordType: 'lost_report',
      recordId: reportId,
      candidates: 0,
    });
    return { candidates: 0 };
  });
}

export async function matchRunsFor(
  ctx: RequestCtx,
  recordType: string,
  recordId: string,
): Promise<number> {
  return withTx(ctx, (tx) => countMatchRuns(tx, ctx.tenantId, recordType, recordId), {
    readOnly: true,
  });
}
