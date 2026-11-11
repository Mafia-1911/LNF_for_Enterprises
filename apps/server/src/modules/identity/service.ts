// Sign-in rules and "who am I". Plain functions that take their dependencies as arguments.
//   - Students and staff use their university email (tenant.emailDomain); visitors use a phone.
//   - Staff roles (desk officer, supervisor, IT admin) sign in with SSO only (A2, CC-10).
//   - First sign-in gives a default role: student for university accounts, visitor for phones.
import type { AddStaff, StaffMember } from '@lf/contracts';
import { isRole, isStaffRole, type Role } from '@lf/domain';
import { SignInRefused, type AuthPolicy, type SignInMethod } from '../../platform/auth';
import type { Clock } from '../../platform/clock';
import { withTx } from '../../platform/db/tx';
import type { DatabaseHandle, RequestCtx, Tx } from '../../platform/db/types';
import { NotFound, Unauthenticated, ValidationFailed } from '../../platform/errors';
import type { SessionUser } from '../../platform/http/context';
import type { Tenant } from '../../platform/tenancy';
import {
  deleteStaffInvite,
  findMember,
  findMemberByEmail,
  findStaffInvite,
  listStaffInvites,
  listStaffMembers,
  setRoleAssignment,
  upsertStaffInvite,
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
      const [m, invite] = await withTx(
        systemCtx(deps, tenant, 'auth-policy'),
        async (tx) =>
          [
            await findMemberByEmail(tx, tenant.id, email),
            await findStaffInvite(tx, tenant.id, email.toLowerCase()),
          ] as const,
        { readOnly: true },
      );
      if ((m?.role && isStaffRole(m.role)) || invite) throw new SignInRefused(MSG.staffUseSso);
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
        // A supervisor added this person as staff before they signed in (Staff page).
        const invite =
          m && method === 'sso'
            ? await findStaffInvite(tx, tenant.id, m.email.toLowerCase())
            : null;
        if (m && invite && isRole(invite.role)) {
          await setRoleAssignment(tx, tenant.id, {
            userId,
            role: invite.role,
            title: STAFF_TITLE[invite.role] ?? null,
            grantedBy: invite.grantedBy,
          });
          await deleteStaffInvite(tx, tenant.id, invite.email);
          return;
        }
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

export type MemberProfile = { name: string; title: string | null; role: string };

/** Name, title and role of members of this tenant (claim review, handover). */
export async function memberProfiles(
  tx: Tx,
  userIds: string[],
): Promise<Map<string, MemberProfile>> {
  const out = new Map<string, MemberProfile>();
  for (const id of [...new Set(userIds)]) {
    const m = await findMember(tx, tx.tenantId, id);
    if (m) out.set(id, { name: m.name, title: m.title, role: m.role ?? 'none' });
  }
  return out;
}

// ── Staff (supervisor's Staff page, Figma 39:27640) ──────────────────────────────────────────────

const STAFF_TITLE: Partial<Record<Role, string>> = {
  desk_officer: 'Desk officer',
  supervisor: 'L&F Supervisor',
};

/** Desk officers and supervisors, plus people added who haven't signed in yet. */
export async function listStaff(tx: Tx): Promise<StaffMember[]> {
  const me = tx.actor.kind === 'user' ? tx.actor.userId : null;
  const active: StaffMember[] = (await listStaffMembers(tx, tx.tenantId)).map((m) => ({
    userId: m.userId,
    email: m.email,
    name: m.name,
    role: m.role === 'supervisor' ? 'supervisor' : 'desk_officer',
    status: 'active',
    you: m.userId === me,
  }));
  const invited: StaffMember[] = (await listStaffInvites(tx, tx.tenantId)).map((i) => ({
    userId: null,
    email: i.email,
    name: i.name,
    role: i.role === 'supervisor' ? 'supervisor' : 'desk_officer',
    status: 'invited',
    you: false,
  }));
  return [...active, ...invited];
}

/**
 * Gives someone desk access. A person who already signed in gets the role now; anyone else gets it
 * on their first single sign-on. Returns the record id to audit.
 */
export async function addStaff(tx: Tx, input: AddStaff, emailDomain: string): Promise<string> {
  if (domainOf(input.email) !== emailDomain)
    throw new ValidationFailed({
      email: `Staff need an @${emailDomain} email; check the address.`,
    });
  const grantedBy = tx.actor.kind === 'user' ? tx.actor.userId : null;
  const m = await findMemberByEmail(tx, tx.tenantId, input.email);
  if (m?.role === 'it_admin')
    throw new ValidationFailed({
      email: 'That person is the IT admin; ask IT to change their role.',
    });
  if (m?.role === input.role)
    throw new ValidationFailed({ email: `${m.name} already has that role; nothing to change.` });
  if (m) {
    await setRoleAssignment(tx, tx.tenantId, {
      userId: m.userId,
      role: input.role,
      title: STAFF_TITLE[input.role] ?? null,
      grantedBy,
    });
    return m.userId;
  }
  await upsertStaffInvite(tx, tx.tenantId, { ...input, grantedBy });
  return `invite:${input.email}`;
}

/** Removes desk access: the person becomes an ordinary university member again. */
export async function removeStaff(tx: Tx, email: string): Promise<string> {
  const me = tx.actor.kind === 'user' ? tx.actor.userId : null;
  if (await deleteStaffInvite(tx, tx.tenantId, email)) return `invite:${email}`;
  const m = await findMemberByEmail(tx, tx.tenantId, email);
  if (!m || (m.role !== 'desk_officer' && m.role !== 'supervisor'))
    throw new NotFound("That person isn't on the staff list; reload the page.");
  if (m.userId === me)
    throw new ValidationFailed({}, "You can't remove your own access; ask another supervisor.");
  await setRoleAssignment(tx, tx.tenantId, {
    userId: m.userId,
    role: 'student',
    title: null,
    grantedBy: me,
  });
  return m.userId;
}
