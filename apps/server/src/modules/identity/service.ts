// Sign-in rules and "who am I". Plain functions that take their dependencies as arguments.
//   - Students and staff use their university email (tenant.emailDomain); visitors use a phone.
//   - Staff roles (desk officer, supervisor, IT admin) sign in with SSO only (A2, CC-10).
//   - First sign-in gives a default role: student for university accounts, visitor for phones.
import { isStaffRole, type Role } from '@lf/domain';
import { SignInRefused, type AuthPolicy, type SignInMethod } from '../../platform/auth';
import type { Clock } from '../../platform/clock';
import { withTx } from '../../platform/db/tx';
import type { DatabaseHandle, RequestCtx, Tx } from '../../platform/db/types';
import { Unauthenticated } from '../../platform/errors';
import type { SessionUser } from '../../platform/http/context';
import type { Tenant } from '../../platform/tenancy';
import {
  findMember,
  findMemberByEmail,
  namesOf,
  findMemberByPhone,
  insertRoleAssignment,
  upsertRoleAssignment,
  upsertSeedUser,
  type Member,
} from './repo';

export type IdentityDeps = { db: DatabaseHandle; clock: Clock };

function systemCtx(deps: IdentityDeps, tenant: Tenant, job: string): RequestCtx {
  return {
    tenantId: tenant.id,
    actor: { kind: 'system', job },
    requestId: job,
    clock: deps.clock,
    db: deps.db,
  };
}

const domainOf = (email: string) => email.toLowerCase().split('@')[1] ?? '';

const MSG = {
  wrongDomain: (domain: string) =>
    `Use your @${domain} email to sign in, or choose Visitor to sign in with your phone.`,
  staffUseSso:
    'Staff accounts sign in with NSU single sign-on; use the "Continue with NSU single sign-on" button.',
  ssoWrongDomain: (domain: string) =>
    `Single sign-on only accepts @${domain} accounts; sign in with your university account.`,
  phoneBelongsToMember:
    'This number belongs to a university account; sign in with your university email instead.',
};

export function createAuthPolicy(deps: IdentityDeps): AuthPolicy {
  const member = (tenant: Tenant, find: (ctx: RequestCtx) => Promise<Member | null>) =>
    find(systemCtx(deps, tenant, 'auth-policy'));

  return {
    async checkEmailCode(email, tenant) {
      if (domainOf(email) !== tenant.emailDomain)
        throw new SignInRefused(MSG.wrongDomain(tenant.emailDomain));
      const m = await member(tenant, (ctx) =>
        withTx(ctx, (tx) => findMemberByEmail(tx, tenant.id, email), { readOnly: true }),
      );
      if (m?.role && isStaffRole(m.role)) throw new SignInRefused(MSG.staffUseSso);
    },

    async checkPhoneCode(phoneNumber, tenant) {
      const m = await member(tenant, (ctx) =>
        withTx(ctx, (tx) => findMemberByPhone(tx, tenant.id, phoneNumber), { readOnly: true }),
      );
      if (m?.role && m.role !== 'visitor') throw new SignInRefused(MSG.phoneBelongsToMember);
    },

    beforeUserCreate(email, method, tenant) {
      // Returns a rejected promise (never throws synchronously), like the other policy checks.
      const wrongDomain = domainOf(email) !== tenant.emailDomain;
      if (method === 'sso' && wrongDomain)
        return Promise.reject(new SignInRefused(MSG.ssoWrongDomain(tenant.emailDomain)));
      if (method === 'email_otp' && wrongDomain)
        return Promise.reject(new SignInRefused(MSG.wrongDomain(tenant.emailDomain)));
      return Promise.resolve();
    },

    async beforeSession(userId, method, tenant) {
      const m = await member(tenant, (ctx) =>
        withTx(ctx, (tx) => findMember(tx, tenant.id, userId), { readOnly: true }),
      );
      if (!m) return;
      if (method === 'sso' && domainOf(m.email) !== tenant.emailDomain)
        throw new SignInRefused(MSG.ssoWrongDomain(tenant.emailDomain));
      if (method === 'email_otp') {
        if (domainOf(m.email) !== tenant.emailDomain)
          throw new SignInRefused(MSG.wrongDomain(tenant.emailDomain));
        if (m.role && isStaffRole(m.role)) throw new SignInRefused(MSG.staffUseSso);
      }
      if (method === 'phone_otp' && m.role && m.role !== 'visitor')
        throw new SignInRefused(MSG.phoneBelongsToMember);
    },

    async afterSession(userId, method, tenant) {
      const role: Role = method === 'phone_otp' ? 'visitor' : 'student';
      await withTx(systemCtx(deps, tenant, 'auth-default-role'), async (tx) => {
        const m = await findMember(tx, tenant.id, userId);
        if (m && !m.role)
          await insertRoleAssignment(tx, tenant.id, {
            userId,
            role,
            title: role === 'visitor' ? 'Visitor' : null,
            grantedBy: null,
          });
      });
    },
  };
}

/** Builds the session user (with their role in this tenant) for the session middleware. */
export function createSessionUserResolver(
  deps: IdentityDeps,
  getSession: (
    headers: Headers,
  ) => Promise<{ user: { id: string; emailVerified: boolean } } | null>,
) {
  return async (headers: Headers, tenantId: string): Promise<SessionUser | null> => {
    const session = await getSession(headers);
    if (!session) return null;
    const ctx: RequestCtx = {
      tenantId,
      actor: { kind: 'system', job: 'session' },
      requestId: 'session',
      clock: deps.clock,
      db: deps.db,
    };
    const m = await withTx(ctx, (tx) => findMember(tx, tenantId, session.user.id), {
      readOnly: true,
    });
    if (!m) return null;
    return {
      id: m.userId,
      name: m.name,
      email: m.email,
      role: m.role,
      emailVerified: session.user.emailVerified,
    };
  };
}

export type Me = {
  id: string;
  name: string;
  role: Role;
  title: string | null;
  contact: string;
};

/** The signed-in person as the app shell shows them. */
export async function getMe(ctx: RequestCtx): Promise<Me> {
  if (ctx.actor.kind !== 'user') throw new Unauthenticated();
  const userId = ctx.actor.userId;
  const m = await withTx(ctx, (tx) => findMember(tx, ctx.tenantId, userId), { readOnly: true });
  if (!m?.role) throw new Unauthenticated();
  const contact = m.role === 'visitor' && m.phoneNumber ? m.phoneNumber : m.email;
  return { id: m.userId, name: m.name, role: m.role, title: m.title, contact };
}

export type { SignInMethod };

export type MemberSeed = {
  email: string;
  name: string;
  role: Role;
  title: string | null;
  phoneNumber?: string;
};

/** Seed only: makes sure a person exists with this role in the transaction's tenant. */
export async function seedMember(tx: Tx, member: MemberSeed, newId: () => string): Promise<string> {
  const userId = await upsertSeedUser(tx, {
    id: newId(),
    email: member.email,
    name: member.name,
    phoneNumber: member.phoneNumber ?? null,
  });
  await upsertRoleAssignment(tx, tx.tenantId, { userId, role: member.role, title: member.title });
  return userId;
}

/** Names for history lists and "logged by" fields. */
export function memberNames(tx: Tx, userIds: string[]): Promise<Map<string, string>> {
  return namesOf(tx, [...new Set(userIds)]);
}

/** The member of this tenant with this email (for the ID card fast lane), or null. */
export async function memberByEmail(
  tx: Tx,
  email: string,
): Promise<{ userId: string; name: string } | null> {
  const m = await findMemberByEmail(tx, tx.tenantId, email.toLowerCase());
  return m && m.role ? { userId: m.userId, name: m.name } : null;
}
