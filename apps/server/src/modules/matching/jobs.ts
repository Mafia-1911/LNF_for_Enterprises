// match-lost-report: queued by submitLostReport in the same transaction as the report (ADR-0002).
import type { Clock } from '../../platform/clock';
import type { DatabaseHandle } from '../../platform/db/types';
import type { JobDefinition } from '../../platform/jobs';
import type { Logger } from '../../platform/logger';
import { matchLostReport } from './service';

export const MATCH_LOST_REPORT_JOB = 'match-lost-report';
export type MatchLostReportData = { tenantId: string; reportId: string };

export function matchingJobs(deps: {
  db: DatabaseHandle;
  clock: Clock;
  logger: Logger;
}): JobDefinition[] {
  const definition: JobDefinition<MatchLostReportData> = {
    name: MATCH_LOST_REPORT_JOB,
    options: { retryLimit: 5, retryDelay: 30, retryBackoff: true },
    handler: async (jobs) => {
      for (const job of jobs) {
        const ctx = {
          tenantId: job.data.tenantId,
          actor: { kind: 'system', job: MATCH_LOST_REPORT_JOB } as const,
          requestId: job.id,
          clock: deps.clock,
          db: deps.db,
        };
        const result = await matchLostReport(ctx, job.data.reportId);
        deps.logger.info(
          { jobId: job.id, reportId: job.data.reportId, ...result },
          'Matched lost report',
        );
      }
    },
  };
  return [definition as JobDefinition];
}
