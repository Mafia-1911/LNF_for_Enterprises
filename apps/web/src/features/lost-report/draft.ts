// Drafts save automatically (FR-03): form text in localStorage, per person, cleared on submit.
// Private details are NOT saved in the draft: on a shared campus computer they would sit in browser
// storage. They stay in memory until submitted, then the server stores them encrypted.
import type { LostReportForm } from './form';

export type LostReportDraft = { values: LostReportForm; savedAt: string };

const key = (userId: string) => `lf.draft.lost-report.${userId}`;

export function loadDraft(userId: string): LostReportDraft | null {
  try {
    const raw = window.localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as LostReportDraft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: LostReportDraft): boolean {
  try {
    const safe: LostReportDraft = { ...draft, values: { ...draft.values, privateNote: '' } };
    window.localStorage.setItem(key(userId), JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(userId: string): void {
  try {
    window.localStorage.removeItem(key(userId));
  } catch {
    // Storage blocked: nothing to clear.
  }
}
