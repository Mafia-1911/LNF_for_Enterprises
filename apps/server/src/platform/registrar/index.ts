// University directory lookups for the ID card fast lane (NF-02): who owns a university ID number.
// The real source is the registrar (RDS, plan §10), connected in a later phase. Locally a small
// fictional directory of the seeded students stands in; production refuses it (config).

export type DirectoryEntry = { idNumber: string; email: string; name: string };

/** Lookups are per university: a directory only answers for its own email domain. */
export type RegistrarScope = { tenantId: string; emailDomain: string };

export type Registrar = {
  /** The student or staff member holding this ID number, or null when unknown. */
  lookup(scope: RegistrarScope, idNumber: string): Promise<{ email: string; name: string } | null>;
};

const compact = (value: string) => value.replace(/[\s-]/g, '');

export function createDevRegistrar(entries: readonly DirectoryEntry[]): Registrar {
  const byNumber = new Map(entries.map((e) => [compact(e.idNumber), e]));
  return {
    lookup(scope, idNumber) {
      const entry = byNumber.get(compact(idNumber));
      const sameUniversity = entry?.email
        .toLowerCase()
        .endsWith(`@${scope.emailDomain.toLowerCase()}`);
      return Promise.resolve(
        entry && sameUniversity ? { email: entry.email, name: entry.name } : null,
      );
    },
  };
}

/** No directory connected: every lookup misses, so the desk keeps the card and nobody is emailed. */
export const noRegistrar: Registrar = { lookup: () => Promise.resolve(null) };
