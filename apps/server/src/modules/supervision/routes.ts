// Supervisor routes: overview, policies and closures, staff. Supervisors only.
import {
  AddClosureSchema,
  AddStaffSchema,
  PoliciesSchema,
  PolicySettingsSchema,
  RemoveStaffSchema,
  StaffListSchema,
  SupervisorOverviewSchema,
} from '@lf/contracts';
import type { Guards } from '../../platform/http/middleware';
import { createRoute, createRouter, errorResponses, z } from '../../platform/http/router';
import {
  addClosure,
  addStaffMember,
  getPolicySettings,
  getStaff,
  removeClosure,
  removeStaffMember,
  supervisorOverview,
  updatePolicies,
} from './service';

const json = <T>(schema: T) => ({ 'application/json': { schema } });

export function supervisionRoutes(guards: Guards) {
  const router = createRouter();
  const read = { 401: errorResponses[401], 403: errorResponses[403] };
  const write = { 400: errorResponses[400], ...read };

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/supervisor/overview',
      tags: ['supervisor'],
      summary: 'Numbers, decisions, latest activity and Today for the supervisor',
      middleware: [guards.requireRole('supervisor')] as const,
      responses: {
        200: { description: 'The overview.', content: json(SupervisorOverviewSchema) },
        ...read,
      },
    }),
    async (c) => c.json(await supervisorOverview(c.var.ctx), 200),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/supervisor/policies',
      tags: ['supervisor'],
      summary: 'Policies and closures',
      middleware: [guards.requireRole('supervisor')] as const,
      responses: {
        200: { description: 'Policies and closures.', content: json(PolicySettingsSchema) },
        ...read,
      },
    }),
    async (c) => c.json(await getPolicySettings(c.var.ctx), 200),
  );

  router.openapi(
    createRoute({
      method: 'put',
      path: '/api/supervisor/policies',
      tags: ['supervisor'],
      summary: 'Change policies (applies straight away to open records)',
      middleware: [guards.requireRole('supervisor')] as const,
      request: { body: { required: true, content: json(PoliciesSchema) } },
      responses: {
        200: { description: 'The saved settings.', content: json(PolicySettingsSchema) },
        ...write,
      },
    }),
    async (c) => c.json(await updatePolicies(c.var.ctx, c.req.valid('json')), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/supervisor/closures',
      tags: ['supervisor'],
      summary: 'Add a closure or semester break (retention pauses, NF-09)',
      middleware: [guards.requireRole('supervisor')] as const,
      request: { body: { required: true, content: json(AddClosureSchema) } },
      responses: {
        201: { description: 'The saved settings.', content: json(PolicySettingsSchema) },
        ...write,
      },
    }),
    async (c) => c.json(await addClosure(c.var.ctx, c.req.valid('json')), 201),
  );

  router.openapi(
    createRoute({
      method: 'delete',
      path: '/api/supervisor/closures/{id}',
      tags: ['supervisor'],
      summary: 'Remove a closure',
      middleware: [guards.requireRole('supervisor')] as const,
      request: { params: z.object({ id: z.uuid() }) },
      responses: {
        200: { description: 'The saved settings.', content: json(PolicySettingsSchema) },
        404: errorResponses[404],
        ...write,
      },
    }),
    async (c) => c.json(await removeClosure(c.var.ctx, c.req.valid('param').id), 200),
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/api/supervisor/staff',
      tags: ['supervisor'],
      summary: 'Desk officers and supervisors',
      middleware: [guards.requireRole('supervisor')] as const,
      responses: { 200: { description: 'The staff.', content: json(StaffListSchema) }, ...read },
    }),
    async (c) => c.json(await getStaff(c.var.ctx), 200),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/supervisor/staff',
      tags: ['supervisor'],
      summary: 'Give someone desk access',
      middleware: [guards.requireRole('supervisor')] as const,
      request: { body: { required: true, content: json(AddStaffSchema) } },
      responses: {
        201: { description: 'The staff list.', content: json(StaffListSchema) },
        ...write,
      },
    }),
    async (c) => c.json(await addStaffMember(c.var.ctx, c.req.valid('json')), 201),
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/api/supervisor/staff/remove',
      tags: ['supervisor'],
      summary: 'Remove desk access',
      middleware: [guards.requireRole('supervisor')] as const,
      request: { body: { required: true, content: json(RemoveStaffSchema) } },
      responses: {
        200: { description: 'The staff list.', content: json(StaffListSchema) },
        404: errorResponses[404],
        ...write,
      },
    }),
    async (c) => c.json(await removeStaffMember(c.var.ctx, c.req.valid('json').email), 200),
  );

  return router;
}
