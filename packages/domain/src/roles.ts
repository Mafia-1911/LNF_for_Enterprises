// Roles from the SRS. One person can hold one role per tenant.
export const ROLES = ['student', 'visitor', 'desk_officer', 'supervisor', 'it_admin'] as const;
export type Role = (typeof ROLES)[number];

/** Roles that may only sign in with university single sign-on. */
export const STAFF_ROLES: readonly Role[] = ['desk_officer', 'supervisor', 'it_admin'];

/** Roles that handle items and claims at the desk. Supervisors can do every desk action. */
export const DESK_ROLES: readonly Role[] = ['desk_officer', 'supervisor'];

/** People who report and claim their own things. */
export const OWNER_ROLES: readonly Role[] = ['student', 'visitor'];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isStaffRole(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}
