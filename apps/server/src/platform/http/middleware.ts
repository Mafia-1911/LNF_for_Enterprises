// Middleware shared by every route: request id + logs, tenant from Host, signed-in user, roles.
import type { Role } from '@lf/domain';
import { createMiddleware } from 'hono/factory';
import type { Clock } from '../clock';
import type { DatabaseHandle } from '../db/types';
import { Forbidden, NotFound, Unauthenticated } from '../errors';
import { withLogContext, type Logger } from '../logger';
import type { TenantResolver } from '../tenancy';
import { runInRequestScope, type AppEnv, type SessionUser } from './context';

/** Runs the rest of the request with the request id on every log line, and logs one access line. */
export function requestLogging(logger: Logger, clock: Clock) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const requestId = c.var.requestId;
    await withLogContext({ requestId }, async () => {
      const started = clock.now().getTime();
      await next();
      const ms = clock.now().getTime() - started;
      const level = c.res.status >= 500 ? 'error' : c.res.status >= 400 ? 'warn' : 'info';
      logger[level](
        { method: c.req.method, route: c.req.routePath, status: c.res.status, ms },
        'request',
      );
    });
  });
}

const UNKNOWN_HOST_MESSAGE =
  "This address isn't set up for Lost & Found; check the link you were given.";

/** Resolves the tenant from the Host header and exposes it to Better-Auth hooks. */
export function tenantContext(resolver: TenantResolver) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const tenant = await resolver.byHost(c.req.header('host'));
    if (!tenant) throw new NotFound(UNKNOWN_HOST_MESSAGE);
    c.set('tenant', tenant);
    await runInRequestScope({ requestId: c.var.requestId, tenant }, next);
  });
}

/** Looks up the session (if any) and the user's role in this tenant. */
export function sessionContext(
  resolveUser: (headers: Headers, tenantId: string) => Promise<SessionUser | null>,
) {
  return createMiddleware<AppEnv>(async (c, next) => {
    c.set('user', await resolveUser(c.req.raw.headers, c.var.tenant.id));
    await next();
  });
}

/** Builds role guards. Guards set c.var.ctx, the RequestCtx services receive. */
export function createGuards(deps: { clock: Clock; db: DatabaseHandle }) {
  const guard = (roles: readonly Role[] | 'any') =>
    createMiddleware<AppEnv>(async (c, next) => {
      const user = c.var.user;
      if (!user) throw new Unauthenticated();
      if (!user.role)
        throw new Forbidden(
          "Your account isn't set up for this university yet; ask the Lost & Found office for access.",
        );
      if (roles !== 'any' && !roles.includes(user.role)) throw new Forbidden();
      c.set('ctx', {
        tenantId: c.var.tenant.id,
        actor: { kind: 'user', userId: user.id, role: user.role, name: user.name },
        requestId: c.var.requestId,
        clock: deps.clock,
        db: deps.db,
      });
      await next();
    });
  return {
    /** Any signed-in person with a role in this tenant. */
    requireUser: () => guard('any'),
    /** Only the listed roles. */
    requireRole: (...roles: Role[]) => guard(roles),
  };
}

export type Guards = ReturnType<typeof createGuards>;
