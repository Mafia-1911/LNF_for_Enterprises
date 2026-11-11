// Handover (WF-04 steps 5–7): pickup code lookup, the handover itself, and the DSP record.
import {
  AddAmendmentSchema,
  DispatchListQuerySchema,
  DispatchListSchema,
  DispatchRecordSchema,
  DispatchSchema,
  DisputeListSchema,
  DisputeNoteSchema,
  DisputeSchema,
  HandOverSchema,
  MyDisputeSchema,
  PickupLookupSchema,
  PickupSchema,
  RaiseDisputeSchema,
  ResolveDisputeSchema,
} from '@lf/contracts';
import { normaliseId } from '@lf/domain';
import { NotFound } from '../../platform/errors';
import type { Guards } from '../../platform/http/middleware';
import { createRoute, createRouter, errorResponses, z } from '../../platform/http/router';
import { addAmendment, directoryCsv, getDispatchRecord, listDirectory } from './directory';
import {
  addDisputeNote,
  getDispute,
  listAllDisputes,
  myDispute,
  raiseDispute,
  resolveDispute,
} from './disputes';
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

  // ── Supervisor: dispatch directory (FR-16–18) ────────────────────────────────────────────────

  const read = { 401: errorResponses[401], 403: errorResponses[403] };
  const disputeParam = z.object({ id: z.uuid() });

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/supervisor/dispatches',
      tags: ['supervisor'],
      summary: 'Search handovers by DSP/FND ID, claimant, ID last 4, date and category',
      middleware: [guards.requireRole('supervisor')] as const,
      request: { query: DispatchListQuerySchema },
      responses: {
        200: { description: 'Matching handovers.', content: json(DispatchListSchema) },
        400: errorResponses[400],
        ...read,
      },
    }),
    async (c) => c.json(await listDirectory(c.var.ctx, c.req.valid('query')), 200),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/supervisor/exports/dispatches.csv',
      tags: ['supervisor'],
      summary: 'The dispatch directory as CSV (FR-18)',
      middleware: [guards.requireRole('supervisor')] as const,
      request: { query: DispatchListQuerySchema },
      responses: {
        200: { description: 'CSV for audits.', content: { 'text/csv': { schema: z.string() } } },
        400: errorResponses[400],
        ...read,
      },
    }),
    async (c) =>
      c.text(await directoryCsv(c.var.ctx, c.req.valid('query')), 200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="dispatch-directory.csv"',
      }),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/supervisor/dispatches/{id}',
      tags: ['supervisor'],
      summary: 'A DSP record with the item history, amendments and disputes (US-07)',
      middleware: [guards.requireRole('supervisor')] as const,
      request: { params: idParam },
      responses: {
        200: { description: 'The record.', content: json(DispatchRecordSchema) },
        404: errorResponses[404],
        ...read,
      },
    }),
    async (c) =>
      c.json(await getDispatchRecord(c.var.ctx, id(c.req.valid('param').id, 'DSP')), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/supervisor/dispatches/{id}/amendments',
      tags: ['supervisor'],
      summary: 'Add a correction with a reason (FR-17)',
      middleware: [guards.requireRole('supervisor')] as const,
      request: { params: idParam, body: { required: true, content: json(AddAmendmentSchema) } },
      responses: {
        201: { description: 'The record.', content: json(DispatchRecordSchema) },
        400: errorResponses[400],
        404: errorResponses[404],
        ...read,
      },
    }),
    async (c) =>
      c.json(
        await addAmendment(c.var.ctx, id(c.req.valid('param').id, 'DSP'), c.req.valid('json')),
        201,
      ),
  );

  // ── Disputes (WF-06) ───────────────────────────────────────────────────────────────────────────

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/supervisor/disputes',
      tags: ['supervisor'],
      summary: 'Every dispute, open first',
      middleware: [guards.requireRole('supervisor')] as const,
      responses: {
        200: { description: 'Disputes.', content: json(DisputeListSchema) },
        ...read,
      },
    }),
    async (c) => c.json(await listAllDisputes(c.var.ctx), 200),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/supervisor/disputes/{id}',
      tags: ['supervisor'],
      summary: 'One dispute with its history',
      middleware: [guards.requireRole('supervisor')] as const,
      request: { params: disputeParam },
      responses: {
        200: { description: 'The dispute.', content: json(DisputeSchema) },
        404: errorResponses[404],
        ...read,
      },
    }),
    async (c) => c.json(await getDispute(c.var.ctx, c.req.valid('param').id), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/supervisor/disputes/{id}/notes',
      tags: ['supervisor'],
      summary: 'Add a note to a dispute (append-only)',
      middleware: [guards.requireRole('supervisor')] as const,
      request: { params: disputeParam, body: { required: true, content: json(DisputeNoteSchema) } },
      responses: {
        201: { description: 'The dispute.', content: json(DisputeSchema) },
        400: errorResponses[400],
        404: errorResponses[404],
        ...read,
      },
    }),
    async (c) =>
      c.json(
        await addDisputeNote(c.var.ctx, c.req.valid('param').id, c.req.valid('json').note),
        201,
      ),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/supervisor/disputes/{id}/resolve',
      tags: ['supervisor'],
      summary: 'Resolve a dispute (upheld or rejected), optionally flagging the recipient (CC-14)',
      middleware: [guards.requireRole('supervisor')] as const,
      request: {
        params: disputeParam,
        body: { required: true, content: json(ResolveDisputeSchema) },
      },
      responses: {
        200: { description: 'The dispute.', content: json(DisputeSchema) },
        400: errorResponses[400],
        404: errorResponses[404],
        409: errorResponses[409],
        ...read,
      },
    }),
    async (c) =>
      c.json(
        await resolveDispute(deps, c.var.ctx, c.req.valid('param').id, c.req.valid('json')),
        200,
      ),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/claims/{id}/dispute',
      tags: ['claims'],
      summary: 'Dispute a closed claim or a wrong handover (WF-06)',
      middleware: [guards.requireRole('student', 'visitor')] as const,
      request: { params: idParam, body: { required: true, content: json(RaiseDisputeSchema) } },
      responses: {
        201: { description: 'The dispute.', content: json(MyDisputeSchema) },
        400: errorResponses[400],
        404: errorResponses[404],
        409: errorResponses[409],
        ...read,
      },
    }),
    async (c) =>
      c.json(
        await raiseDispute(
          deps,
          c.var.ctx,
          id(c.req.valid('param').id, 'claim'),
          c.req.valid('json'),
        ),
        201,
      ),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/claims/{id}/dispute',
      tags: ['claims'],
      summary: 'My dispute on this claim, if any',
      middleware: [guards.requireRole('student', 'visitor')] as const,
      request: { params: idParam },
      responses: {
        200: { description: 'The dispute or null.', content: json(MyDisputeSchema) },
        404: errorResponses[404],
        ...read,
      },
    }),
    async (c) => c.json(await myDispute(c.var.ctx, id(c.req.valid('param').id, 'claim')), 200),
  );

  return router;
}
