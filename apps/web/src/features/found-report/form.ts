// Form model for "I found something" (WF-02, Figma 39:8079). Strings in the form; toPayload() turns
// them into the shared contract, which the server validates again.
import { CreateFoundPostSchema, type CreateFoundPost } from '@lf/contracts';
import { z } from 'zod';

export const FoundReportFormSchema = z.object({
  category: z.string().min(1, 'Pick what you found.'),
  colour: z.string(),
  shortName: z.string().trim().max(60, 'Keep the short name to 60 characters.'),
  brand: z.string().trim().max(40, 'Keep the brand to 40 characters.'),
  model: z.string().trim().max(60, 'Keep the model to 60 characters.'),
  publicDescription: z.string().trim().max(500, 'Keep the description to 500 characters.'),
  building: z.string().min(1, 'Pick the building where you found it.'),
  floorId: z.string(),
  zoneId: z.string(),
  foundAt: z.string().min(1, 'Enter when you found it.'),
  privateTicks: z.array(z.string()),
  privateNote: z.string().trim().max(500, 'Keep the private note to 500 characters.'),
  photoIds: z.array(z.string()).max(5, 'Add up to 5 photos.'),
  pingReportIds: z.array(z.string()).max(5),
});

export type FoundReportForm = z.infer<typeof FoundReportFormSchema>;

export const EMPTY_FOUND_FORM: FoundReportForm = {
  category: '',
  colour: '',
  shortName: '',
  brand: '',
  model: '',
  publicDescription: '',
  building: '',
  floorId: '',
  zoneId: '',
  foundAt: '',
  privateTicks: [],
  privateNote: '',
  photoIds: [],
  pingReportIds: [],
};

/** Section of the page a server field error belongs to (1 What, 2 Describe, 3 Where, 4 Private). */
export function sectionOfField(field: string): 1 | 2 | 3 | 4 {
  if (field === 'category') return 1;
  if (field.startsWith('place') || field === 'foundAt') return 3;
  if (field.startsWith('private')) return 4;
  return 2;
}

export function toFoundPayload(
  form: FoundReportForm,
): { ok: true; payload: CreateFoundPost } | { ok: false; fields: Record<string, string> } {
  const candidate = {
    category: form.category,
    colour: form.colour || null,
    shortName: form.shortName,
    brand: form.brand,
    model: form.model,
    publicDescription: form.publicDescription,
    place: {
      buildingCode: form.building,
      floorId: form.floorId || null,
      zoneId: form.zoneId || null,
    },
    foundAt: form.foundAt ? new Date(form.foundAt).toISOString() : '',
    privateTicks: form.privateTicks,
    privateNote: form.privateNote,
    photoIds: form.photoIds,
    pingReportIds: form.pingReportIds,
  };
  const parsed = CreateFoundPostSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
    };
  }
  return { ok: true, payload: candidate as CreateFoundPost };
}
