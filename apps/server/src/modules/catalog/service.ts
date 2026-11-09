// Catalog reads, the tenant's public info, and the admin-only appearance policy (ADR-0010).
import {
  AppearanceSchema,
  DEFAULT_APPEARANCE,
  type Appearance,
  type Catalog,
  type TenantInfo,
} from '@lf/contracts';
import { DESK_ROLES, type CategoryCode, type ColourCode } from '@lf/domain';
import { withTx } from '../../platform/db/tx';
import type { RequestCtx, Tx } from '../../platform/db/types';
import type { Tenant } from '../../platform/tenancy';
import { recordAuditEvent } from '../audit';
import {
  findMainDesk,
  findPolicy,
  insertPolicyIfMissing,
  listCategories,
  listColours,
  listPlaces,
  placeNames,
  resolvePlace,
  upsertBin,
  upsertBuilding,
  upsertCategory,
  upsertColour,
  upsertDesk,
  upsertFloor,
  upsertPolicy,
  upsertZone,
} from './repo';

export const APPEARANCE_POLICY = 'appearance';

/** Categories, colours and places this person may pick. Restricted categories are desk-only. */
export async function getCatalog(ctx: RequestCtx): Promise<Catalog> {
  const deskStaff = ctx.actor.kind === 'user' && DESK_ROLES.includes(ctx.actor.role);
  return withTx(
    ctx,
    async (tx) => {
      const cats = await listCategories(tx, ctx.tenantId);
      const cols = await listColours(tx, ctx.tenantId);
      const places = await listPlaces(tx, ctx.tenantId);
      return {
        categories: cats
          .filter((c) => deskStaff || !c.restricted)
          .map((c) => ({ ...c, code: c.code as CategoryCode })),
        colours: cols.map((c) => ({ ...c, code: c.code as ColourCode })),
        buildings: places.buildings.map((b) => ({
          code: b.code,
          name: b.name,
          floors: places.floors
            .filter((f) => f.buildingId === b.id)
            .map((f) => ({
              id: f.id,
              name: f.name,
              zones: places.zones
                .filter((z) => z.floorId === f.id)
                .map((z) => ({ id: z.id, name: z.name })),
            })),
        })),
      };
    },
    { readOnly: true },
  );
}

/** Checks a place belongs to this tenant and returns its names; null when it doesn't fit together. */
export function resolveReportPlace(
  tx: Tx,
  place: { buildingCode: string | null; floorId: string | null; zoneId: string | null },
) {
  return resolvePlace(tx, tx.tenantId, place);
}

/** Names for a batch of places, for list views. */
export function resolvePlaceNames(tx: Tx, codes: string[], ids: string[]) {
  return placeNames(tx, tx.tenantId, codes, ids);
}

async function readAppearance(tx: Tx): Promise<Appearance> {
  const parsed = AppearanceSchema.safeParse(await findPolicy(tx, tx.tenantId, APPEARANCE_POLICY));
  return parsed.success ? parsed.data : DEFAULT_APPEARANCE;
}

/** What the sign-in page and the app shell need before anyone signs in. */
export async function getTenantInfo(ctx: RequestCtx, tenant: Tenant): Promise<TenantInfo> {
  return withTx(
    ctx,
    async (tx) => ({
      tenant: {
        name: tenant.name,
        shortName: tenant.shortName,
        emailDomain: tenant.emailDomain,
        isPractice: tenant.isPractice,
      },
      appearance: await readAppearance(tx),
      office: await findMainDesk(tx, ctx.tenantId),
    }),
    { readOnly: true },
  );
}

/** IT admin only (enforced by the route guard): sets the theme for everyone in this tenant. */
export async function setAppearance(ctx: RequestCtx, appearance: Appearance): Promise<void> {
  await withTx(ctx, async (tx) => {
    const userId = tx.actor.kind === 'user' ? tx.actor.userId : null;
    await upsertPolicy(tx, ctx.tenantId, APPEARANCE_POLICY, appearance, userId);
    await recordAuditEvent(tx, {
      recordType: 'policy',
      recordId: APPEARANCE_POLICY,
      event: 'APPEARANCE_CHANGED',
      note: `${appearance.preset} · ${appearance.mode}${appearance.custom ? ' · custom palette' : ''}`,
    });
  });
}

// ── Seeding ──────────────────────────────────────────────────────────────────────────────────────

export type CatalogSeed = {
  buildings: { code: string; name: string; floors: { name: string; zones: string[] }[] }[];
  desk: {
    code: string;
    name: string;
    buildingCode: string;
    location: string;
    hours: string;
    bins: { code: string; label: string }[];
  };
  categories: readonly { code: string; label: string; sensitive: boolean; restricted: boolean }[];
  colours: readonly { code: string; label: string; swatch: string }[];
  policies: Record<string, unknown>;
};

/** Idempotent: safe to run on every `pnpm dev`. Keeps admin-edited policies. */
export async function seedCatalog(tx: Tx, seed: CatalogSeed): Promise<void> {
  const t = tx.tenantId;
  const buildingIds = new Map<string, string>();
  for (const [bi, b] of seed.buildings.entries()) {
    const buildingId = await upsertBuilding(tx, t, { code: b.code, name: b.name, sort: bi });
    buildingIds.set(b.code, buildingId);
    for (const [fi, f] of b.floors.entries()) {
      const floorId = await upsertFloor(tx, t, { buildingId, name: f.name, sort: fi });
      for (const [zi, z] of f.zones.entries())
        await upsertZone(tx, t, { floorId, name: z, sort: zi });
    }
  }
  const deskBuilding = buildingIds.get(seed.desk.buildingCode);
  if (!deskBuilding) throw new Error(`Desk building ${seed.desk.buildingCode} is not in the seed.`);
  const deskId = await upsertDesk(tx, t, {
    code: seed.desk.code,
    name: seed.desk.name,
    buildingId: deskBuilding,
    location: seed.desk.location,
    hours: seed.desk.hours,
  });
  for (const bin of seed.desk.bins) await upsertBin(tx, t, { deskId, ...bin });
  for (const [i, c] of seed.categories.entries()) await upsertCategory(tx, t, { ...c, sort: i });
  for (const [i, c] of seed.colours.entries()) await upsertColour(tx, t, { ...c, sort: i });
  for (const [key, value] of Object.entries(seed.policies))
    await insertPolicyIfMissing(tx, t, key, value);
}
