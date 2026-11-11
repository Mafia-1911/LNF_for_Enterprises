// Job names and payloads shared across modules. A module sends a job by name without importing the
// module that handles it, so modules never import each other just for a queue name.
export const JOB = {
  matchLostReport: 'match-lost-report',
  matchFoundItem: 'match-found-item',
  pickupTimer: 'pickup-window-timer',
  sendEmail: 'send-email',
  handInTimer: 'found-item-hand-in-timer',
  photoCleanup: 'photo-cleanup',
  retention: 'found-item-retention',
  lostReportTimer: 'lost-report-expiry-timer',
} as const;

export type MatchLostReportData = { tenantId: string; reportId: string };
export type SendEmailData = { tenantId: string; to: string; subject: string; text: string };
export type MatchFoundItemData = { tenantId: string; foundItemId: string };
