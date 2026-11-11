// match-lost-report (queued by submitLostReport) and match-found-item (queued when an item reaches
// the desk), both in the same transaction as the change that caused them (ADR-0002).
import type { Clock } from '../../platform/clock';
import type { DatabaseHandle, RequestCtx } from '../../platform/db/types';
import type { JobDefinition } from '../../platform/jobs';
import { JOB, type MatchFoundItemData, type MatchLostReportData } from '../../platform/jobs/names';
import type { Logger } from '../../platform/logger';
import { matchFoundItem, matchLostReport, type MatchingDeps } from './service';

export const MATCH_LOST_REPORT_JOB = JOB.matchLostReport;
export type { MatchLostReportData };

export function matchingJobs(
  deps: MatchingDeps & { db: DatabaseHandle; clock: Clock; logger: Logger },
): JobDefinition[] {
  const ctxFor = (tenantId: string, job: string, id: string): RequestCtx => ({
    tenantId,
    actor: { kind: 'system', job },
    requestId: id,
    clock: deps.clock,
    db: deps.db,
  });
  const lost: JobDefinition<MatchLostReportData> = {
    name: JOB.matchLostReport,
    options: { retryLimit: 5, retryDelay: 30, retryBackoff: true },
    handler: async (jobs) => {
      for (const job of jobs) {
        const result = await matchLostReport(
          deps,
          ctxFor(job.data.tenantId, JOB.matchLostReport, job.id),
          job.data.reportId,
        );
        deps.logger.info(
          { jobId: job.id, reportId: job.data.reportId, ...result },
          'Matched lost report',
        );
      }
    },
  };
  const found: JobDefinition<MatchFoundItemData> = {
    name: JOB.matchFoundItem,
    options: { retryLimit: 5, retryDelay: 30, retryBackoff: true },
    handler: async (jobs) => {
      for (const job of jobs) {
        const result = await matchFoundItem(
          deps,
          ctxFor(job.data.tenantId, JOB.matchFoundItem, job.id),
          job.data.foundItemId,
        );
        deps.logger.info(
          { jobId: job.id, foundItemId: job.data.foundItemId, ...result },
          'Matched found item',
        );
      }
    },
  };
  return [lost as JobDefinition, found as JobDefinition];
}
