// Items timers, per tenant (system actor):
//   found-item-hand-in-timer  hourly: reminder at 24 h, NOT_RECEIVED at the deadline (CC-03)
//   found-item-retention      daily 00:30 Dhaka: recalculate, EXPIRE, last-chance alerts (WF-05)
//   lost-report-expiry-timer  hourly: "expires in 2 days" reminder, then EXPIRED (WF-01)
import type { Clock } from '../../platform/clock';
import type { DatabaseHandle } from '../../platform/db/types';
import type { JobDefinition } from '../../platform/jobs';
import { JOB } from '../../platform/jobs/names';
import type { Logger } from '../../platform/logger';
import { listTenantIds } from '../../platform/tenancy';
import type { RequestCtx } from '../../platform/db/types';
import { runHandInTimer, type FoundItemsDeps } from './found-items';
import { runLostReportTimer, runRetention } from './retention';

export function itemsJobs(
  deps: FoundItemsDeps & { db: DatabaseHandle; clock: Clock; logger: Logger },
): JobDefinition[] {
  const perTenant = async (
    jobId: string,
    name: string,
    run: (ctx: RequestCtx) => Promise<Record<string, number>>,
  ) => {
    for (const tenantId of await listTenantIds(deps.db)) {
      const result = await run({
        tenantId,
        actor: { kind: 'system', job: name },
        requestId: jobId,
        clock: deps.clock,
        db: deps.db,
      });
      if (Object.values(result).some((n) => n > 0)) deps.logger.info({ tenantId, ...result }, name);
    }
  };
  return [
    {
      name: JOB.retention,
      cron: '30 0 * * *',
      options: { retryLimit: 2 },
      handler: async (jobs) => {
        for (const job of jobs)
          await perTenant(job.id, JOB.retention, (ctx) => runRetention(deps, ctx));
      },
    },
    {
      name: JOB.lostReportTimer,
      cron: '10 * * * *',
      options: { retryLimit: 2 },
      handler: async (jobs) => {
        for (const job of jobs)
          await perTenant(job.id, JOB.lostReportTimer, (ctx) => runLostReportTimer(deps, ctx));
      },
    },
    {
      name: JOB.handInTimer,
      cron: '5 * * * *',
      options: { retryLimit: 2 },
      handler: async (jobs) => {
        for (const job of jobs) {
          for (const tenantId of await listTenantIds(deps.db)) {
            const result = await runHandInTimer(deps, {
              tenantId,
              actor: { kind: 'system', job: JOB.handInTimer },
              requestId: job.id,
              clock: deps.clock,
              db: deps.db,
            });
            if (result.reminded + result.notReceived > 0)
              deps.logger.info({ tenantId, ...result }, 'Hand-in timer');
          }
        }
      },
    },
  ];
}
