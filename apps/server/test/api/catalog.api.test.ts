// Tenant info, catalog and the IT-admin-only appearance setting (ADR-0010).
import type { Catalog, TenantInfo } from '@lf/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from '../harness';
import { email } from '../fixtures';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

describe('GET /api/tenant (public)', () => {
  it('describes the university for its own address, with no sign-in', async () => {
    const res = await ctx.anonymous().get<TenantInfo>('/api/tenant');
    expect(res.status).toBe(200);
    expect(res.body.tenant).toEqual({
      name: 'North South University',
      shortName: 'NSU',
      emailDomain: 'northsouth.edu',
      isPractice: false,
    });
    expect(res.body.appearance).toEqual({ preset: 'teal', mode: 'dark', custom: null });
    expect(res.body.office).toEqual({
      name: 'Lost & Found Office',
      location: 'Admin Building, Ground floor, Security Room',
      hours: 'Sun–Thu, 9:00 – 17:00',
    });
    // Outside the public demo every sign-in method is on, and email codes are university-only.
    expect(res.body.signIn).toEqual({ sso: true, phone: true, emailCodes: true, anyEmail: false });
  });

  it('serves the other university on its own address', async () => {
    const res = await ctx.anonymous(ctx.hosts.B).get<TenantInfo>('/api/tenant');
    expect(res.body.tenant.name).toBe('Other University B');
  });
});

describe('GET /api/catalog', () => {
  it('gives students the 21 reportable categories, 16 colours and the campus places', async () => {
    const res = await (await ctx.as(email.student)).get<Catalog>('/api/catalog');
    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(21);
    expect(res.body.categories.some((c) => c.restricted)).toBe(false);
    expect(res.body.colours).toHaveLength(16);
    expect(res.body.buildings.map((b) => b.code)).toEqual([
      'NAC',
      'SAC',
      'LIB',
      'ADM',
      'PLZ',
      'AUD',
      'GYM',
    ]);
    expect(
      res.body.buildings
        .find((b) => b.code === 'LIB')
        ?.floors.find((f) => f.name === '2nd floor')
        ?.zones.map((z) => z.name),
    ).toEqual(['Reading hall', 'Quiet study']);
  });

  it('adds the four restricted desk-only categories for desk staff', async () => {
    const res = await (await ctx.as(email.desk)).get<Catalog>('/api/catalog');
    expect(res.body.categories.filter((c) => c.restricted).map((c) => c.code)).toEqual([
      'weapon',
      'drugs',
      'university_keys',
      'hazardous',
    ]);
  });

  it('needs a signed-in person', async () => {
    expect((await ctx.anonymous().get('/api/catalog')).status).toBe(401);
  });
});

describe('PUT /api/admin/appearance (IT admin only)', () => {
  const navyLight = { preset: 'navy', mode: 'light', custom: null };

  it.each([email.student, email.desk, email.supervisor, email.visitor])(
    'refuses %s',
    async (who) => {
      expect((await (await ctx.as(who)).put('/api/admin/appearance', navyLight)).status).toBe(403);
    },
  );

  it('lets the IT admin change the theme for everyone, and audits it', async () => {
    const res = await (
      await ctx.as(email.itAdmin)
    ).put<TenantInfo>('/api/admin/appearance', navyLight);
    expect(res.status).toBe(200);
    expect(res.body.appearance).toEqual(navyLight);
    expect((await ctx.anonymous().get<TenantInfo>('/api/tenant')).body.appearance).toEqual(
      navyLight,
    );
    const audit = await ctx.owner.query(
      `select event, note from audit_events where tenant_id = $1 and record_type = 'policy'`,
      [ctx.tenantA],
    );
    expect(audit.rows).toEqual([{ event: 'APPEARANCE_CHANGED', note: 'navy · light' }]);
    // The other university keeps its own theme.
    expect(
      (await ctx.anonymous(ctx.hosts.B).get<TenantInfo>('/api/tenant')).body.appearance.preset,
    ).toBe('teal');
  });

  const palette = {
    'brand/primary': '#0b6e6e',
    'brand/primary-strong': '#08504f',
    'brand/on-primary': '#ffffff',
    'brand/primary-soft': '#ddf0ee',
    'brand/accent': '#e0a458',
    'brand/accent-strong': '#8c5a17',
    'brand/on-accent': '#231505',
    'brand/accent-soft': '#f8eddd',
  };

  it('accepts a custom palette that keeps text readable', async () => {
    const res = await (
      await ctx.as(email.itAdmin)
    ).put<TenantInfo>('/api/admin/appearance', {
      preset: 'teal',
      mode: 'system',
      custom: { light: palette, dark: palette },
    });
    expect(res.status).toBe(200);
    expect(res.body.appearance.custom?.light['brand/primary']).toBe('#0b6e6e');
  });

  it('rejects a custom palette that fails WCAG AA contrast, saying which pair and why', async () => {
    const unreadable = { ...palette, 'brand/on-primary': '#0c6f6f' };
    const res = await (
      await ctx.as(email.itAdmin)
    ).put<{ error: { fields: Record<string, string> } }>('/api/admin/appearance', {
      preset: 'teal',
      mode: 'light',
      custom: { light: unreadable, dark: palette },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields['custom.light.brand/on-primary']).toMatch(
      /contrast 1\.\d\d:1; pick colours with at least 4\.5:1\.$/,
    );
  });

  it('rejects colours that are not hex', async () => {
    const res = await (
      await ctx.as(email.itAdmin)
    ).put('/api/admin/appearance', {
      preset: 'teal',
      mode: 'light',
      custom: { light: { ...palette, 'brand/primary': 'red' }, dark: palette },
    });
    expect(res.status).toBe(400);
  });
});
