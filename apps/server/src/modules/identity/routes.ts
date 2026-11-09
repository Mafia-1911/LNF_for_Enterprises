// GET /api/me: the signed-in person, for the app shell and the role-based landing redirect.
import { MeResponseSchema } from '@lf/contracts';
import type { Guards } from '../../platform/http/middleware';
import { createRoute, createRouter, errorResponses } from '../../platform/http/router';
import { getMe } from './service';

export function identityRoutes(guards: Guards) {
  const router = createRouter();

  const me = createRoute({
    method: 'get',
    path: '/api/me',
    tags: ['identity'],
    summary: 'The signed-in person and their role in this university',
    middleware: [guards.requireUser()] as const,
    responses: {
      200: {
        description: 'The signed-in person.',
        content: { 'application/json': { schema: MeResponseSchema } },
      },
      401: errorResponses[401],
      403: errorResponses[403],
    },
  });

  router.openapi(me, async (c) => c.json({ me: await getMe(c.var.ctx) }, 200));

  return router;
}
