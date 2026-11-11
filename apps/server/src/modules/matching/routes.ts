// GET /api/lost-reports/{id}/matches: "Likely matches in custody" (Figma 39:6605).
import { LikelyMatchSchema } from '@lf/contracts';
import { normaliseId } from '@lf/domain';
import { NotFound } from '../../platform/errors';
import type { Guards } from '../../platform/http/middleware';
import { createRoute, createRouter, errorResponses, z } from '../../platform/http/router';
import { likelyMatches } from './service';

export function matchingRoutes(guards: Guards) {
  const router = createRouter();
  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/lost-reports/{id}/matches',
      tags: ['matching'],
      summary: 'Likely matches in custody for my lost report',
      middleware: [guards.requireRole('student', 'visitor', 'desk_officer', 'supervisor')] as const,
      request: { params: z.object({ id: z.string().min(1).max(32) }) },
      responses: {
        200: {
          description: 'Items at the desk, best match first, with plain reasons.',
          content: {
            'application/json': { schema: z.object({ matches: z.array(LikelyMatchSchema) }) },
          },
        },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
      },
    }),
    async (c) => {
      const id = normaliseId(c.req.valid('param').id);
      if (!id) throw new NotFound("That isn't a valid report ID; check it and try again.");
      return c.json({ matches: await likelyMatches(c.var.ctx, id) }, 200);
    },
  );
  return router;
}
