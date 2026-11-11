// How long each found item stays in custody (WF-05, CC-02, NF-09): the policy's period (shorter
// for look-alikes), plus any "Keep longer" days, counted from intake and paused during closures.
import { retentionDays, retentionEnd, type RetentionPolicy } from '@lf/domain';
import { pausedDates } from '../../platform/calendar';
import type { Tx } from '../../platform/db/types';
import { readPolicies } from '../catalog';

export type RetentionRules = { policy: RetentionPolicy; paused: ReadonlySet<string> };

/** Read once per transaction, then apply to every item. */
export async function loadRetentionRules(tx: Tx): Promise<RetentionRules> {
  const p = await readPolicies(tx);
  return {
    policy: { days: p.retentionDays, lookAlikeDays: p.lookAlikeRetentionDays },
    paused: await pausedDates(tx),
  };
}

/**
 * When an item's retention ends. The clock starts when the item reached the desk; items entered
 * after an outage keep their original intake time (CC-17).
 */
export function retentionEndOf(
  rules: RetentionRules,
  row: { category: string; receivedAt: Date | null; createdAt: Date; retentionExtraDays: number },
): Date {
  const days = retentionDays(row.category, rules.policy, row.retentionExtraDays);
  return retentionEnd(row.receivedAt ?? row.createdAt, days, rules.paused);
}
