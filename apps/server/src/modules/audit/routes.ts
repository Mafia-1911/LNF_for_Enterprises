// GET /api/audit/{recordType}/{recordId}: the audit trail of one record, for supervisors (WF-06).
import type { Guards } from '../../platform/http/middleware';
import { createRoute, createRouter, errorResponses, z } from '../../platform/http/router';
import { getRecordHistory } from './service';

const AuditEntrySchema = z
  .object({
    id: z.number().int(),
    event: z.string(),
    fromState: z.string().nullable(),
    toState: z.string().nullable(),
    actorId: z.uuid().nullable(),
    actorKind: z.string(),
    note: z.string().nullable(),
    at: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'AuditEntry' });

export function auditRoutes(guards: Guards) {
  const router = createRouter();

  const history = createRoute({
    method: 'get',
    path: '/api/audit/{recordType}/{recordId}',
    tags: ['audit'],
    summary: 'Audit trail of one record',
    middleware: [guards.requireRole('supervisor')] as const,
    request: {
      params: z.object({
        recordType: z.enum(['lost_report', 'found_item', 'claim', 'dispatch', 'policy']),
        recordId: z.string().min(1).max(64),
      }),
    },
    responses: {
      200: {
        description: 'Events, oldest first.',
        content: {
          'application/json': { schema: z.object({ events: z.array(AuditEntrySchema) }) },
        },
      },
      400: errorResponses[400],
      401: errorResponses[401],
      403: errorResponses[403],
    },
  });

  router.openapi(history, async (c) => {
    const { recordType, recordId } = c.req.valid('param');
    return c.json({ events: await getRecordHistory(c.var.ctx, recordType, recordId) }, 200);
  });

  return router;
}
