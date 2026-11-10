// The only file that touches catalog tables. Every function takes tenantId first (plan §5.3).
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Tx } from '../../platform/db/types';
import { bins, buildings, categories, colours, desks, floors, policies, zones } from './schema';

export async function listCategories(tx: Tx, tenantId: string) {
  return tx.db
    .select({
      code: categories.code,
      label: categories.label,
      sensitive: categories.sensitive,
      restricted: categories.restricted,
    })
    .from(categories)
    .where(and(eq(categories.tenantId, tenantId), eq(categories.enabled, true)))
    .orderBy(asc(categories.sort));
}

export async function listColours(tx: Tx, tenantId: string) {
  return tx.db
    .select({ code: colours.code, label: colours.label, swatch: colours.swatch })
    .from(colours)
    .where(eq(colours.tenantId, tenantId))
    .orderBy(asc(colours.sort));
}

export async function listPlaces(tx: Tx, tenantId: string) {
  // One transaction = one connection: run queries one after another, never with Promise.all.
  const b = await tx.db
    .select()
    .from(buildings)
    .where(eq(buildings.tenantId, tenantId))
    .orderBy(asc(buildings.sort));
  const f = await tx.db
    .select()
    .from(floors)
    .where(eq(floors.tenantId, tenantId))
    .orderBy(asc(floors.sort));
  const z = await tx.db
    .select()
    .from(zones)
    .where(eq(zones.tenantId, tenantId))
    .orderBy(asc(zones.sort));
  return { buildings: b, floors: f, zones: z };
}

/** The building, floor and zone names for a place, or null when the place doesn't fit together in this tenant. */
export async function resolvePlace(
  tx: Tx,
  tenantId: string,
  place: { buildingCode: string | null; floorId: string | null; zoneId: string | null },
): Promise<{
  buildingName: string | null;
  floorName: string | null;
  zoneName: string | null;
} | null> {
  if (place.buildingCode === null) return { buildingName: null, floorName: null, zoneName: null };
  const [building] = await tx.db
    .select({ id: buildings.id, name: buildings.name })
    .from(buildings)
    .where(and(eq(buildings.tenantId, tenantId), eq(buildings.code, place.buildingCode)));
  if (!building) return null;
  let floorName: string | null = null;
  if (place.floorId) {
    const [floor] = await tx.db
      .select({ name: floors.name })
      .from(floors)
      .where(
        and(
          eq(floors.tenantId, tenantId),
          eq(floors.id, place.floorId),
          eq(floors.buildingId, building.id),
        ),
      );
    if (!floor) return null;
    floorName = floor.name;
  }
  let zoneName: string | null = null;
  if (place.zoneId) {
    if (!place.floorId) return null;
    const [zone] = await tx.db
      .select({ name: zones.name })
      .from(zones)
      .where(
        and(
          eq(zones.tenantId, tenantId),
          eq(zones.id, place.zoneId),
          eq(zones.floorId, place.floorId),
        ),
      );
    if (!zone) return null;
    zoneName = zone.name;
  }
  return { buildingName: building.name, floorName, zoneName };
}

/** Names for many places at once (for lists). Keys are building codes and floor/zone ids. */
export async function placeNames(tx: Tx, tenantId: string, codes: string[], ids: string[]) {
  const b = codes.length
    ? await tx.db
        .select({ code: buildings.code, name: buildings.name })
        .from(buildings)
        .where(and(eq(buildings.tenantId, tenantId), inArray(buildings.code, codes)))
    : [];
  const f = ids.length
    ? await tx.db
        .select({ id: floors.id, name: floors.name })
        .from(floors)
        .where(and(eq(floors.tenantId, tenantId), inArray(floors.id, ids)))
    : [];
  const z = ids.length
    ? await tx.db
        .select({ id: zones.id, name: zones.name })
        .from(zones)
        .where(and(eq(zones.tenantId, tenantId), inArray(zones.id, ids)))
    : [];
  return {
    buildings: new Map(b.map((r) => [r.code, r.name])),
    floorsAndZones: new Map([...f, ...z].map((r) => [r.id, r.name])),
  };
}

export async function findMainDesk(tx: Tx, tenantId: string) {
  const [desk] = await tx.db
    .select({ name: desks.name, location: desks.location, hours: desks.hours })
    .from(desks)
    .where(eq(desks.tenantId, tenantId))
    .orderBy(asc(desks.code))
    .limit(1);
  return desk ?? null;
}

export async function findPolicy(tx: Tx, tenantId: string, key: string): Promise<unknown> {
  const [row] = await tx.db
    .select({ value: policies.value })
    .from(policies)
    .where(and(eq(policies.tenantId, tenantId), eq(policies.key, key)));
  return row?.value ?? null;
}

export async function upsertPolicy(
  tx: Tx,
  tenantId: string,
  key: string,
  value: unknown,
  updatedBy: string | null,
): Promise<void> {
  await tx.db
    .insert(policies)
    .values({ tenantId, key, value, updatedAt: tx.now, updatedBy })
    .onConflictDoUpdate({
      target: [policies.tenantId, policies.key],
      set: { value, updatedAt: tx.now, updatedBy },
    });
}

// ── Seeding (idempotent upserts on natural keys) ────────────────────────────────────────────────

export async function upsertBuilding(
  tx: Tx,
  tenantId: string,
  b: { code: string; name: string; sort: number },
): Promise<string> {
  const [row] = await tx.db
    .insert(buildings)
    .values({ tenantId, ...b })
    .onConflictDoUpdate({
      target: [buildings.tenantId, buildings.code],
      set: { name: b.name, sort: b.sort },
    })
    .returning({ id: buildings.id });
  if (!row) throw new Error('building upsert returned no row');
  return row.id;
}

export async function upsertFloor(
  tx: Tx,
  tenantId: string,
  f: { buildingId: string; name: string; sort: number },
): Promise<string> {
  const [row] = await tx.db
    .insert(floors)
    .values({ tenantId, ...f })
    .onConflictDoUpdate({ target: [floors.buildingId, floors.name], set: { sort: f.sort } })
    .returning({ id: floors.id });
  if (!row) throw new Error('floor upsert returned no row');
  return row.id;
}

export async function upsertZone(
  tx: Tx,
  tenantId: string,
  z: { floorId: string; name: string; sort: number },
): Promise<string> {
  const [row] = await tx.db
    .insert(zones)
    .values({ tenantId, ...z })
    .onConflictDoUpdate({ target: [zones.floorId, zones.name], set: { sort: z.sort } })
    .returning({ id: zones.id });
  if (!row) throw new Error('zone upsert returned no row');
  return row.id;
}

export async function upsertDesk(
  tx: Tx,
  tenantId: string,
  d: { code: string; name: string; buildingId: string; location: string; hours: string },
): Promise<string> {
  const [row] = await tx.db
    .insert(desks)
    .values({ tenantId, ...d })
    .onConflictDoUpdate({
      target: [desks.tenantId, desks.code],
      set: { name: d.name, location: d.location, hours: d.hours, buildingId: d.buildingId },
    })
    .returning({ id: desks.id });
  if (!row) throw new Error('desk upsert returned no row');
  return row.id;
}

export async function upsertBin(
  tx: Tx,
  tenantId: string,
  b: { deskId: string; code: string; label: string },
): Promise<void> {
  await tx.db
    .insert(bins)
    .values({ tenantId, ...b })
    .onConflictDoUpdate({ target: [bins.tenantId, bins.code], set: { label: b.label } });
}

export async function upsertCategory(
  tx: Tx,
  tenantId: string,
  c: { code: string; label: string; sensitive: boolean; restricted: boolean; sort: number },
): Promise<void> {
  await tx.db
    .insert(categories)
    .values({ tenantId, ...c })
    .onConflictDoUpdate({
      target: [categories.tenantId, categories.code],
      set: { label: c.label, sensitive: c.sensitive, restricted: c.restricted, sort: c.sort },
    });
}

export async function upsertColour(
  tx: Tx,
  tenantId: string,
  c: { code: string; label: string; swatch: string; sort: number },
): Promise<void> {
  await tx.db
    .insert(colours)
    .values({ tenantId, ...c })
    .onConflictDoUpdate({
      target: [colours.tenantId, colours.code],
      set: { label: c.label, swatch: c.swatch, sort: c.sort },
    });
}

/** Seeds a policy only when it is missing, so an admin's change survives re-seeding. */
export async function insertPolicyIfMissing(
  tx: Tx,
  tenantId: string,
  key: string,
  value: unknown,
): Promise<void> {
  await tx.db
    .insert(policies)
    .values({ tenantId, key, value, updatedAt: tx.now, updatedBy: null })
    .onConflictDoNothing();
}

export async function listBinCodes(tx: Tx, tenantId: string): Promise<string[]> {
  const rows = await tx.db
    .select({ code: bins.code })
    .from(bins)
    .where(eq(bins.tenantId, tenantId))
    .orderBy(asc(bins.code));
  return rows.map((r) => r.code);
}
