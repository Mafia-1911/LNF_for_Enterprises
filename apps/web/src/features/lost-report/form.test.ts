import { describe, expect, it } from 'vitest';
import { clearDraft, loadDraft, saveDraft } from './draft';
import {
  EMPTY_FORM,
  LostReportFormSchema,
  NOT_SURE,
  stepOfField,
  toPayload,
  type LostReportForm,
} from './form';

const filled: LostReportForm = {
  ...EMPTY_FORM,
  category: 'glasses',
  colour: 'grey',
  shortName: 'Calvin',
  privateNote: 'Scratch on the left lens',
  building: 'NAC',
  floorId: '11111111-1111-4111-8111-111111111111',
  timeFrom: '2026-11-08T14:00',
  timeTo: '2026-11-08T16:00',
};

describe('lost report form', () => {
  it('turns form strings into the shared contract', () => {
    const result = toPayload(filled);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.place).toEqual({
      buildingCode: 'NAC',
      floorId: filled.floorId,
      zoneId: null,
    });
    expect(result.payload.timeFrom).toMatch(/Z$/);
    expect(result.payload.privateNote).toBe('Scratch on the left lens');
  });

  it('sends "Not sure" as no place at all', () => {
    const result = toPayload({ ...filled, building: NOT_SURE, floorId: filled.floorId });
    expect(result.ok && result.payload.place).toEqual({
      buildingCode: null,
      floorId: null,
      zoneId: null,
    });
  });

  it('asks for a category, a colour, a building and both times', () => {
    const issues = LostReportFormSchema.safeParse(EMPTY_FORM).error?.issues.map((i) =>
      i.path.join('.'),
    );
    expect(issues).toEqual(
      expect.arrayContaining(['category', 'colour', 'building', 'timeFrom', 'timeTo']),
    );
  });

  it('rejects a "To" time before the "From" time', () => {
    const issues = LostReportFormSchema.safeParse({
      ...filled,
      timeFrom: '2026-11-08T16:00',
      timeTo: '2026-11-08T14:00',
    }).error?.issues;
    expect(issues?.[0]).toMatchObject({
      path: ['timeTo'],
      message: 'The "To" time must be after the "From" time.',
    });
  });

  it('sends server field errors back to the right step', () => {
    expect(stepOfField('category')).toBe(1);
    expect(stepOfField('colour')).toBe(2);
    expect(stepOfField('place.buildingCode')).toBe(3);
    expect(stepOfField('timeTo')).toBe(3);
  });
});

describe('drafts', () => {
  it('saves the form for this person but never the private details', () => {
    saveDraft('user-1', { values: filled, savedAt: '2026-11-08T10:39:00.000Z' });
    const draft = loadDraft('user-1');
    expect(draft?.values.shortName).toBe('Calvin');
    expect(draft?.values.privateNote).toBe('');
    expect(JSON.stringify(window.localStorage)).not.toContain('Scratch on the left lens');
    expect(loadDraft('user-2')).toBeNull();
    clearDraft('user-1');
    expect(loadDraft('user-1')).toBeNull();
  });
});
