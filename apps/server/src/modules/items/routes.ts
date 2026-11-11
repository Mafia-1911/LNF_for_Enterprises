// GOLDEN SLICE — routes. One createRoute per endpoint: method, path, guard middleware, Zod request
// and response schemas from @lf/contracts, and the standard error responses. Handlers stay thin:
// read validated input, call the service with c.var.ctx, return JSON.
import {
  BinSuggestionSchema,
  CorrectFoundItemSchema,
  CreateFoundPostSchema,
  CreateLostReportSchema,
  DeskFoundItemSchema,
  DeskItemListSchema,
  DeskSearchQuerySchema,
  FoundItemLabelSchema,
  FoundPostListSchema,
  FoundPostSchema,
  GalleryListSchema,
  GalleryQuerySchema,
  idFromScan,
  LogFoundItemSchema,
  LoggedFoundItemSchema,
  LostReportCreatedSchema,
  LostReportListSchema,
  LostReportSchema,
  MergeFoundItemSchema,
  ReasonSchema,
  OutageSheetRequestSchema,
  OutageSheetSchema,
  ReceiveFoundItemSchema,
  RegisterImportResultSchema,
  RegisterImportSchema,
  RetentionDecisionResultSchema,
  RetentionDecisionSchema,
  RetentionItemSchema,
  RetentionListSchema,
  RetentionRunSchema,
  SimilarLostListSchema,
  SimilarLostQuerySchema,
} from '@lf/contracts';
import { CATEGORY_CODES, normaliseId } from '@lf/domain';
import type { Guards } from '../../platform/http/middleware';
import { createRoute, createRouter, errorResponses, z } from '../../platform/http/router';
import { NotFound } from '../../platform/errors';
import {
  getLostReport,
  listMyLostReports,
  renewLostReport,
  submitLostReport,
  type ItemsDeps,
} from './service';
import {
  binSuggestion,
  correctFoundItem,
  deskSearch,
  gallery,
  getDeskItem,
  getFoundPost,
  getLabel,
  getOutageSheet,
  importRegister,
  reserveOutageIds,
  listMyFoundPosts,
  logFoundItem,
  mergeFoundItem,
  postFoundItem,
  receiveFoundItem,
  similarLostReports,
  voidFoundItem,
  type FoundItemsDeps,
} from './found-items';
import { decideRetention, keepLonger, listRetention, runRetentionNow } from './retention';

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

  const renew = createRoute({
    method: 'post',
    path: '/api/lost-reports/{id}/renew',
    tags: ['items'],
    summary: 'Keep my report open another 30 days (twice at most)',
    middleware: [guards.requireRole(...REPORTERS)] as const,
    request: { params: z.object({ id: z.string().min(1).max(32) }) },
    responses: {
      200: {
        description: 'The renewed report.',
        content: { 'application/json': { schema: LostReportSchema } },
      },
      400: errorResponses[400],
      401: errorResponses[401],
      403: errorResponses[403],
      404: errorResponses[404],
      409: errorResponses[409],
    },
  });
  router.openapi(renew, async (c) => {
    const id = normaliseId(c.req.valid('param').id);
    if (!id) throw new NotFound("That isn't a valid report ID; check it and try again.");
    return c.json(await renewLostReport(c.var.ctx, id), 200);
  });

  return router;
}

const FINDERS = ['student', 'desk_officer', 'supervisor'] as const;
const BROWSERS = ['student', 'desk_officer', 'supervisor', 'it_admin', 'visitor'] as const;
const DESK = ['desk_officer', 'supervisor'] as const;

const itemParam = z.object({ id: z.string().min(1).max(200) });
function itemId(raw: string): string {
  const id = idFromScan(raw);
  if (!id) throw new NotFound("That isn't a valid item ID; check it and try again.");
  return id;
}

/** WF-02 (student post), FR-10 (gallery) and the desk's WF-03 intake, search and record views. */
export function foundItemsRoutes(guards: Guards, deps: FoundItemsDeps) {
  const router = createRouter();
  const json = <T>(schema: T) => ({ 'application/json': { schema } });

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/found-items',
      tags: ['found-items'],
      summary: 'Post a found item (WF-02, US-02)',
      middleware: [guards.requireRole(...FINDERS)] as const,
      request: { body: { required: true, content: json(CreateFoundPostSchema) } },
      responses: {
        201: {
          description: 'The post, its FND ID, QR and hand-in deadline.',
          content: json(FoundPostSchema),
        },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
      },
    }),
    async (c) => c.json(await postFoundItem(deps, c.var.ctx, c.req.valid('json')), 201),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/found-items',
      tags: ['found-items'],
      summary: 'Items I posted as a finder, newest first',
      middleware: [guards.requireRole(...FINDERS)] as const,
      responses: {
        200: { description: 'My posts.', content: json(FoundPostListSchema) },
        401: errorResponses[401],
        403: errorResponses[403],
      },
    }),
    async (c) => c.json({ items: await listMyFoundPosts(deps, c.var.ctx) }, 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/found-items/similar',
      tags: ['found-items'],
      summary: '"Someone lost this?": open lost reports like this item (no names, US-02)',
      middleware: [guards.requireRole(...FINDERS)] as const,
      request: { body: { required: true, content: json(SimilarLostQuerySchema) } },
      responses: {
        200: {
          description: 'Up to 5 reports with plain reasons.',
          content: json(SimilarLostListSchema),
        },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
      },
    }),
    async (c) => c.json({ reports: await similarLostReports(c.var.ctx, c.req.valid('json')) }, 200),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/found-items/{id}',
      tags: ['found-items'],
      summary: 'My post (the finder) or any post (desk staff)',
      middleware: [guards.requireRole(...FINDERS)] as const,
      request: { params: itemParam },
      responses: {
        200: { description: 'The post.', content: json(FoundPostSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
      },
    }),
    async (c) => c.json(await getFoundPost(deps, c.var.ctx, itemId(c.req.valid('param').id)), 200),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/gallery',
      tags: ['found-items'],
      summary: 'Found items at the desk (FR-10). Not for visitors.',
      middleware: [guards.requireRole(...BROWSERS)] as const,
      request: { query: GalleryQuerySchema },
      responses: {
        200: { description: 'Gallery cards, newest first.', content: json(GalleryListSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
      },
    }),
    async (c) => c.json({ items: await gallery(c.var.ctx, c.req.valid('query')) }, 200),
  );

  // ── Desk ──────────────────────────────────────────────────────────────────────────────────

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/desk/bins',
      tags: ['desk'],
      summary: 'The suggested bin for a category, and every bin with its item count',
      middleware: [guards.requireRole(...DESK)] as const,
      request: { query: z.object({ category: z.enum(CATEGORY_CODES) }) },
      responses: {
        200: { description: 'Suggestion and bins.', content: json(BinSuggestionSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
      },
    }),
    async (c) => c.json(await binSuggestion(c.var.ctx, c.req.valid('query').category), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/desk/found-items',
      tags: ['desk'],
      summary: 'Log a walk-in found item (WF-03)',
      middleware: [guards.requireRole(...DESK)] as const,
      request: { body: { required: true, content: json(LogFoundItemSchema) } },
      responses: {
        201: {
          description: 'The item (IN_CUSTODY) and its label.',
          content: json(LoggedFoundItemSchema),
        },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
      },
    }),
    async (c) => c.json(await logFoundItem(deps, c.var.ctx, c.req.valid('json')), 201),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/desk/found-items',
      tags: ['desk'],
      summary: '"Find an item": any ID or words',
      middleware: [guards.requireRole(...DESK)] as const,
      request: { query: DeskSearchQuerySchema },
      responses: {
        200: { description: 'Matching items.', content: json(DeskItemListSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
      },
    }),
    async (c) =>
      c.json({ items: await deskSearch(c.var.ctx, c.req.valid('query'), idFromScan) }, 200),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/desk/found-items/{id}',
      tags: ['desk'],
      summary: 'The full record, history and private details (staff only)',
      middleware: [guards.requireRole(...DESK)] as const,
      request: { params: itemParam },
      responses: {
        200: { description: 'The record.', content: json(DeskFoundItemSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
      },
    }),
    async (c) => c.json(await getDeskItem(deps, c.var.ctx, itemId(c.req.valid('param').id)), 200),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/desk/found-items/{id}/label',
      tags: ['desk'],
      summary: 'The printable label (QR, ID, bin)',
      middleware: [guards.requireRole(...DESK)] as const,
      request: { params: itemParam },
      responses: {
        200: { description: 'Label data.', content: json(FoundItemLabelSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
      },
    }),
    async (c) => c.json(await getLabel(deps, c.var.ctx, itemId(c.req.valid('param').id)), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/desk/found-items/{id}/receive',
      tags: ['desk'],
      summary: 'A student post was brought in: confirm, shelve (IN_CUSTODY)',
      middleware: [guards.requireRole(...DESK)] as const,
      request: {
        params: itemParam,
        body: { required: true, content: json(ReceiveFoundItemSchema) },
      },
      responses: {
        200: { description: 'The item and its label.', content: json(LoggedFoundItemSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
      },
    }),
    async (c) =>
      c.json(
        await receiveFoundItem(
          deps,
          c.var.ctx,
          itemId(c.req.valid('param').id),
          c.req.valid('json'),
        ),
        200,
      ),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/desk/found-items/{id}/correct',
      tags: ['desk'],
      summary: 'Correct a record (a reason is required and kept in the history)',
      middleware: [guards.requireRole(...DESK)] as const,
      request: {
        params: itemParam,
        body: { required: true, content: json(CorrectFoundItemSchema) },
      },
      responses: {
        200: { description: 'The corrected record.', content: json(DeskFoundItemSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
      },
    }),
    async (c) =>
      c.json(
        await correctFoundItem(
          deps,
          c.var.ctx,
          itemId(c.req.valid('param').id),
          c.req.valid('json'),
        ),
        200,
      ),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/desk/found-items/{id}/void',
      tags: ['desk'],
      summary: 'Mark a record created in error as VOID (it keeps its ID)',
      middleware: [guards.requireRole(...DESK)] as const,
      request: { params: itemParam, body: { required: true, content: json(ReasonSchema) } },
      responses: {
        200: { description: 'The record, now VOID.', content: json(DeskFoundItemSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
      },
    }),
    async (c) =>
      c.json(
        await voidFoundItem(
          deps,
          c.var.ctx,
          itemId(c.req.valid('param').id),
          c.req.valid('json').reason,
        ),
        200,
      ),
  );

  // ── Retention and disposal (supervisor, WF-05) ─────────────────────────────────────────────────

  const SUPERVISOR = ['supervisor'] as const;

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/supervisor/retention',
      tags: ['supervisor'],
      summary: 'Items awaiting a retention decision, ending soon, and recently decided (US-08)',
      middleware: [guards.requireRole(...SUPERVISOR)] as const,
      responses: {
        200: { description: 'The three lists.', content: json(RetentionListSchema) },
        401: errorResponses[401],
        403: errorResponses[403],
      },
    }),
    async (c) => c.json(await listRetention(c.var.ctx), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/supervisor/retention/decide',
      tags: ['supervisor'],
      summary: 'Donate, dispose of or transfer expired items, with a note (WF-05)',
      middleware: [guards.requireRole(...SUPERVISOR)] as const,
      request: { body: { required: true, content: json(RetentionDecisionSchema) } },
      responses: {
        200: {
          description: 'How many were decided.',
          content: json(RetentionDecisionResultSchema),
        },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
      },
    }),
    async (c) => c.json(await decideRetention(c.var.ctx, c.req.valid('json')), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/supervisor/retention/{id}/keep',
      tags: ['supervisor'],
      summary: 'Keep an item 30 more days',
      middleware: [guards.requireRole(...SUPERVISOR)] as const,
      request: { params: itemParam },
      responses: {
        200: { description: 'The item with its new end.', content: json(RetentionItemSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
      },
    }),
    async (c) => c.json(await keepLonger(c.var.ctx, itemId(c.req.valid('param').id)), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/supervisor/retention/run',
      tags: ['supervisor'],
      summary: 'Run the daily retention job now',
      middleware: [guards.requireRole(...SUPERVISOR)] as const,
      responses: {
        200: { description: 'What the run did.', content: json(RetentionRunSchema) },
        401: errorResponses[401],
        403: errorResponses[403],
      },
    }),
    async (c) => c.json(await runRetentionNow(deps, c.var.ctx), 200),
  );

  // ── Outage label sheets (NF-04) and the paper register (WF-07) ──────────────────────────────

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/desk/outage-sheet',
      tags: ['desk'],
      summary: 'Reserved FND IDs not entered yet, with QR codes to print',
      middleware: [guards.requireRole(...DESK)] as const,
      responses: {
        200: { description: 'Unused labels.', content: json(OutageSheetSchema) },
        401: errorResponses[401],
        403: errorResponses[403],
      },
    }),
    async (c) => c.json(await getOutageSheet(deps, c.var.ctx), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/desk/outage-sheet',
      tags: ['desk'],
      summary: 'Reserve FND IDs for a printed outage label sheet',
      middleware: [guards.requireRole(...DESK)] as const,
      request: { body: { required: true, content: json(OutageSheetRequestSchema) } },
      responses: {
        201: {
          description: 'Unused labels, including the new ones.',
          content: json(OutageSheetSchema),
        },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
      },
    }),
    async (c) => c.json(await reserveOutageIds(deps, c.var.ctx, c.req.valid('json').count), 201),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/supervisor/register/import',
      tags: ['supervisor'],
      summary: 'Bring paper logbook rows into custody as migrated found items (WF-07)',
      middleware: [guards.requireRole('supervisor')] as const,
      request: { body: { required: true, content: json(RegisterImportSchema) } },
      responses: {
        201: { description: 'The new FND IDs.', content: json(RegisterImportResultSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
      },
    }),
    async (c) => c.json(await importRegister(deps, c.var.ctx, c.req.valid('json')), 201),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/desk/found-items/{id}/merge',
      tags: ['desk'],
      summary: 'Merge a duplicate record into another (CC-04); the duplicate becomes VOID',
      middleware: [guards.requireRole(...DESK)] as const,
      request: { params: itemParam, body: { required: true, content: json(MergeFoundItemSchema) } },
      responses: {
        200: { description: 'The record that was kept.', content: json(DeskFoundItemSchema) },
        400: errorResponses[400],
        401: errorResponses[401],
        403: errorResponses[403],
        404: errorResponses[404],
        409: errorResponses[409],
      },
    }),
    async (c) =>
      c.json(
        await mergeFoundItem(
          deps,
          c.var.ctx,
          itemId(c.req.valid('param').id),
          itemId(c.req.valid('json').into),
        ),
        200,
      ),
  );

  return router;
}
