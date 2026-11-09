# ADR-0012: Record identifiers and the check letter

Status: accepted · 2026-11-09

## Context

IDs are printed on labels, typed at the desk and searched without dashes in any case. A mistyped character must not resolve to another record.

## Decision

Format `<TYPE>-<YYMM>-<SEQ><CHECK>`, e.g. `LST-2611-0219X`.

- `TYPE` ∈ FND, LST, CLM, DSP. `YYMM` in Asia/Dhaka. `SEQ` is exactly 4 digits from a per-tenant, per-type, per-month counter (`id_counters`, row-locked inside `withTx`).
- `CHECK` = Σ wᵢ·vᵢ mod 23 over the type index and all 8 digits, with distinct weights, mapped to a 23-letter alphabet without I, O and U. Because 23 is prime and greater than any digit difference, every single-character substitution is detected; adjacent digit swaps are detected too.
- The normaliser strips dashes and spaces, upper-cases, then checks length, type, month and check letter.

## Consequences

- 9,999 IDs per type per month per tenant. Overflow raises a `Conflict` with a plain message; widening SEQ later needs a new ADR (the fixed width is what makes the single-change guarantee hold when dashes are optional).
- Figma's sample IDs (e.g. `LST-2611-0219R`) are illustrations and do not carry valid check letters.
