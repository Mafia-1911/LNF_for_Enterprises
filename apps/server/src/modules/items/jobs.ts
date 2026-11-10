// found-item-hand-in-timer: hourly, per tenant (CC-03). Reminder at 24 h, NOT_RECEIVED at the deadline.
import type { Clock } from '../../platform/clock';
import type { DatabaseHandle } from '../../platform/db/types';
import type { JobDefinition } from '../../platform/jobs';
import { JOB } from '../../platform/jobs/names';
import type { Logger } from '../../platform/logger';
import { listTenantIds } from '../../platform/tenancy';
import { runHandInTimer, type FoundItemsDeps } from './found-items';

export function itemsJobs(
  deps: FoundItemsDeps & { db: DatabaseHandle; clock: Clock; logger: Logger },
): JobDefinition[] {
  return [
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
