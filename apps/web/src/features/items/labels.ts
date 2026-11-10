// Plain words and badge tones for record states, shared by the student and desk screens.
import type { BadgeTone } from '@lf/ui';

export const FOUND_STATE: Record<string, { label: string; tone: BadgeTone }> = {
  REPORTED_BY_FINDER: { label: 'Awaiting hand-in', tone: 'warning' },
  IN_CUSTODY: { label: 'In custody', tone: 'info' },
  CLAIM_PENDING: { label: 'Claim under review', tone: 'accent' },
  READY_FOR_PICKUP: { label: 'Ready for pickup', tone: 'success' },
  DISPATCHED: { label: 'Returned to owner', tone: 'success' },
  NOT_RECEIVED: { label: 'Not handed in', tone: 'danger' },
  EXPIRED: { label: 'Retention ended', tone: 'warning' },
  DONATED: { label: 'Donated', tone: 'neutral' },
  DISPOSED: { label: 'Disposed', tone: 'neutral' },
  TRANSFERRED: { label: 'Transferred', tone: 'neutral' },
  VOID: { label: 'VOID', tone: 'neutral' },
};

export const LOST_STATE: Record<string, { label: string; tone: BadgeTone }> = {
  OPEN: { label: 'Open', tone: 'info' },
  POSSIBLE_MATCH: { label: 'Possible match', tone: 'accent' },
  CLAIMED: { label: 'Claim in progress', tone: 'primary' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  EXPIRED: { label: 'Expired', tone: 'warning' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
};

/** "LIB · 2nd floor · Reading hall" */
export function placeLine(place: {
  buildingCode: string | null;
  floorName: string | null;
  zoneName: string | null;
}): string {
  return (
    [place.buildingCode, place.floorName, place.zoneName].filter(Boolean).join(' · ') ||
    'Place not sure'
  );
}
