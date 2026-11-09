// Resolves the tenant from the request's Host header (ADR-0005). Results are cached in memory for
// a minute: a single-instance assumption (plan §11.4).
import { sql } from 'drizzle-orm';
import { drizzleOf } from '../db/pool';
import type { DatabaseHandle } from '../db/types';
import { tenants, type TenantRow } from './schema';

export { tenants, type TenantRow } from './schema';

export type Tenant = Pick<
  TenantRow,
  'id' | 'slug' | 'name' | 'shortName' | 'emailDomain' | 'isPractice'
>;

const TTL_MS = 60_000;

export function createTenantResolver(db: DatabaseHandle, now: () => number) {
  const cache = new Map<string, { tenant: Tenant | null; at: number }>();
  return {
    async byHost(hostHeader: string | undefined): Promise<Tenant | null> {
      const host = (hostHeader ?? '')
        .toLowerCase()
        .replace(/:\d+$/, '')
        .replace(/^\[|\]$/g, '');
      if (!host) return null;
      const hit = cache.get(host);
      if (hit && now() - hit.at < TTL_MS) return hit.tenant;
      const [row] = await drizzleOf(db)
        .select({
          id: tenants.id,
          slug: tenants.slug,
          name: tenants.name,
          shortName: tenants.shortName,
          emailDomain: tenants.emailDomain,
          isPractice: tenants.isPractice,
        })
        .from(tenants)
        .where(sql`${host} = any(${tenants.hostnames})`)
        .limit(1);
      const tenant = row ?? null;
      cache.set(host, { tenant, at: now() });
      return tenant;
    },
    clear() {
      cache.clear();
    },
  };
}

export type TenantResolver = ReturnType<typeof createTenantResolver>;

/** Seed only: creates or updates a tenant by slug and returns its id. */
export async function upsertTenant(
  db: DatabaseHandle,
  t: {
    slug: string;
    name: string;
    shortName: string;
    emailDomain: string;
    hostnames: string[];
    isPractice: boolean;
  },
): Promise<string> {
  const [row] = await drizzleOf(db)
    .insert(tenants)
    .values(t)
    .onConflictDoUpdate({
      target: tenants.slug,
      set: {
        name: t.name,
        shortName: t.shortName,
        emailDomain: t.emailDomain,
        hostnames: t.hostnames,
        isPractice: t.isPractice,
      },
    })
    .returning({ id: tenants.id });
  if (!row) throw new Error('tenant upsert returned no row');
  return row.id;
}
