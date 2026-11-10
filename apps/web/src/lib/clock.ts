// The web app's only source of "now" (plan §3.2 rule 4). In development and staging it follows the
// server clock, so the prototype toolbar's "+1 h / +1 day" moves the whole app.
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
