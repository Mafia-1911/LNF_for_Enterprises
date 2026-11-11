// The only file that touches identity tables. Every function takes tenantId first (plan §5.3).
import { isRole, type Role } from '@lf/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { users } from '../../platform/auth/schema';
import type { Tx } from '../../platform/db/types';
import { accountFlags, flagClears, roleAssignments, staffInvites } from './schema';

export type Member = {
  userId: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  role: Role | null;
  title: string | null;
};

export async function findMember(tx: Tx, tenantId: string, userId: string): Promise<Member | null> {
  const [row] = await tx.db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      phoneNumber: users.phoneNumber,
      role: roleAssignments.role,
      title: roleAssignments.title,
    })
    .from(users)
    .leftJoin(
      roleAssignments,
      and(eq(roleAssignments.userId, users.id), eq(roleAssignments.tenantId, tenantId)),
    )
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return { ...row, role: row.role && isRole(row.role) ? row.role : null };
}

export async function findMemberByEmail(
  tx: Tx,
  tenantId: string,
  email: string,
): Promise<Member | null> {
  const [row] = await tx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ? findMember(tx, tenantId, row.id) : null;
}

export async function findMemberByPhone(
  tx: Tx,
  tenantId: string,
  phoneNumber: string,
): Promise<Member | null> {
  const [row] = await tx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phoneNumber, phoneNumber))
    .limit(1);
  return row ? findMember(tx, tenantId, row.id) : null;
}

export async function insertRoleAssignment(
  tx: Tx,
  tenantId: string,
  data: { userId: string; role: Role; title: string | null; grantedBy: string | null },
): Promise<void> {
  await tx.db
    .insert(roleAssignments)
    .values({
      tenantId,
      userId: data.userId,
      role: data.role,
      title: data.title,
      grantedBy: data.grantedBy,
      createdAt: tx.now,
    })
    .onConflictDoNothing();
}

// ── Seeding ──────────────────────────────────────────────────────────────────────────────────────

/** Creates or updates a person by email (seed only). Returns their id. */
export async function upsertSeedUser(
  tx: Tx,
  user: { id: string; email: string; name: string; phoneNumber: string | null },
): Promise<string> {
  const [row] = await tx.db
    .insert(users)
    .values({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.phoneNumber === null,
      phoneNumber: user.phoneNumber,
      phoneNumberVerified: user.phoneNumber === null ? null : true,
      createdAt: tx.now,
      updatedAt: tx.now,
    })
    .onConflictDoUpdate({ target: users.email, set: { name: user.name, updatedAt: tx.now } })
    .returning({ id: users.id });
  if (!row) throw new Error('user upsert returned no row');
  return row.id;
}

/** Sets a person's role in a tenant (seed only; the app grants roles through the admin flow later). */
export async function upsertRoleAssignment(
  tx: Tx,
  tenantId: string,
  data: { userId: string; role: Role; title: string | null },
): Promise<void> {
  await tx.db
    .insert(roleAssignments)
    .values({ tenantId, ...data, grantedBy: null, createdAt: tx.now })
    .onConflictDoUpdate({
      target: [roleAssignments.tenantId, roleAssignments.userId],
      set: { role: data.role, title: data.title },
    });
}

/** Display names for a set of user ids (history lists). */
export async function namesOf(tx: Tx, userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx.db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, userIds));
  return new Map(rows.map((r) => [r.id, r.name]));
}

// ── Staff (supervisor's Staff page) ──────────────────────────────────────────────────────────────

export async function listStaffMembers(tx: Tx, tenantId: string): Promise<Member[]> {
  const rows = await tx.db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      phoneNumber: users.phoneNumber,
      role: roleAssignments.role,
      title: roleAssignments.title,
    })
    .from(roleAssignments)
    .innerJoin(users, eq(users.id, roleAssignments.userId))
    .where(
      and(
        eq(roleAssignments.tenantId, tenantId),
        inArray(roleAssignments.role, ['desk_officer', 'supervisor']),
      ),
    )
    .orderBy(users.name);
  return rows.map((r) => ({ ...r, role: r.role && isRole(r.role) ? r.role : null }));
}

export type StaffInviteRow = typeof staffInvites.$inferSelect;

export function listStaffInvites(tx: Tx, tenantId: string): Promise<StaffInviteRow[]> {
  return tx.db
    .select()
    .from(staffInvites)
    .where(eq(staffInvites.tenantId, tenantId))
    .orderBy(staffInvites.name);
}

export async function findStaffInvite(
  tx: Tx,
  tenantId: string,
  email: string,
): Promise<StaffInviteRow | null> {
  const [row] = await tx.db
    .select()
    .from(staffInvites)
    .where(and(eq(staffInvites.tenantId, tenantId), eq(staffInvites.email, email)))
    .limit(1);
  return row ?? null;
}

export async function upsertStaffInvite(
  tx: Tx,
  tenantId: string,
  invite: { email: string; name: string; role: Role; grantedBy: string | null },
): Promise<void> {
  await tx.db
    .insert(staffInvites)
    .values({ tenantId, ...invite, createdAt: tx.now })
    .onConflictDoUpdate({
      target: [staffInvites.tenantId, staffInvites.email],
      set: { name: invite.name, role: invite.role, grantedBy: invite.grantedBy },
    });
}

export async function deleteStaffInvite(tx: Tx, tenantId: string, email: string): Promise<boolean> {
  const rows = await tx.db
    .delete(staffInvites)
    .where(and(eq(staffInvites.tenantId, tenantId), eq(staffInvites.email, email)))
    .returning({ email: staffInvites.email });
  return rows.length > 0;
}

/** Sets someone's role in a tenant (staff changes), recording who granted it. */
export async function setRoleAssignment(
  tx: Tx,
  tenantId: string,
  data: { userId: string; role: Role; title: string | null; grantedBy: string | null },
): Promise<void> {
  await tx.db
    .insert(roleAssignments)
    .values({ tenantId, ...data, createdAt: tx.now })
    .onConflictDoUpdate({
      target: [roleAssignments.tenantId, roleAssignments.userId],
      set: { role: data.role, title: data.title, grantedBy: data.grantedBy },
    });
}

// ── Account flags (CC-03, CC-14, CC-15) ──────────────────────────────────────────────────────────

export async function insertAccountFlag(
  tx: Tx,
  tenantId: string,
  flag: { id: string; userId: string; kind: string; reason: string },
): Promise<void> {
  await tx.db.insert(accountFlags).values({ tenantId, ...flag, createdAt: tx.now });
}

export function listAccountFlags(tx: Tx, tenantId: string) {
  return tx.db.select().from(accountFlags).where(eq(accountFlags.tenantId, tenantId)).limit(1000);
}

export function listFlagClears(tx: Tx, tenantId: string) {
  return tx.db.select().from(flagClears).where(eq(flagClears.tenantId, tenantId)).limit(5000);
}

export async function findFlagClear(tx: Tx, tenantId: string, userId: string, kind: string) {
  const [row] = await tx.db
    .select()
    .from(flagClears)
    .where(
      and(
        eq(flagClears.tenantId, tenantId),
        eq(flagClears.userId, userId),
        eq(flagClears.kind, kind),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertFlagClear(
  tx: Tx,
  tenantId: string,
  data: { userId: string; kind: string; clearedBy: string | null },
): Promise<void> {
  await tx.db
    .insert(flagClears)
    .values({ tenantId, ...data, clearedAt: tx.now })
    .onConflictDoUpdate({
      target: [flagClears.tenantId, flagClears.userId, flagClears.kind],
      set: { clearedAt: tx.now, clearedBy: data.clearedBy },
    });
}
