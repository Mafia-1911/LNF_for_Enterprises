// photo-cleanup: daily, per tenant, deletes photos that were never attached (plan §6.1).
import type { Clock } from '../../platform/clock';
import type { DatabaseHandle } from '../../platform/db/types';
import type { JobDefinition } from '../../platform/jobs';
import { JOB } from '../../platform/jobs/names';
import type { Logger } from '../../platform/logger';
import { listTenantIds } from '../../platform/tenancy';
import { cleanUpUnattached, type PhotosDeps } from './service';

export function photosJobs(
  deps: PhotosDeps & { db: DatabaseHandle; clock: Clock; logger: Logger },
): JobDefinition[] {
  return [
    {
      name: JOB.photoCleanup,
      cron: '30 3 * * *',
      options: { retryLimit: 2 },
      handler: async (jobs) => {
        for (const job of jobs) {
          for (const tenantId of await listTenantIds(deps.db)) {
            const removed = await cleanUpUnattached(deps, {
              tenantId,
              actor: { kind: 'system', job: JOB.photoCleanup },
              requestId: job.id,
              clock: deps.clock,
              db: deps.db,
            });
            if (removed > 0) deps.logger.info({ tenantId, removed }, 'Removed unattached photos');
          }
        }
      },
    },
  ];
}
