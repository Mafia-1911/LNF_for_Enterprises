// Job names and payloads shared across modules. A module sends a job by name without importing the
// module that handles it, so modules never import each other just for a queue name.
export const JOB = {
  matchLostReport: 'match-lost-report',
  sendEmail: 'send-email',
  handInTimer: 'found-item-hand-in-timer',
  photoCleanup: 'photo-cleanup',
} as const;

export type MatchLostReportData = { tenantId: string; reportId: string };
export type SendEmailData = { tenantId: string; to: string; subject: string; text: string };
