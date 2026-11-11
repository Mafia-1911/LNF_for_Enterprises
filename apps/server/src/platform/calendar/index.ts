// The tenant's working calendar: Sunday–Thursday minus holidays and closures, in Asia/Dhaka.
// Instants are stored in UTC; see packages/domain/src/calendar.ts for the rules.
import { addDays, createWorkingCalendar, type LocalDate, type WorkingCalendar } from '@lf/domain';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { Tx } from '../db/types';
import { closures, holidays } from './schema';

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

/** Working days: Sunday–Thursday minus public holidays and closures. */
export async function loadWorkingCalendar(tx: Tx): Promise<WorkingCalendar> {
  const rows = await tx.db
    .select({ date: holidays.date })
    .from(holidays)
    .where(eq(holidays.tenantId, tx.tenantId));
  return createWorkingCalendar([...rows.map((r) => r.date), ...(await pausedDates(tx))]);
}

/**
 * Dates on which the retention countdown pauses (NF-09): every day of a closure or semester break,
 * whether a supervisor added it as a range or it was seeded as a single closure day.
 */
export async function pausedDates(tx: Tx): Promise<Set<LocalDate>> {
  const out = new Set<LocalDate>();
  const seeded = await tx.db
    .select({ date: holidays.date })
    .from(holidays)
    .where(
      and(
        eq(holidays.tenantId, tx.tenantId),
        inArray(holidays.kind, ['closure', 'semester_break']),
      ),
    );
  for (const r of seeded) out.add(r.date);
  for (const c of await listClosures(tx))
    for (let d = c.fromDate; d <= c.toDate; d = addDays(d, 1)) out.add(d);
  return out;
}

export type Closure = { id: string; name: string; fromDate: LocalDate; toDate: LocalDate };

export function listClosures(tx: Tx): Promise<Closure[]> {
  return tx.db
    .select({
      id: closures.id,
      name: closures.name,
      fromDate: closures.fromDate,
      toDate: closures.toDate,
    })
    .from(closures)
    .where(eq(closures.tenantId, tx.tenantId))
    .orderBy(asc(closures.fromDate));
}

/** Closures that share at least one day with the given range. */
export function overlappingClosures(tx: Tx, from: LocalDate, to: LocalDate): Promise<Closure[]> {
  return tx.db
    .select({
      id: closures.id,
      name: closures.name,
      fromDate: closures.fromDate,
      toDate: closures.toDate,
    })
    .from(closures)
    .where(
      and(
        eq(closures.tenantId, tx.tenantId),
        lte(closures.fromDate, to),
        gte(closures.toDate, from),
      ),
    );
}

export async function insertClosure(
  tx: Tx,
  closure: Closure & { createdBy: string | null },
): Promise<void> {
  await tx.db.insert(closures).values({ tenantId: tx.tenantId, ...closure, createdAt: tx.now });
}

/** Removes one closure; returns it, or null when there was none with that id. */
export async function deleteClosure(tx: Tx, id: string): Promise<Closure | null> {
  const [row] = await tx.db
    .delete(closures)
    .where(and(eq(closures.tenantId, tx.tenantId), eq(closures.id, id)))
    .returning({
      id: closures.id,
      name: closures.name,
      fromDate: closures.fromDate,
      toDate: closures.toDate,
    });
  return row ?? null;
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
