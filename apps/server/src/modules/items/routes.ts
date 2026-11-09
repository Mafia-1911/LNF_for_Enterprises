// GOLDEN SLICE — routes. One createRoute per endpoint: method, path, guard middleware, Zod request
// and response schemas from @lf/contracts, and the standard error responses. Handlers stay thin:
// read validated input, call the service with c.var.ctx, return JSON.
import {
  CreateLostReportSchema,
  LostReportCreatedSchema,
  LostReportListSchema,
  LostReportSchema,
} from '@lf/contracts';
import { normaliseId } from '@lf/domain';
import type { Guards } from '../../platform/http/middleware';
import { createRoute, createRouter, errorResponses, z } from '../../platform/http/router';
import { NotFound } from '../../platform/errors';
import { getLostReport, listMyLostReports, submitLostReport, type ItemsDeps } from './service';

const REPORTERS = ['student', 'visitor', 'desk_officer', 'supervisor'] as const;

export function itemsRoutes(guards: Guards, deps: ItemsDeps) {
  const router = createRouter();

  const submit = createRoute({
    method: 'post',
    path: '/api/lost-reports',
    tags: ['items'],
    summary: 'Submit a lost report (US-01)',
    middleware: [guards.requireRole(...REPORTERS)] as const,
    request: {
      body: { required: true, content: { 'application/json': { schema: CreateLostReportSchema } } },
    },
    responses: {
      201: {
        description: 'The report was created and matching was queued.',
        content: { 'application/json': { schema: LostReportCreatedSchema } },
      },
      400: errorResponses[400],
      401: errorResponses[401],
      403: errorResponses[403],
    },
  });
  router.openapi(submit, async (c) =>
    c.json(await submitLostReport(deps, c.var.ctx, c.req.valid('json')), 201),
  );

  const mine = createRoute({
    method: 'get',
    path: '/api/lost-reports',
    tags: ['items'],
    summary: 'My lost reports, newest first',
    middleware: [guards.requireRole(...REPORTERS)] as const,
    responses: {
      200: {
        description: 'Reports owned by the signed-in person.',
        content: { 'application/json': { schema: LostReportListSchema } },
      },
      401: errorResponses[401],
      403: errorResponses[403],
    },
  });
  router.openapi(mine, async (c) => c.json({ reports: await listMyLostReports(c.var.ctx) }, 200));

  const one = createRoute({
    method: 'get',
    path: '/api/lost-reports/{id}',
    tags: ['items'],
    summary: 'One lost report (owner or desk staff)',
    middleware: [guards.requireRole(...REPORTERS)] as const,
    request: { params: z.object({ id: z.string().min(1).max(32) }) },
    responses: {
      200: {
        description: 'The report, without private details.',
        content: { 'application/json': { schema: LostReportSchema } },
      },
      400: errorResponses[400],
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
    },
  });
  router.openapi(one, async (c) => {
    const id = normaliseId(c.req.valid('param').id);
    if (!id) throw new NotFound("That isn't a valid report ID; check it and try again.");
    return c.json(await getLostReport(c.var.ctx, id), 200);
  });

  return router;
}
