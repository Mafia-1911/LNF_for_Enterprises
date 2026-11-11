// Claims: the owner's side (WF-04 steps 1–4) and the desk's review (step 3, FR-12), plus the desk
// "Today" list and withdrawing a lost report (CC-16), which cancels linked claims.
import {
  ClaimListSchema,
  ClaimSchema,
  ClaimStartSchema,
  DeskClaimQueueSchema,
  DeskItemClaimsSchema,
  DeskTodaySchema,
  idFromScan,
  ProvideMoreSchema,
  ReviewClaimSchema,
  SubmitClaimSchema,
} from '@lf/contracts';
import { normaliseId } from '@lf/domain';
import { NotFound } from '../../platform/errors';
import type { Guards } from '../../platform/http/middleware';
import { createRoute, createRouter, errorResponses, z } from '../../platform/http/router';
import {
  deskClaimQueue,
  deskItemClaims,
  deskToday,
  getMyClaim,
  listMyClaims,
  provideMore,
  reRequestClaim,
  reviewClaim,
  startClaim,
  submitClaim,
  withdrawClaim,
  withdrawLostReport,
  type ClaimsDeps,
} from './service';

const OWNERS = ['student', 'visitor'] as const;
const DESK = ['desk_officer', 'supervisor'] as const;
const idParam = z.object({ id: z.string().min(1).max(200) });
const json = <T>(schema: T) => ({ 'application/json': { schema } });

function recordId(raw: string, what: string): string {
  const id = idFromScan(raw) ?? normaliseId(raw);
  if (!id) throw new NotFound(`That isn't a valid ${what} ID; check it and try again.`);
  return id;
}

const err = (...codes: (400 | 401 | 403 | 404 | 409)[]) =>
  Object.fromEntries(codes.map((c) => [c, errorResponses[c]]));

export function claimsRoutes(guards: Guards, deps: ClaimsDeps) {
  const router = createRouter();

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/found-items/{id}/claim',
      tags: ['claims'],
      summary: '"This is mine": the questions to answer for an item',
      middleware: [guards.requireRole(...OWNERS)] as const,
      request: { params: idParam },
      responses: {
        200: {
          description: 'Item, questions and my open reports.',
          content: json(ClaimStartSchema),
        },
        ...err(400, 401, 403, 404),
      },
    }),
    async (c) =>
      c.json(await startClaim(deps, c.var.ctx, recordId(c.req.valid('param').id, 'item')), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/found-items/{id}/claims',
      tags: ['claims'],
      summary: 'Claim an item by answering its questions (WF-04, FR-11)',
      middleware: [guards.requireRole(...OWNERS)] as const,
      request: { params: idParam, body: { required: true, content: json(SubmitClaimSchema) } },
      responses: {
        201: { description: 'The claim, waiting for review.', content: json(ClaimSchema) },
        ...err(400, 401, 403, 404, 409),
      },
    }),
    async (c) =>
      c.json(
        await submitClaim(
          deps,
          c.var.ctx,
          recordId(c.req.valid('param').id, 'item'),
          c.req.valid('json'),
        ),
        201,
      ),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/claims',
      tags: ['claims'],
      summary: 'My claims, newest first',
      middleware: [guards.requireRole(...OWNERS)] as const,
      responses: {
        200: { description: 'My claims.', content: json(ClaimListSchema) },
        ...err(401, 403),
      },
    }),
    async (c) => c.json({ claims: await listMyClaims(deps, c.var.ctx) }, 200),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/claims/{id}',
      tags: ['claims'],
      summary: 'One of my claims (with the pickup code once approved)',
      middleware: [guards.requireRole(...OWNERS)] as const,
      request: { params: idParam },
      responses: {
        200: { description: 'The claim.', content: json(ClaimSchema) },
        ...err(400, 401, 403, 404),
      },
    }),
    async (c) =>
      c.json(await getMyClaim(deps, c.var.ctx, recordId(c.req.valid('param').id, 'claim')), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/claims/{id}/withdraw',
      tags: ['claims'],
      summary: 'Withdraw my claim',
      middleware: [guards.requireRole(...OWNERS)] as const,
      request: { params: idParam },
      responses: {
        200: { description: 'The claim, now withdrawn.', content: json(ClaimSchema) },
        ...err(400, 401, 403, 404, 409),
      },
    }),
    async (c) =>
      c.json(await withdrawClaim(deps, c.var.ctx, recordId(c.req.valid('param').id, 'claim')), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/claims/{id}/more',
      tags: ['claims'],
      summary: 'Answer what the desk asked for',
      middleware: [guards.requireRole(...OWNERS)] as const,
      request: { params: idParam, body: { required: true, content: json(ProvideMoreSchema) } },
      responses: {
        200: { description: 'The claim, back in review.', content: json(ClaimSchema) },
        ...err(400, 401, 403, 404, 409),
      },
    }),
    async (c) =>
      c.json(
        await provideMore(
          deps,
          c.var.ctx,
          recordId(c.req.valid('param').id, 'claim'),
          c.req.valid('json').answer,
        ),
        200,
      ),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/claims/{id}/re-request',
      tags: ['claims'],
      summary: 'Re-request a lapsed pickup (once, CC-11)',
      middleware: [guards.requireRole(...OWNERS)] as const,
      request: { params: idParam },
      responses: {
        200: { description: 'The claim, back in review.', content: json(ClaimSchema) },
        ...err(400, 401, 403, 404, 409),
      },
    }),
    async (c) =>
      c.json(
        await reRequestClaim(deps, c.var.ctx, recordId(c.req.valid('param').id, 'claim')),
        200,
      ),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/lost-reports/{id}/withdraw',
      tags: ['claims'],
      summary: '"I found it myself": close my report and cancel its claims (US-12, CC-16)',
      middleware: [guards.requireRole(...OWNERS)] as const,
      request: { params: idParam },
      responses: {
        200: { description: 'Done.', content: json(z.object({ ok: z.literal(true) })) },
        ...err(400, 401, 403, 404, 409),
      },
    }),
    async (c) => {
      await withdrawLostReport(deps, c.var.ctx, recordId(c.req.valid('param').id, 'report'));
      return c.json({ ok: true as const }, 200);
    },
  );

  // ── Desk ──────────────────────────────────────────────────────────────────────────────────

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/desk/today',
      tags: ['desk'],
      summary: 'The desk "Today" list',
      middleware: [guards.requireRole(...DESK)] as const,
      responses: {
        200: {
          description: 'To shelve, claims to review, pickups due, expiring.',
          content: json(DeskTodaySchema),
        },
        ...err(401, 403),
      },
    }),
    async (c) => c.json(await deskToday(c.var.ctx), 200),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/desk/claims',
      tags: ['desk'],
      summary: '"Check claims": items with claims waiting',
      middleware: [guards.requireRole(...DESK)] as const,
      responses: {
        200: {
          description: 'Items and how many claims, soonest deadline first.',
          content: json(DeskClaimQueueSchema),
        },
        ...err(401, 403),
      },
    }),
    async (c) => c.json(await deskClaimQueue(c.var.ctx), 200),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/desk/found-items/{id}/claims',
      tags: ['desk'],
      summary: 'Every claim on one item, next to what was recorded at intake (FR-12)',
      middleware: [guards.requireRole(...DESK)] as const,
      request: { params: idParam },
      responses: {
        200: { description: 'Side by side.', content: json(DeskItemClaimsSchema) },
        ...err(400, 401, 403, 404),
      },
    }),
    async (c) =>
      c.json(await deskItemClaims(deps, c.var.ctx, recordId(c.req.valid('param').id, 'item')), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/desk/claims/{id}/review',
      tags: ['desk'],
      summary: 'Approve, reject or ask for more (WF-04 step 3)',
      middleware: [guards.requireRole(...DESK)] as const,
      request: { params: idParam, body: { required: true, content: json(ReviewClaimSchema) } },
      responses: {
        200: {
          description: 'The item and its claims after the decision.',
          content: json(DeskItemClaimsSchema),
        },
        ...err(400, 401, 403, 404, 409),
      },
    }),
    async (c) =>
      c.json(
        await reviewClaim(
          deps,
          c.var.ctx,
          recordId(c.req.valid('param').id, 'claim'),
          c.req.valid('json'),
        ),
        200,
      ),
  );

  return router;
}
