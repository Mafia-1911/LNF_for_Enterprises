// Record identifiers: <TYPE>-<YYMM>-<SEQ><CHECK>, e.g. LST-2611-0219X (ADR-0012).
//
// The check letter is Σ wᵢ·vᵢ mod 23 over the type index and the 8 digits of YYMM+SEQ, with
// distinct weights 1..9. 23 is prime and larger than any single-symbol change (digits differ by at
// most 9, type indexes by at most 3), so any one changed character changes the sum mod 23. Adjacent
// digit swaps are caught too, because neighbouring weights differ by exactly 1. The 23-letter
// alphabet leaves out I, O and U so a check letter can't be misread as 1, 0 or V.

export const RECORD_TYPES = ['FND', 'LST', 'CLM', 'DSP'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const CHECK_ALPHABET = 'ABCDEFGHJKLMNPQRSTVWXYZ';
export const MAX_SEQ = 9999;

export type RecordId = {
  type: RecordType;
  /** Two-digit year, 0–99. */
  year: number;
  /** Month, 1–12. */
  month: number;
  /** Sequence within the type, tenant and month, 1–9999. */
  seq: number;
};

const pad = (n: number, width: number) => String(n).padStart(width, '0');

function digitsOf(id: RecordId): string {
  return `${pad(id.year, 2)}${pad(id.month, 2)}${pad(id.seq, 4)}`;
}

/** The check letter for a type and its 8 digits (YYMMSSSS). */
export function checkLetter(type: RecordType, digits: string): string {
  const values = [RECORD_TYPES.indexOf(type) + 1, ...[...digits].map(Number)];
  const sum = values.reduce((acc, v, i) => acc + v * (i + 1), 0);
  return CHECK_ALPHABET.charAt(sum % 23);
}

function assertValid(id: RecordId): void {
  if (!RECORD_TYPES.includes(id.type))
    throw new RangeError(`Unknown record type: ${String(id.type)}`);
  if (!Number.isInteger(id.year) || id.year < 0 || id.year > 99)
    throw new RangeError('year must be 0–99');
  if (!Number.isInteger(id.month) || id.month < 1 || id.month > 12)
    throw new RangeError('month must be 1–12');
  if (!Number.isInteger(id.seq) || id.seq < 1 || id.seq > MAX_SEQ)
    throw new RangeError(`seq must be 1–${MAX_SEQ}`);
}

/** Formats an ID: { LST, 26, 11, 219 } → "LST-2611-0219X". */
export function formatId(id: RecordId): string {
  assertValid(id);
  const digits = digitsOf(id);
  return `${id.type}-${digits.slice(0, 4)}-${digits.slice(4)}${checkLetter(id.type, digits)}`;
}

/**
 * Reads an ID typed by a person: any letter case, with or without dashes and spaces.
 * Returns null when it is not a valid ID (wrong shape, unknown type, bad month or wrong check letter).
 */
export function parseId(input: string): RecordId | null {
  const compact = input.replace(/[\s-]/g, '').toUpperCase();
  const match = /^([A-Z]{3})(\d{2})(\d{2})(\d{4})([A-Z])$/.exec(compact);
  if (!match) return null;
  const [, typeRaw = '', yy = '', mm = '', seqRaw = '', check = ''] = match;
  if (!(RECORD_TYPES as readonly string[]).includes(typeRaw)) return null;
  const type = typeRaw as RecordType;
  const month = Number(mm);
  const seq = Number(seqRaw);
  if (month < 1 || month > 12 || seq < 1) return null;
  if (checkLetter(type, `${yy}${mm}${seqRaw}`) !== check) return null;
  return { type, year: Number(yy), month, seq };
}

/** Canonical form of a typed ID ("lst26110219x" → "LST-2611-0219X"), or null when invalid. */
export function normaliseId(input: string): string | null {
  const id = parseId(input);
  return id ? formatId(id) : null;
}

/** True when the input looks like an attempt at an ID (used to route search input). */
export function looksLikeId(input: string): boolean {
  return /^[A-Za-z]{3}[\s-]*\d{4}[\s-]*\d{4}[A-Za-z]$/.test(input.trim());
}
