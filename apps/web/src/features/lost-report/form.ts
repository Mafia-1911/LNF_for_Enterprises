// GOLDEN SLICE (web) — form model for "I lost something". The form keeps strings (what inputs
// hold); toPayload() turns them into the shared contract, which the server validates again.
import { CreateLostReportSchema, type CreateLostReport } from '@lf/contracts';
import { z } from 'zod';

export const NOT_SURE = 'unsure';

export const LostReportFormSchema = z
  .object({
    category: z.string().min(1, 'Pick what you lost.'),
    colour: z.string().min(1, 'Pick the main colour, or Multi if it has several.'),
    shortName: z.string().trim().max(60, 'Keep the short name to 60 characters.'),
    brand: z.string().trim().max(40, 'Keep the brand to 40 characters.'),
    publicDescription: z.string().trim().max(500, 'Keep the description to 500 characters.'),
    privateNote: z.string().trim().max(500, 'Keep private details to 500 characters.'),
    building: z.string().min(1, 'Pick a building, or "Not sure".'),
    floorId: z.string(),
    zoneId: z.string(),
    timeFrom: z.string().min(1, 'Enter when you last had it.'),
    timeTo: z.string().min(1, 'Enter when you noticed it was gone.'),
    photoIds: z.array(z.string()).max(5, 'Add up to 5 photos.'),
  })
  .refine(
    (v) =>
      !v.timeFrom || !v.timeTo || new Date(v.timeTo).getTime() >= new Date(v.timeFrom).getTime(),
    {
      message: 'The "To" time must be after the "From" time.',
      path: ['timeTo'],
    },
  );

export type LostReportForm = z.infer<typeof LostReportFormSchema>;

export const EMPTY_FORM: LostReportForm = {
  category: '',
  colour: '',
  shortName: '',
  brand: '',
  publicDescription: '',
  privateNote: '',
  building: '',
  floorId: '',
  zoneId: '',
  timeFrom: '',
  timeTo: '',
  photoIds: [],
};

/** Fields checked before leaving each step. */
export const STEP_FIELDS: Record<1 | 2 | 3, (keyof LostReportForm)[]> = {
  1: ['category'],
  2: ['colour', 'shortName', 'brand', 'publicDescription', 'privateNote', 'photoIds'],
  3: ['building', 'floorId', 'zoneId', 'timeFrom', 'timeTo'],
};

export const STEP_TITLES = [
  'What is it?',
  'Describe it',
  'Where and when',
  'Check and submit',
] as const;

/** Which step a server field error belongs to. */
export function stepOfField(field: string): 1 | 2 | 3 {
  if (field === 'category') return 1;
  if (field.startsWith('place') || field.startsWith('time')) return 3;
  return 2;
}

/** datetime-local value ("2026-11-08T16:39", the browser's local time) → ISO 8601 UTC. */
export function localToIso(value: string): string {
  return new Date(value).toISOString();
}

export function toPayload(
  form: LostReportForm,
): { ok: true; payload: CreateLostReport } | { ok: false; fields: Record<string, string> } {
  const unsure = form.building === NOT_SURE;
  const candidate = {
    category: form.category,
    colour: form.colour || null,
    shortName: form.shortName,
    brand: form.brand,
    publicDescription: form.publicDescription,
    privateNote: form.privateNote,
    place: {
      buildingCode: unsure ? null : form.building,
      floorId: unsure || !form.floorId ? null : form.floorId,
      zoneId: unsure || !form.zoneId ? null : form.zoneId,
    },
    timeFrom: localToIso(form.timeFrom),
    timeTo: localToIso(form.timeTo),
    photoIds: form.photoIds,
  };
  const parsed = CreateLostReportSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
    };
  }
  return { ok: true, payload: candidate as CreateLostReport };
}
