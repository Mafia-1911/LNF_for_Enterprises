// Per-request state shared by Hono middleware, route handlers and Better-Auth hooks.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@lf/domain';
import type { RequestCtx } from '../db/types';
import type { Tenant } from '../tenancy';

/** The signed-in person, with their role in the current tenant (null when they have none). */
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role | null;
  emailVerified: boolean;
};

export type AppVariables = {
  requestId: string;
  tenant: Tenant;
  user: SessionUser | null;
  ctx: RequestCtx;
};

export type AppEnv = { Variables: AppVariables };

/** Request scope visible to code that has no Hono context, such as Better-Auth hooks. */
export type RequestScope = { requestId: string; tenant: Tenant | null };

const scope = new AsyncLocalStorage<RequestScope>();

export function runInRequestScope<T>(value: RequestScope, fn: () => T): T {
  return scope.run(value, fn);
}

export function currentRequestScope(): RequestScope | undefined {
  return scope.getStore();
}
