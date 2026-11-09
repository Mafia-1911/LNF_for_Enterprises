// The tenant's working calendar: Sunday–Thursday minus holidays and closures, in Asia/Dhaka.
// Instants are stored in UTC; see packages/domain/src/calendar.ts for the rules.
import { createWorkingCalendar, type WorkingCalendar } from '@lf/domain';
import { eq } from 'drizzle-orm';
import type { Tx } from '../db/types';
import { holidays } from './schema';

export {
  addDays,
  addDaysToInstant,
  dhakaDate,
  dhakaTime,
  dhakaYearMonth,
  TIME_ZONE,
  type LocalDate,
  type WorkingCalendar,
} from '@lf/domain';

export async function loadWorkingCalendar(tx: Tx): Promise<WorkingCalendar> {
  const rows = await tx.db
    .select({ date: holidays.date })
    .from(holidays)
    .where(eq(holidays.tenantId, tx.tenantId));
  return createWorkingCalendar(rows.map((r) => r.date));
}

/** Seed only: adds a holiday if it isn't there yet. */
export async function insertHolidayIfMissing(
  tx: Tx,
  h: { date: string; name: string; kind: 'public_holiday' | 'closure' | 'semester_break' },
): Promise<void> {
  await tx.db
    .insert(holidays)
    .values({ tenantId: tx.tenantId, ...h })
    .onConflictDoNothing();
}
