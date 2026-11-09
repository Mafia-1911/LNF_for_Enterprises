// GET /api/tenant (public), GET /api/catalog (signed in), PUT /api/admin/appearance (IT admin).
import { AppearanceSchema, CatalogSchema, TenantInfoSchema } from '@lf/contracts';
import type { Clock } from '../../platform/clock';
import type { DatabaseHandle, RequestCtx } from '../../platform/db/types';
import type { Guards } from '../../platform/http/middleware';
import { createRoute, createRouter, errorResponses } from '../../platform/http/router';
import { getCatalog, getTenantInfo, setAppearance } from './service';

export function catalogRoutes(guards: Guards, deps: { clock: Clock; db: DatabaseHandle }) {
  const router = createRouter();

  const tenantInfo = createRoute({
    method: 'get',
    path: '/api/tenant',
    tags: ['catalog'],
    summary: 'University name, theme and office details (no sign-in needed)',
    responses: {
      200: {
        description: 'Public tenant information.',
        content: { 'application/json': { schema: TenantInfoSchema } },
      },
      404: errorResponses[404],
    },
  });
  router.openapi(tenantInfo, async (c) => {
    const ctx: RequestCtx = {
      tenantId: c.var.tenant.id,
      actor: { kind: 'system', job: 'public' },
      requestId: c.var.requestId,
      clock: deps.clock,
      db: deps.db,
    };
    return c.json(await getTenantInfo(ctx, c.var.tenant), 200);
  });

  const catalog = createRoute({
    method: 'get',
    path: '/api/catalog',
    tags: ['catalog'],
    summary: 'Categories, colours and places this person may pick',
    middleware: [guards.requireUser()] as const,
    responses: {
      200: {
        description: 'The catalog.',
        content: { 'application/json': { schema: CatalogSchema } },
      },
      401: errorResponses[401],
      403: errorResponses[403],
    },
  });
  router.openapi(catalog, async (c) => c.json(await getCatalog(c.var.ctx), 200));

  const appearance = createRoute({
    method: 'put',
    path: '/api/admin/appearance',
    tags: ['catalog'],
    summary: 'Set the theme for everyone in this university (IT admin only)',
    middleware: [guards.requireRole('it_admin')] as const,
    request: {
      body: { required: true, content: { 'application/json': { schema: AppearanceSchema } } },
    },
    responses: {
      200: {
        description: 'The updated public tenant information.',
        content: { 'application/json': { schema: TenantInfoSchema } },
      },
      400: errorResponses[400],
      401: errorResponses[401],
      403: errorResponses[403],
    },
  });
  router.openapi(appearance, async (c) => {
    await setAppearance(c.var.ctx, c.req.valid('json'));
    return c.json(await getTenantInfo(c.var.ctx, c.var.tenant), 200);
  });

  return router;
}
