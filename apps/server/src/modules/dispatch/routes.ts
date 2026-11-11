// Handover (WF-04 steps 5–7): pickup code lookup, the handover itself, and the DSP record.
import { DispatchSchema, HandOverSchema, PickupLookupSchema, PickupSchema } from '@lf/contracts';
import { normaliseId } from '@lf/domain';
import { NotFound } from '../../platform/errors';
import type { Guards } from '../../platform/http/middleware';
import { createRoute, createRouter, errorResponses, z } from '../../platform/http/router';
import { findPickup, getDispatch, handOver, type DispatchDeps } from './service';

const DESK = ['desk_officer', 'supervisor'] as const;
const json = <T>(schema: T) => ({ 'application/json': { schema } });
const idParam = z.object({ id: z.string().min(1).max(32) });
function id(raw: string, what: string) {
  const v = normaliseId(raw);
  if (!v) throw new NotFound(`That isn't a valid ${what} ID; check it and try again.`);
  return v;
}

export function dispatchRoutes(guards: Guards, deps: DispatchDeps) {
  const router = createRouter();

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/desk/pickups/lookup',
      tags: ['desk'],
      summary: 'Find the approved claim for a 6-digit pickup code',
      middleware: [guards.requireRole(...DESK)] as const,
      request: { body: { required: true, content: json(PickupLookupSchema) } },
      responses: {
        200: { description: 'The item, its bin and the claimant.', content: json(PickupSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
      },
    }),
    async (c) => c.json(await findPickup(deps, c.var.ctx, c.req.valid('json').code), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/desk/pickups/{id}/hand-over',
      tags: ['desk'],
      summary: 'Record the handover: identity checked, signed (DSP record)',
      middleware: [guards.requireRole(...DESK)] as const,
      request: { params: idParam, body: { required: true, content: json(HandOverSchema) } },
      responses: {
        201: { description: 'The DSP record.', content: json(DispatchSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
      },
    }),
    async (c) =>
      c.json(
        await handOver(deps, c.var.ctx, id(c.req.valid('param').id, 'claim'), c.req.valid('json')),
        201,
      ),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/desk/dispatches/{id}',
      tags: ['desk'],
      summary: 'A handover (DSP) record',
      middleware: [guards.requireRole(...DESK)] as const,
      request: { params: idParam },
      responses: {
        200: { description: 'The record.', content: json(DispatchSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
      },
    }),
    async (c) => c.json(await getDispatch(c.var.ctx, id(c.req.valid('param').id, 'handover')), 200),
  );

  return router;
}
