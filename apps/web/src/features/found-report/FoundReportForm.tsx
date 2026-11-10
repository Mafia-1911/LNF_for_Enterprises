// "I found something" (WF-02, US-02, Figma 39:8079): one page in four numbered sections, with the
// live "Someone lost this?" panel beside it. Same patterns as the lost-report flow: React Hook Form
// with the shared contract, an autosaved draft (no private note), server field errors on their field.
import type { Catalog, Me, SimilarLostQuery } from '@lf/contracts';
import { privateTicksFor, type CategoryCode } from '@lf/domain';
import {
  Badge,
  Button,
  Card,
  CategoryPicker,
  ChoiceCards,
  ColourPicker,
  Notice,
  SelectField,
  TextAreaField,
  TextField,
  TickTile,
} from '@lf/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Lock, MapPin, Save, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { ApiError } from '../../api/client';
import { useCatalog, usePostFoundItem, useSimilarLost } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { PhotoPicker } from '../../components/PhotoPicker';
import { dhakaDateTime, localInputValue, now, timeLabel } from '../../lib/clock';
import { clearFoundDraft, loadFoundDraft, saveFoundDraft } from './draft';
import {
  EMPTY_FOUND_FORM,
  FoundReportFormSchema,
  toFoundPayload,
  type FoundReportForm,
} from './form';

type Form = UseFormReturn<FoundReportForm>;

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`found-section-${n}`} className="flex flex-col gap-4 pt-8 first:pt-0">
      <h2 id={`found-section-${n}`} className="text-heading-s font-bold text-ink">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  return message ? (
    <p role="alert" className="text-body text-danger">
      {message}
    </p>
  ) : null;
}

export function FoundReportForm({ me }: { me: Me }) {
  const navigate = useNavigate();
  const catalog = useCatalog();
  const submit = usePostFoundItem();
  const draft = useMemo(() => loadFoundDraft(me.id), [me.id]);
  const [savedAt, setSavedAt] = useState<string | null>(draft?.savedAt ?? null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FoundReportForm>({
    resolver: zodResolver(FoundReportFormSchema),
    defaultValues: {
      ...EMPTY_FOUND_FORM,
      foundAt: localInputValue(now()),
      ...draft?.values,
    },
    mode: 'onTouched',
  });
  const values = useWatch({ control: form.control });

  useEffect(() => {
    if (!form.formState.isDirty) return;
    const t = setTimeout(() => {
      const at = now();
      if (
        saveFoundDraft(me.id, {
          values: { ...EMPTY_FOUND_FORM, ...values },
          savedAt: at.toISOString(),
        })
      )
        setSavedAt(at.toISOString());
    }, 400);
    return () => clearTimeout(t);
  }, [values, me.id, form.formState.isDirty]);

  async function onSubmit() {
    setSubmitError(null);
    if (!(await form.trigger(undefined, { shouldFocus: true }))) return;
    const result = toFoundPayload(form.getValues());
    if (!result.ok) {
      showFieldErrors(result.fields);
      return;
    }
    try {
      const post = await submit.mutateAsync(result.payload);
      clearFoundDraft(me.id);
      await navigate({ to: '/found/$id/posted', params: { id: post.id } });
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
    const map: Record<string, keyof FoundReportForm> = {
      'place.buildingCode': 'building',
      'place.floorId': 'floorId',
      'place.zoneId': 'zoneId',
    };
    let focused = false;
    for (const [field, message] of Object.entries(fields)) {
      const name = map[field] ?? (field as keyof FoundReportForm);
      if (name in EMPTY_FOUND_FORM) {
        form.setError(name, { message }, { shouldFocus: !focused });
        focused = true;
      }
    }
    if (!focused) setSubmitError('Some details need fixing; check the highlighted fields.');
  }

  if (catalog.isPending) return <p className="text-body text-muted">Loading the campus list…</p>;
  if (catalog.isError) return <Notice tone="danger">{catalog.error.message}</Notice>;

  return (
    <div className="mx-auto max-w-[1152px]">
      <PageHeader
        eyebrow="Report a found item"
        title="I found something"
        back={{ to: '/home' }}
        aside={
          savedAt ? <Badge icon={Save}>Draft saved {timeLabel(new Date(savedAt))}</Badge> : null
        }
      />
      <p className="pt-2 text-body text-muted">
        Thank you! Post it here, then bring it to the L&amp;F Office within 48 hours.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <Card>
          <form noValidate onSubmit={(e) => e.preventDefault()}>
            <SectionWhat form={form} catalog={catalog.data} />
            <SectionDescribe form={form} catalog={catalog.data} />
            <SectionWhere form={form} catalog={catalog.data} />
            <SectionPrivate form={form} />
            {submitError ? (
              <Notice tone="danger" live="assertive" className="mt-6">
                {submitError}
              </Notice>
            ) : null}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
              <p className="text-body text-muted">
                You’ll get an FND ID and QR code to show at the desk.
              </p>
              <Button loading={submit.isPending} onClick={() => void onSubmit()}>
                Submit and get my QR
              </Button>
            </div>
          </form>
        </Card>
        <SomeoneLostThis form={form} />
      </div>
    </div>
  );
}

function SectionWhat({ form, catalog }: { form: Form; catalog: Catalog }) {
  return (
    <Section n={1} title="What is it?">
      <Controller
        control={form.control}
        name="category"
        render={({ field, fieldState }) => (
          <>
            <CategoryPicker
              label="What is it?"
              options={catalog.categories.filter((c) => !c.restricted)}
              value={field.value}
              onValueChange={(v) => {
                field.onChange(v);
                form.setValue('privateTicks', [], { shouldDirty: true });
                form.setValue('pingReportIds', [], { shouldDirty: true });
              }}
              invalid={Boolean(fieldState.error)}
            />
            <FieldError message={fieldState.error?.message} />
          </>
        )}
      />
    </Section>
  );
}

function SectionDescribe({ form, catalog }: { form: Form; catalog: Catalog }) {
  const errors = form.formState.errors;
  return (
    <Section n={2} title="Describe it">
      <Controller
        control={form.control}
        name="photoIds"
        render={({ field }) => (
          <PhotoPicker label="Photos" value={field.value} onChange={field.onChange} />
        )}
      />
      <div>
        <p className="pb-2 text-body font-semibold text-ink">
          Main colour <span className="font-normal text-muted">(optional)</span>
        </p>
        <Controller
          control={form.control}
          name="colour"
          render={({ field }) => (
            <ColourPicker
              label="Main colour"
              options={catalog.colours}
              value={field.value || null}
              onValueChange={field.onChange}
            />
          )}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Short name"
          optional
          placeholder="e.g. Black steel tumbler"
          maxLength={60}
          error={errors.shortName?.message}
          {...form.register('shortName')}
        />
        <TextField
          label="Brand"
          optional
          placeholder="e.g. Lenovo"
          maxLength={40}
          error={errors.brand?.message}
          {...form.register('brand')}
        />
        <TextField
          label="Model"
          optional
          placeholder="e.g. ThinkPad E14"
          maxLength={60}
          error={errors.model?.message}
          {...form.register('model')}
        />
      </div>
      <TextAreaField
        label="Public description"
        optional
        rows={2}
        maxLength={500}
        hint="Keep it general. Put identifying details in the private section below."
        error={errors.publicDescription?.message}
        {...form.register('publicDescription')}
      />
    </Section>
  );
}

function SectionWhere({ form, catalog }: { form: Form; catalog: Catalog }) {
  const building = useWatch({ control: form.control, name: 'building' });
  const floorId = useWatch({ control: form.control, name: 'floorId' });
  const floors = catalog.buildings.find((b) => b.code === building)?.floors ?? [];
  const zones = floors.find((f) => f.id === floorId)?.zones ?? [];
  const errors = form.formState.errors;
  return (
    <Section n={3} title="Where and when did you find it?">
      <Controller
        control={form.control}
        name="building"
        render={({ field, fieldState }) => (
          <>
            <ChoiceCards
              label="Building"
              value={field.value || null}
              onValueChange={(v) => {
                field.onChange(v);
                form.setValue('floorId', '', { shouldDirty: true });
                form.setValue('zoneId', '', { shouldDirty: true });
              }}
              options={catalog.buildings.map((b) => ({
                value: b.code,
                code: b.code,
                label: b.name,
              }))}
            />
            <FieldError message={fieldState.error?.message} />
          </>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Floor"
          optional
          disabled={!building}
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
        <TextField
          label="Found at"
          type="datetime-local"
          max={localInputValue(now())}
          error={errors.foundAt?.message}
          {...form.register('foundAt')}
        />
      </div>
    </Section>
  );
}

function SectionPrivate({ form }: { form: Form }) {
  const category = useWatch({ control: form.control, name: 'category' });
  const ticks = category ? privateTicksFor(category as CategoryCode) : [];
  return (
    <div className="mt-8 rounded-lg border border-line bg-subtle/60 p-4">
      <h2 className="flex items-center gap-2 text-heading-s font-bold text-ink">
        <Lock size={20} aria-hidden="true" /> 4. Private details
      </h2>
      <p className="pt-1 pb-4 text-body text-muted">
        Only desk staff see these. They become questions only the real owner could answer.
      </p>
      {ticks.length > 0 ? (
        <Controller
          control={form.control}
          name="privateTicks"
          render={({ field }) => (
            <div className="grid gap-2 sm:grid-cols-2">
              {ticks.map((t) => (
                <TickTile
                  key={t.code}
                  label={t.label}
                  checked={field.value.includes(t.code)}
                  onCheckedChange={(on) =>
                    field.onChange(
                      on ? [...field.value, t.code] : field.value.filter((c) => c !== t.code),
                    )
                  }
                />
              ))}
            </div>
          )}
        />
      ) : (
        <p className="text-body text-muted">Pick what it is first to see the tick boxes.</p>
      )}
      <div className="pt-4">
        <TextField
          label="Short note"
          optional
          placeholder="e.g. Pikachu keychain, 3 books inside"
          maxLength={500}
          hint="Not saved in the draft."
          error={form.formState.errors.privateNote?.message}
          {...form.register('privateNote')}
        />
      </div>
    </div>
  );
}

/** US-02: live list of open lost reports like this item. No names or contacts on either side. */
function SomeoneLostThis({ form }: { form: Form }) {
  const v = useWatch({ control: form.control });
  const [query, setQuery] = useState<SimilarLostQuery | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!v.category) {
        setQuery(null);
        return;
      }
      const words = [v.shortName, v.model, v.publicDescription].filter(Boolean).join(' ');
      setQuery({
        category: v.category as SimilarLostQuery['category'],
        colour: (v.colour || null) as SimilarLostQuery['colour'],
        brand: v.brand || null,
        words: words || null,
        buildingCode: v.building || null,
        floorId: v.floorId || null,
        zoneId: v.zoneId || null,
        foundAt: v.foundAt ? new Date(v.foundAt).toISOString() : null,
      });
    }, 500);
    return () => clearTimeout(t);
  }, [
    v.category,
    v.colour,
    v.brand,
    v.shortName,
    v.model,
    v.publicDescription,
    v.building,
    v.floorId,
    v.zoneId,
    v.foundAt,
  ]);
  const similar = useSimilarLost(query);
  const reports = similar.data?.reports ?? [];
  const pinged = v.pingReportIds ?? [];

  return (
    <aside aria-labelledby="someone-lost-title" className="lg:sticky lg:top-24">
      <Card className="!p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 id="someone-lost-title" className="text-heading-s font-bold text-ink">
            Someone lost this?
          </h2>
          <Badge tone="neutral">
            {reports.length} open {reports.length === 1 ? 'report' : 'reports'}
          </Badge>
        </div>
        <p className="pt-1 text-body text-muted">
          Updates as you fill the form. Names and contacts stay hidden on both sides.
        </p>
        <div aria-live="polite" className="mt-4 flex flex-col gap-3">
          {reports.length === 0 ? (
            <p className="rounded-md bg-subtle p-4 text-body text-muted">
              {query
                ? 'No similar lost reports yet. Add colour and place to improve matching.'
                : 'Pick what it is to see similar lost reports.'}
            </p>
          ) : (
            reports.map((r) => {
              const on = pinged.includes(r.id);
              const place = [r.place.buildingName, r.place.zoneName].filter(Boolean).join(' · ');
              return (
                <div key={r.id} className="rounded-md border border-line p-3">
                  <p className="text-body font-semibold text-ink">{r.title}</p>
                  <p className="flex flex-wrap items-center gap-1 text-body text-muted">
                    {place ? (
                      <>
                        <MapPin size={16} aria-hidden="true" /> {place} ·{' '}
                      </>
                    ) : null}
                    Lost {dhakaDateTime(r.lostOn)}
                  </p>
                  <p className="pt-1 text-body text-muted">{r.reasons.join(', ')}</p>
                  <Button
                    variant={on ? 'soft' : 'secondary'}
                    icon={Users}
                    className="mt-2 w-full"
                    aria-pressed={on}
                    onClick={() =>
                      form.setValue(
                        'pingReportIds',
                        on ? pinged.filter((id) => id !== r.id) : [...pinged, r.id].slice(0, 5),
                        { shouldDirty: true },
                      )
                    }
                  >
                    {on ? 'Owner will be told' : 'This might be theirs'}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </aside>
  );
}

/** Route entry (code-split). */
export default function FoundReportRoute() {
  const { me } = getRouteApi('/app').useRouteContext();
  return <FoundReportForm me={me} />;
}
