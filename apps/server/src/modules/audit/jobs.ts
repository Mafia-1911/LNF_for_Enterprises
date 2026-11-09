// Hourly audit checkpoint (plan §5.4). The advisory lock in createCheckpoint guards against two
// runs at once; pg-boss's cron also runs a schedule only once across instances.
import type { Clock } from '../../platform/clock';
import type { DatabaseHandle, RequestCtx } from '../../platform/db/types';
import type { JobDefinition } from '../../platform/jobs';
import type { Logger } from '../../platform/logger';
import { createCheckpoint } from './service';

export const AUDIT_CHECKPOINT_JOB = 'audit-checkpoint';

/** Checkpoints span every tenant, so the job runs outside any one tenant. */
export const NO_TENANT = '00000000-0000-0000-0000-000000000000';

export function auditJobs(deps: {
  db: DatabaseHandle;
  clock: Clock;
  logger: Logger;
}): JobDefinition[] {
  return [
    {
      name: AUDIT_CHECKPOINT_JOB,
      cron: '0 * * * *',
      options: { retryLimit: 3, retryDelay: 60 },
      handler: async (jobs) => {
        for (const job of jobs) {
          const ctx: RequestCtx = {
            tenantId: NO_TENANT,
            actor: { kind: 'system', job: AUDIT_CHECKPOINT_JOB },
            requestId: job.id,
            clock: deps.clock,
            db: deps.db,
          };
          const result = await createCheckpoint(ctx);
          deps.logger.info(
            { jobId: job.id, ...result },
            result ? 'Audit checkpoint created' : 'Audit checkpoint: nothing new',
          );
        }
      },
    },
  ];
}
