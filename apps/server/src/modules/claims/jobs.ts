// pickup-window-timer: hourly, per tenant (CC-11). One reminder a day before; then the claim lapses.
import type { Clock } from '../../platform/clock';
import type { DatabaseHandle } from '../../platform/db/types';
import type { JobDefinition } from '../../platform/jobs';
import { JOB } from '../../platform/jobs/names';
import type { Logger } from '../../platform/logger';
import { listTenantIds } from '../../platform/tenancy';
import { runPickupTimer, type ClaimsDeps } from './service';

export function claimsJobs(
  deps: ClaimsDeps & { db: DatabaseHandle; clock: Clock; logger: Logger },
): JobDefinition[] {
  return [
    {
      name: JOB.pickupTimer,
      cron: '15 * * * *',
      options: { retryLimit: 2 },
      handler: async (jobs) => {
        for (const job of jobs)
          for (const tenantId of await listTenantIds(deps.db)) {
            const result = await runPickupTimer(deps, {
              tenantId,
              actor: { kind: 'system', job: JOB.pickupTimer },
              requestId: job.id,
              clock: deps.clock,
              db: deps.db,
            });
            if (result.reminded + result.lapsed > 0)
              deps.logger.info({ tenantId, ...result }, 'Pickup timer');
          }
      },
    },
  ];
}
