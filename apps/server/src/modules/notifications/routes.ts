// GET /api/alerts and POST /api/alerts/read.
import { AlertListSchema, MarkAlertsReadSchema } from '@lf/contracts';
import type { Guards } from '../../platform/http/middleware';
import { createRoute, createRouter, errorResponses, z } from '../../platform/http/router';
import { listMyAlerts, markMyAlertsRead } from './service';

export function notificationsRoutes(guards: Guards) {
  const router = createRouter();

  const list = createRoute({
    method: 'get',
    path: '/api/alerts',
    tags: ['notifications'],
    summary: 'My alerts, newest first',
    middleware: [guards.requireUser()] as const,
    responses: {
      200: {
        description: 'Up to 50 alerts and the unread count.',
        content: { 'application/json': { schema: AlertListSchema } },
      },
      401: errorResponses[401],
      403: errorResponses[403],
    },
  });
  router.openapi(list, async (c) => c.json(await listMyAlerts(c.var.ctx), 200));

  const read = createRoute({
    method: 'post',
    path: '/api/alerts/read',
    tags: ['notifications'],
    summary: 'Mark alerts as read (all of them when no ids are given)',
    middleware: [guards.requireUser()] as const,
    request: {
      body: { required: true, content: { 'application/json': { schema: MarkAlertsReadSchema } } },
    },
    responses: {
      200: {
        description: 'Done.',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
      },
      400: errorResponses[400],
      401: errorResponses[401],
      403: errorResponses[403],
    },
  });
  router.openapi(read, async (c) => {
    await markMyAlertsRead(c.var.ctx, c.req.valid('json').ids);
    return c.json({ ok: true as const }, 200);
  });

  return router;
}
