// Audit trails with names and plain labels (DSP record page, disputes).
import type { HistoryEntry } from '@lf/contracts';
import type { Tx } from '../../platform/db/types';
import { recordHistory } from '../audit';
import { memberNames } from '../identity';

const EVENT_LABEL: Record<string, string> = {
  POST: 'Posted by finder',
  LOG_INTAKE: 'Logged at desk',
  RECEIVE_AT_DESK: 'Received at desk',
  CLAIM_SUBMITTED: 'Claim received',
  APPROVE_CLAIM: 'Claim approved',
  HAND_OVER: 'Handed over',
  PICKUP_LAPSED: 'Pickup window missed',
  ALL_CLAIMS_REJECTED: 'Back on the shelf',
};

/** An audit trail with names and plain labels. */
export async function historyOf(
  tx: Tx,
  recordType: string,
  id: string,
  labels: Record<string, string> = EVENT_LABEL,
): Promise<HistoryEntry[]> {
  const events = await recordHistory(tx, recordType, id);
  const names = await memberNames(
    tx,
    events.map((e) => e.actorId).filter((v): v is string => v !== null),
  );
  return events.map((e) => ({
    label:
      labels[e.event] ?? e.event.charAt(0) + e.event.slice(1).toLowerCase().replaceAll('_', ' '),
    actor: e.actorId ? (names.get(e.actorId) ?? 'Staff') : 'System',
    at: e.at,
    note: e.note,
  }));
}
