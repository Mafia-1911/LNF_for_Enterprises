// Form model for "Log a found item" (WF-03, Figma 39:16020–39:17629). The same form receives a
// student's post (WF-02 step 4) when the officer opens it by FND ID.
import { categoryByCode } from '@lf/domain';
import { LogFoundItemSchema, type LogFoundItem } from '@lf/contracts';
import { z } from 'zod';

export const LogFormSchema = z.object({
  category: z.string().min(1, 'Pick what it is.'),
  colour: z.string(),
  shortName: z.string().trim().max(60, 'Keep the short name to 60 characters.'),
  brand: z.string().trim().max(40, 'Keep the brand to 40 characters.'),
  building: z.string().min(1, 'Pick where it was found.'),
  floorId: z.string(),
  zoneId: z.string(),
  foundAt: z.string().min(1, 'Enter when it was found.'),
  condition: z.string().trim().max(300, 'Keep the condition note to 300 characters.'),
  photoIds: z.array(z.string()).max(5),
  conditionPhotoIds: z.array(z.string()).max(5),
  privateTicks: z.array(z.string()),
  privateNote: z.string().trim().max(500, 'Keep the private note to 500 characters.'),
  idNumber: z.string().trim().max(40, 'Keep the number to 40 characters.'),
  binCode: z.string(),
});
export type LogForm = z.infer<typeof LogFormSchema>;

export const EMPTY_LOG_FORM: LogForm = {
  category: '',
  colour: '',
  shortName: '',
  brand: '',
  building: '',
  floorId: '',
  zoneId: '',
  foundAt: '',
  condition: '',
  photoIds: [],
  conditionPhotoIds: [],
  privateTicks: [],
  privateNote: '',
  idNumber: '',
  binCode: '',
};

export const LOG_STEP_FIELDS: Record<1 | 2 | 3, (keyof LogForm)[]> = {
  1: ['category', 'photoIds'],
  2: ['colour', 'shortName', 'brand', 'building', 'floorId', 'zoneId', 'foundAt', 'condition'],
  3: ['privateTicks', 'privateNote', 'idNumber'],
};

export const LOG_STEP_TITLES = [
  'What is it?',
  'Where, when, condition',
  'Private details',
  'Check and save',
] as const;

export function logStepOfField(field: string): 1 | 2 | 3 | 4 {
  if (field === 'category' || field === 'photoIds') return 1;
  if (
    field.startsWith('place') ||
    ['foundAt', 'condition', 'colour', 'shortName', 'brand', 'conditionPhotoIds'].includes(field)
  )
    return 2;
  if (field.startsWith('private') || field === 'idNumber') return 3;
  return 4;
}

export const isRestricted = (category: string) => categoryByCode(category)?.restricted ?? false;
export const isSensitive = (category: string) => categoryByCode(category)?.sensitive ?? false;

export function toLogPayload(
  form: LogForm,
): { ok: true; payload: LogFoundItem } | { ok: false; fields: Record<string, string> } {
  const candidate = {
    category: form.category,
    colour: form.colour || null,
    shortName: form.shortName,
    brand: form.brand,
    model: null,
    publicDescription: null,
    place: {
      buildingCode: form.building,
      floorId: form.floorId || null,
      zoneId: form.zoneId || null,
    },
    foundAt: form.foundAt ? new Date(form.foundAt).toISOString() : '',
    privateTicks: form.privateTicks,
    privateNote: form.privateNote,
    photoIds: form.photoIds,
    condition: form.condition,
    conditionPhotoIds: form.conditionPhotoIds,
    binCode: isRestricted(form.category) ? null : form.binCode || null,
    idNumber: isSensitive(form.category) ? form.idNumber : '',
  };
  const parsed = LogFoundItemSchema.safeParse(candidate);
  if (!parsed.success)
    return {
      ok: false,
      fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
    };
  return { ok: true, payload: candidate as LogFoundItem };
}
