// GOLDEN SLICE (web) — "I lost something": 4 steps (Figma 39:3802, 39:4459, 39:4998, 39:5493).
// Copy this shape for later flows: one React Hook Form for the whole flow, the step in the URL
// (?step=), per-step validation with trigger(), autosaved draft, the shared Zod contract on submit,
// and server field errors sent back to the step they belong to.
import type { Catalog, Me } from '@lf/contracts';
import { categoryByCode, colourByCode } from '@lf/domain';
import {
  Badge,
  Button,
  CategoryPicker,
  ChoiceCards,
  ColourPicker,
  Notice,
  SelectField,
  Stepper,
  TextAreaField,
  TextField,
  Card,
} from '@lf/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Lock, MapPin, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ApiError } from '../../api/client';
import { useCatalog, useSubmitLostReport } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { PhotoPicker } from '../../components/PhotoPicker';
import { localInputValue, now, timeLabel } from '../../lib/clock';
import { clearDraft, loadDraft, saveDraft } from './draft';
import {
  EMPTY_FORM,
  LostReportFormSchema,
  NOT_SURE,
  STEP_FIELDS,
  STEP_TITLES,
  stepOfField,
  toPayload,
  type LostReportForm,
} from './form';

const route = getRouteApi('/app/lost/new');

export function LostReportFlow({ me }: { me: Me }) {
  const { step, for: ownerEmail } = route.useSearch();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const submit = useSubmitLostReport();
  const draft = useMemo(() => loadDraft(me.id), [me.id]);
  const [savedAt, setSavedAt] = useState<string | null>(draft?.savedAt ?? null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const form = useForm<LostReportForm>({
    resolver: zodResolver(LostReportFormSchema),
    defaultValues: { ...EMPTY_FORM, ...draft?.values },
    mode: 'onTouched',
  });
  const values = useWatch({ control: form.control });

  // Autosave the draft (debounced) whenever something changes.
  useEffect(() => {
    if (!form.formState.isDirty) return;
    const t = setTimeout(() => {
      const at = now();
      if (saveDraft(me.id, { values: { ...EMPTY_FORM, ...values }, savedAt: at.toISOString() }))
        setSavedAt(at.toISOString());
    }, 400);
    return () => clearTimeout(t);
  }, [values, me.id, form.formState.isDirty]);

  // Move focus to the step heading so screen readers announce the new step.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const goTo = (next: number) =>
    void navigate({
      to: '/lost/new',
      search: { step: next, ...(ownerEmail ? { for: ownerEmail } : {}) },
    });

  async function next() {
    if (
      step >= 1 &&
      step <= 3 &&
      (await form.trigger(STEP_FIELDS[step as 1 | 2 | 3], { shouldFocus: true }))
    )
      goTo(step + 1);
  }

  async function onSubmit() {
    setSubmitError(null);
    const result = toPayload(form.getValues());
    if (!result.ok) {
      showFieldErrors(result.fields);
      return;
    }
    try {
      const created = await submit.mutateAsync({
        ...result.payload,
        ...(ownerEmail ? { ownerEmail } : {}),
      });
      clearDraft(me.id);
      await navigate({ to: '/lost/$id/submitted', params: { id: created.report.id } });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0)
        showFieldErrors(err.fields);
      else
        setSubmitError(
          err instanceof Error
            ? err.message
            : 'Something went wrong on our side; try again in a moment.',
        );
    }
  }

  function showFieldErrors(fields: Record<string, string>) {
    const map: Record<string, keyof LostReportForm> = {
      'place.buildingCode': 'building',
      'place.floorId': 'floorId',
      'place.zoneId': 'zoneId',
    };
    let firstStep = 4;
    for (const [field, message] of Object.entries(fields)) {
      const name = map[field] ?? (field as keyof LostReportForm);
      if (name in EMPTY_FORM) form.setError(name, { message });
      firstStep = Math.min(firstStep, stepOfField(field));
    }
    if (firstStep < 4) goTo(firstStep);
    else setSubmitError('Some details need fixing; go back and check each step.');
  }

  if (catalog.isPending) return <p className="text-body text-muted">Loading the campus list…</p>;
  if (catalog.isError) return <Notice tone="danger">{catalog.error.message}</Notice>;

  const title = STEP_TITLES[step - 1] ?? STEP_TITLES[0];
  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader
        eyebrow="Report a lost item"
        title="I lost something"
        back={{ to: '/home' }}
        aside={
          savedAt ? <Badge icon={Save}>Draft saved {timeLabel(new Date(savedAt))}</Badge> : null
        }
      />
      {ownerEmail ? (
        <Notice tone="info" className="mt-4" title="Filing for a walk-in student">
          This report will belong to {ownerEmail}. They get the match alerts and can track it.
        </Notice>
      ) : null}
      <Stepper className="pt-6" step={step} total={4} title={title} />
      <Card className="mt-6">
        <form noValidate onSubmit={(e) => e.preventDefault()}>
          {step === 1 ? (
            <StepWhat form={form} catalog={catalog.data} headingRef={headingRef} />
          ) : null}
          {step === 2 ? (
            <StepDescribe form={form} catalog={catalog.data} headingRef={headingRef} />
          ) : null}
          {step === 3 ? (
            <StepWhere form={form} catalog={catalog.data} headingRef={headingRef} />
          ) : null}
          {step === 4 ? (
            <StepCheck form={form} catalog={catalog.data} headingRef={headingRef} />
          ) : null}
          {submitError ? (
            <Notice tone="danger" live="assertive" className="mt-6">
              {submitError}
            </Notice>
          ) : null}
          <div className="flex items-center justify-between pt-8">
            <Button
              variant="ghost"
              icon={ArrowLeft}
              onClick={() => (step === 1 ? void navigate({ to: '/home' }) : goTo(step - 1))}
            >
              Back
            </Button>
            {step < 4 ? (
              <Button iconEnd={ArrowRight} onClick={() => void next()}>
                Continue
              </Button>
            ) : (
              <Button loading={submit.isPending} onClick={() => void onSubmit()}>
                Submit report
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

type StepProps = {
  form: ReturnType<typeof useForm<LostReportForm>>;
  catalog: Catalog;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
};

function StepHeading({
  headingRef,
  children,
  sub,
}: {
  headingRef: StepProps['headingRef'];
  children: string;
  sub?: string;
}) {
  return (
    <div className="pb-6">
      <h2 ref={headingRef} tabIndex={-1} className="text-heading-l font-bold text-ink outline-none">
        {children}
      </h2>
      {sub ? <p className="pt-1 text-body text-muted">{sub}</p> : null}
    </div>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} role="alert" className="pt-2 text-body text-danger">
      {message}
    </p>
  ) : null;
}

function StepWhat({ form, catalog, headingRef }: StepProps) {
  return (
    <>
      <StepHeading headingRef={headingRef}>What did you lose?</StepHeading>
      <Controller
        control={form.control}
        name="category"
        render={({ field, fieldState }) => (
          <>
            <CategoryPicker
              label="What did you lose?"
              options={catalog.categories}
              value={field.value}
              onValueChange={field.onChange}
              invalid={Boolean(fieldState.error)}
            />
            <FieldError id="category-error" message={fieldState.error?.message} />
          </>
        )}
      />
    </>
  );
}

function StepDescribe({ form, catalog, headingRef }: StepProps) {
  const category = categoryByCode(form.getValues('category'));
  const errors = form.formState.errors;
  return (
    <>
      <StepHeading
        headingRef={headingRef}
      >{`Describe your ${(category?.label ?? 'item').toLowerCase()}`}</StepHeading>
      <div className="flex flex-col gap-6">
        <div>
          <p id="colour-label" className="pb-2 text-body font-semibold text-ink">
            Main colour
          </p>
          <Controller
            control={form.control}
            name="colour"
            render={({ field, fieldState }) => (
              <>
                <ColourPicker
                  label="Main colour"
                  options={catalog.colours}
                  value={field.value}
                  onValueChange={field.onChange}
                />
                <FieldError id="colour-error" message={fieldState.error?.message} />
              </>
            )}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Short name"
            optional
            hint="e.g. “Black Herschel backpack”"
            maxLength={60}
            error={errors.shortName?.message}
            {...form.register('shortName')}
          />
          <TextField
            label="Brand"
            optional
            maxLength={40}
            error={errors.brand?.message}
            {...form.register('brand')}
          />
        </div>
        <TextAreaField
          label="Public description"
          optional
          rows={2}
          maxLength={500}
          hint="Visible to staff and used for matching. Don’t include secret details here."
          error={errors.publicDescription?.message}
          {...form.register('publicDescription')}
        />
        <Controller
          control={form.control}
          name="photoIds"
          render={({ field }) => (
            <PhotoPicker label="Photos" value={field.value} onChange={field.onChange} />
          )}
        />
        <div className="rounded-md border border-line bg-subtle/60 p-3.5">
          <TextAreaField
            label="Private details"
            icon={Lock}
            optional
            rows={2}
            maxLength={500}
            hint="Hidden from everyone except desk staff. Used to check that you are the owner — e.g. what’s inside, lock screen, marks, exact amount. Not saved in the draft."
            error={errors.privateNote?.message}
            {...form.register('privateNote')}
          />
        </div>
      </div>
    </>
  );
}

function StepWhere({ form, catalog, headingRef }: StepProps) {
  const building = useWatch({ control: form.control, name: 'building' });
  const floorId = useWatch({ control: form.control, name: 'floorId' });
  const floors = catalog.buildings.find((b) => b.code === building)?.floors ?? [];
  const zones = floors.find((f) => f.id === floorId)?.zones ?? [];
  const errors = form.formState.errors;
  const max = localInputValue(now());
  return (
    <>
      <StepHeading headingRef={headingRef}>Where and when did you last have it?</StepHeading>
      <div className="flex flex-col gap-6">
        <div>
          <p className="pb-2 text-body font-semibold text-ink">Building</p>
          <Controller
            control={form.control}
            name="building"
            render={({ field, fieldState }) => (
              <>
                <ChoiceCards
                  label="Building"
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    form.setValue('floorId', '', { shouldDirty: true });
                    form.setValue('zoneId', '', { shouldDirty: true });
                  }}
                  options={[
                    ...catalog.buildings.map((b) => ({
                      value: b.code,
                      code: b.code,
                      label: b.name,
                    })),
                    { value: NOT_SURE, code: '?', label: 'Not sure', dashed: true },
                  ]}
                />
                <FieldError id="building-error" message={fieldState.error?.message} />
              </>
            )}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Floor"
            optional
            disabled={!building || building === NOT_SURE}
            options={[
              { value: '', label: 'Any floor / not sure' },
              ...floors.map((f) => ({ value: f.id, label: f.name })),
            ]}
            error={errors.floorId?.message}
            {...form.register('floorId', { onChange: () => form.setValue('zoneId', '') })}
          />
          <SelectField
            label="Room or zone"
            optional
            disabled={!floorId}
            options={[
              { value: '', label: 'Any zone / not sure' },
              ...zones.map((z) => ({ value: z.id, label: z.name })),
            ]}
            error={errors.zoneId?.message}
            {...form.register('zoneId')}
          />
        </div>
        <fieldset>
          <legend className="text-body font-semibold text-ink">Time range</legend>
          <p className="pt-1 pb-3 text-body text-muted">
            When did you last see it, and when did you notice it was gone?
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="From"
              type="datetime-local"
              max={max}
              error={errors.timeFrom?.message}
              {...form.register('timeFrom')}
            />
            <TextField
              label="To"
              type="datetime-local"
              max={max}
              error={errors.timeTo?.message}
              {...form.register('timeTo')}
            />
          </div>
        </fieldset>
      </div>
    </>
  );
}

function StepCheck({ form, catalog, headingRef }: StepProps) {
  const v = form.getValues();
  const category = categoryByCode(v.category)?.label ?? 'Item';
  const colour = v.colour ? colourByCode(v.colour)?.label : null;
  const place =
    v.building === NOT_SURE
      ? 'Place not sure'
      : (catalog.buildings.find((b) => b.code === v.building)?.code ?? v.building);
  return (
    <>
      <StepHeading
        headingRef={headingRef}
        sub="Nothing similar is in custody yet. Submit and we’ll watch for it."
      >
        Ready to submit
      </StepHeading>
      <div className="rounded-lg bg-subtle p-4">
        <p className="text-body font-semibold text-ink">{v.shortName || category}</p>
        <p className="flex flex-wrap items-center gap-1 text-body text-muted">
          {[category, colour].filter(Boolean).join(' · ')} ·
          <MapPin size={16} aria-hidden="true" />
          {place}
        </p>
        {v.privateNote ? (
          <p className="pt-2 text-body text-muted">
            Private details added (only desk staff will see them).
          </p>
        ) : null}
      </div>
    </>
  );
}

/** Route entry (code-split): reads the signed-in person from the app layout route. */
export default function LostReportRoute() {
  const { me } = getRouteApi('/app').useRouteContext();
  return <LostReportFlow me={me} />;
}
