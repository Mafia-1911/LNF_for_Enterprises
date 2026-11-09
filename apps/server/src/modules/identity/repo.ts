// The only file that touches identity tables. Every function takes tenantId first (plan §5.3).
import { isRole, type Role } from '@lf/domain';
import { and, eq } from 'drizzle-orm';
import { users } from '../../platform/auth/schema';
import type { Tx } from '../../platform/db/types';
import { roleAssignments } from './schema';

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
