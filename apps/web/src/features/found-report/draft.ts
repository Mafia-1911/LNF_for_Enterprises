// Drafts save automatically (FR-03), per person. The private note is never saved (see the
// lost-report draft for why); photo ids are kept, since unattached photos live for 7 days.
import type { FoundReportForm } from './form';

export type FoundReportDraft = { values: FoundReportForm; savedAt: string };

const key = (userId: string) => `lf.draft.found-report.${userId}`;

export function loadFoundDraft(userId: string): FoundReportDraft | null {
  try {
    const raw = window.localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as FoundReportDraft) : null;
  } catch {
    return null;
  }
}

export function saveFoundDraft(userId: string, draft: FoundReportDraft): boolean {
  try {
    const safe: FoundReportDraft = { ...draft, values: { ...draft.values, privateNote: '' } };
    window.localStorage.setItem(key(userId), JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}

export function clearFoundDraft(userId: string): void {
  try {
    window.localStorage.removeItem(key(userId));
  } catch {
    // Storage blocked: nothing to clear.
  }
}
