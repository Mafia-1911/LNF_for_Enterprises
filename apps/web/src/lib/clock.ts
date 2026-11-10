// The web app's only source of "now" (plan §3.2 rule 4). In development and staging it follows the
// server clock, so the clock buttons on /dev/tools move the whole app.
import { dhakaParts, dhakaTime } from '@lf/domain';

let offsetMs = 0;

export function now(): Date {
  return new Date(Date.now() + offsetMs);
}

/** Aligns with the server clock (dev tools only). Returns the server time. */
export async function syncWithServerClock(): Promise<Date | null> {
  if (!__PROTOTYPE__) return null;
  try {
    const res = await fetch('/api/dev/clock', { credentials: 'include' });
    if (!res.ok) return null;
    const body = (await res.json()) as { now: string };
    offsetMs = new Date(body.now).getTime() - Date.now();
    return new Date(body.now);
  } catch {
    return null;
  }
}

/** "16:39" in Dhaka. */
export function timeLabel(at: Date): string {
  return dhakaTime(at);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "8 Nov 2026, 16:39" in Dhaka, from an ISO timestamp. */
export function dhakaDateTime(iso: string): string {
  const p = dhakaParts(new Date(iso));
  return `${p.day} ${MONTHS[p.month - 1] ?? ''} ${p.year}, ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** "2026-11-08T16:39" in the browser's local time, for datetime-local values and min/max. */
export function localInputValue(at: Date): string {
  const off = at.getTimezoneOffset() * 60_000;
  return new Date(at.getTime() - off).toISOString().slice(0, 16);
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function timeAgo(iso: string): string {
  const ms = now().getTime() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Whole days from now until `iso` (negative when past). */
export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - now().getTime()) / 86_400_000);
}
