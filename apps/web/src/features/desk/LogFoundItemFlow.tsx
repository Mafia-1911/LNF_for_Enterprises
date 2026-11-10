// "Log a found item" (WF-03, Figma 39:16020, 39:16781, 39:17272, 39:17629): four steps, one main
// question each, defaults pre-filled (now, this desk's building, the officer). Opening a student's
// post by FND ID or QR switches to "receive" (WF-02 step 4) with the post's details filled in.
import type { Catalog, DeskFoundItem, Me } from '@lf/contracts';
import { idFromScan } from '@lf/contracts';
import { categoryByCode, privateTicksFor, type CategoryCode } from '@lf/domain';
import {
  Button,
  Card,
  CategoryIcon,
  CategoryPicker,
  ChoiceCards,
  ColourPicker,
  Notice,
  SelectField,
  Stepper,
  TextField,
  TickTile,
} from '@lf/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, MapPin, Printer, QrCode, ShieldAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { ApiError } from '../../api/client';
import {
  photoUrl,
  useBinSuggestion,
  useCatalog,
  useDeskItem,
  useLogFoundItem,
  useReceiveFoundItem,
} from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { PhotoPicker } from '../../components/PhotoPicker';
import { dhakaDateTime, localInputValue, now } from '../../lib/clock';
import {
  EMPTY_LOG_FORM,
  isRestricted,
  isSensitive,
  LOG_STEP_FIELDS,
  LOG_STEP_TITLES,
  LogFormSchema,
  logStepOfField,
  toLogPayload,
  type LogForm,
} from './log-form';

const route = getRouteApi('/app/desk/log');
type Form = UseFormReturn<LogForm>;

function fromPost(item: DeskFoundItem): LogForm {
  return {
    ...EMPTY_LOG_FORM,
    category: item.category,
    colour: item.colour ?? '',
    shortName: item.shortName ?? '',
    brand: item.brand ?? '',
    building: item.place.buildingCode ?? '',
    foundAt: localInputValue(new Date(item.foundAt)),
    privateTicks: item.privateDetails.ticks,
  };
}

export function LogFoundItemFlow({ me }: { me: Me }) {
  const { step, receive } = route.useSearch();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const post = useDeskItem(receive ?? '');
  const log = useLogFoundItem();
  const receiveItem = useReceiveFoundItem();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const loadedPost = useRef<string | null>(null);

  const form = useForm<LogForm>({
    resolver: zodResolver(LogFormSchema),
    defaultValues: { ...EMPTY_LOG_FORM, foundAt: localInputValue(now()) },
    mode: 'onTouched',
  });

  // Default "where found" is this desk's building.
  useEffect(() => {
    if (catalog.data?.deskBuildingCode && !form.getValues('building') && !receive)
      form.setValue('building', catalog.data.deskBuildingCode);
  }, [catalog.data, form, receive]);

  // Receive mode: fill the form from the student's post once.
  useEffect(() => {
    if (receive && post.data && loadedPost.current !== post.data.id) {
      loadedPost.current = post.data.id;
      form.reset(fromPost(post.data));
    }
  }, [receive, post.data, form]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const goTo = (next: number) =>
    void navigate({ to: '/desk/log', search: { step: next, ...(receive ? { receive } : {}) } });

  async function next() {
    if (
      step <= 3 &&
      (await form.trigger(LOG_STEP_FIELDS[step as 1 | 2 | 3], { shouldFocus: true }))
    )
      goTo(step + 1);
  }

  async function save() {
    setSubmitError(null);
    const result = toLogPayload(form.getValues());
    if (!result.ok) {
      showFieldErrors(result.fields);
      return;
    }
    try {
      const saved = receive
        ? await receiveItem.mutateAsync({ id: receive, body: result.payload })
        : await log.mutateAsync(result.payload);
      await navigate({
        to: '/desk/items/$id/label',
        params: { id: saved.item.id },
        search: { saved: true },
      });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0)
        showFieldErrors(err.fields);
      else
        setSubmitError(
          err instanceof Error ? err.message : 'Something went wrong on our side; try again.',
        );
    }
  }

  function showFieldErrors(fields: Record<string, string>) {
    const map: Record<string, keyof LogForm> = {
      'place.buildingCode': 'building',
      'place.floorId': 'floorId',
      'place.zoneId': 'zoneId',
    };
    let first = 4;
    for (const [field, message] of Object.entries(fields)) {
      const name = map[field] ?? (field as keyof LogForm);
      if (name in EMPTY_LOG_FORM) form.setError(name, { message });
      first = Math.min(first, logStepOfField(field));
    }
    if (first < 4) goTo(first);
    else setSubmitError(Object.values(fields)[0] ?? 'Some details need fixing; check each step.');
  }

  if (catalog.isPending) return <p className="text-body text-muted">Loading the campus list…</p>;
  if (catalog.isError) return <Notice tone="danger">{catalog.error.message}</Notice>;

  const title = LOG_STEP_TITLES[step - 1] ?? LOG_STEP_TITLES[0];
  const busy = log.isPending || receiveItem.isPending;
  return (
    <div className="mx-auto max-w-[768px]">
      <PageHeader
        title={receive ? 'Receive a student post' : 'Log a found item'}
        back={{ to: '/desk' }}
        aside={
          <Link
            to="/desk"
            className="inline-flex min-h-11 items-center text-body font-semibold text-ink"
          >
            Desk home
          </Link>
        }
      />
      <Stepper className="pt-6" step={step} total={4} title={title} />
      {receive && post.isError ? (
        <Notice tone="danger" className="mt-6">
          {post.error.message}
        </Notice>
      ) : null}
      {receive &&
      post.data &&
      post.data.state !== 'REPORTED_BY_FINDER' &&
      post.data.state !== 'NOT_RECEIVED' ? (
        <Notice tone="warning" className="mt-6">
          {post.data.id} is already at the desk.{' '}
          <Link
            to="/desk/items/$id"
            params={{ id: post.data.id }}
            className="font-semibold underline"
          >
            Open the record
          </Link>{' '}
          instead.
        </Notice>
      ) : null}
      {step === 1 ? <OpenPost receive={receive} /> : null}
      <Card className="mt-6">
        <form noValidate onSubmit={(e) => e.preventDefault()}>
          <h2 ref={headingRef} tabIndex={-1} className="sr-only">
            {title}
          </h2>
          {step === 1 ? <StepWhat form={form} catalog={catalog.data} /> : null}
          {step === 2 ? <StepWhere form={form} catalog={catalog.data} me={me} /> : null}
          {step === 3 ? <StepPrivate form={form} /> : null}
          {step === 4 ? <StepCheck form={form} catalog={catalog.data} /> : null}
          {submitError ? (
            <Notice tone="danger" live="assertive" className="mt-6">
              {submitError}
            </Notice>
          ) : null}
          <div className="flex items-center justify-between pt-8">
            <Button
              variant="ghost"
              icon={ArrowLeft}
              onClick={() => (step === 1 ? void navigate({ to: '/desk' }) : goTo(step - 1))}
            >
              Back
            </Button>
            {step < 4 ? (
              <Button iconEnd={ArrowRight} onClick={() => void next()}>
                Next
              </Button>
            ) : (
              <Button icon={Printer} loading={busy} onClick={() => void save()}>
                Save and print label
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

/** "Student brought a QR code?": a scanner types the label link; people can type the ID. */
function OpenPost({ receive }: { receive: string | undefined }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(receive ?? '');
  const [error, setError] = useState<string | undefined>(undefined);
  function open() {
    const id = idFromScan(value);
    if (!id) {
      setError("That isn't an FND ID; check it, e.g. FND-2611-0042K.");
      return;
    }
    setError(undefined);
    void navigate({ to: '/desk/log', search: { step: 1, receive: id } });
  }
  return (
    <Card className="mt-6 !p-5">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          open();
        }}
      >
        <div className="flex-1">
          <TextField
            label="Student brought a QR code?"
            placeholder="Scan or type FND ID, e.g. FND-2611-0042K"
            value={value}
            error={error}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary" icon={QrCode}>
          Open post
        </Button>
      </form>
    </Card>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  return message ? (
    <p role="alert" className="pt-2 text-body text-danger">
      {message}
    </p>
  ) : null;
}

function StepWhat({ form, catalog }: { form: Form; catalog: Catalog }) {
  return (
    <div className="flex flex-col gap-6">
      <Controller
        control={form.control}
        name="photoIds"
        render={({ field }) => (
          <PhotoPicker
            label="Photo"
            value={field.value}
            onChange={field.onChange}
            addLabel="Take photo"
            capture
          />
        )}
      />
      <div>
        <p className="pb-2 text-body font-semibold text-ink">Category</p>
        <Controller
          control={form.control}
          name="category"
          render={({ field, fieldState }) => (
            <>
              <CategoryPicker
                label="Category"
                options={catalog.categories}
                value={field.value || null}
                onValueChange={(v) => {
                  field.onChange(v);
                  form.setValue('privateTicks', []);
                  form.setValue('binCode', '');
                }}
                invalid={Boolean(fieldState.error)}
              />
              <FieldError message={fieldState.error?.message} />
            </>
          )}
        />
      </div>
    </div>
  );
}

function StepWhere({ form, catalog, me }: { form: Form; catalog: Catalog; me: Me }) {
  const building = useWatch({ control: form.control, name: 'building' });
  const floorId = useWatch({ control: form.control, name: 'floorId' });
  const floors = catalog.buildings.find((b) => b.code === building)?.floors ?? [];
  const zones = floors.find((f) => f.id === floorId)?.zones ?? [];
  const errors = form.formState.errors;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="pb-2 text-body font-semibold text-ink">Where was it found?</p>
        <Controller
          control={form.control}
          name="building"
          render={({ field, fieldState }) => (
            <>
              <ChoiceCards
                label="Where was it found?"
                value={field.value || null}
                onValueChange={(v) => {
                  field.onChange(v);
                  form.setValue('floorId', '');
                  form.setValue('zoneId', '');
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
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Floor"
          optional
          options={[
            { value: '', label: 'Any floor / not sure' },
            ...floors.map((f) => ({ value: f.id, label: f.name })),
          ]}
          hint="Defaults to this desk's building."
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
          {...form.register('zoneId')}
        />
        <TextField
          label="Found at"
          type="datetime-local"
          max={localInputValue(now())}
          error={errors.foundAt?.message}
          {...form.register('foundAt')}
        />
        <TextField
          label="Logged by"
          value={`${me.name} · ${dhakaDateTime(now().toISOString())}`}
          readOnly
        />
        <TextField
          label="Short name"
          optional
          placeholder="Blue laptop"
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
      <div className="flex flex-col gap-4 rounded-lg bg-subtle p-4">
        <TextField
          label="Condition"
          optional
          placeholder="e.g. Screen cracked top-left"
          maxLength={300}
          hint="Note any damage now, so nobody is blamed later."
          error={errors.condition?.message}
          {...form.register('condition')}
        />
        <Controller
          control={form.control}
          name="conditionPhotoIds"
          render={({ field }) => (
            <PhotoPicker
              label="Damage photo"
              value={field.value}
              onChange={field.onChange}
              addLabel="Damage photo"
              hint="Condition photos are for staff only."
              capture
            />
          )}
        />
      </div>
    </div>
  );
}

function StepPrivate({ form }: { form: Form }) {
  const category = useWatch({ control: form.control, name: 'category' });
  const ticks = category ? privateTicksFor(category as CategoryCode) : [];
  const errors = form.formState.errors;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-muted">
        Tick what you can see. These become the owner’s claim questions. Never shown publicly.
      </p>
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
      {isSensitive(category) ? (
        <TextField
          label={category === 'university_id' ? 'University ID number' : 'Card or document number'}
          optional={category !== 'university_id'}
          inputMode="numeric"
          autoComplete="off"
          maxLength={40}
          hint={
            category === 'university_id'
              ? 'Stored encrypted; only the last 4 digits are ever shown. The owner is emailed at once.'
              : 'Stored encrypted; only the last 4 digits are ever shown.'
          }
          error={errors.idNumber?.message}
          {...form.register('idNumber')}
        />
      ) : null}
      <TextField
        label="Short note"
        optional
        maxLength={500}
        hint="e.g. what’s inside, lock screen, initials."
        error={errors.privateNote?.message}
        {...form.register('privateNote')}
      />
    </div>
  );
}

function StepCheck({ form, catalog }: { form: Form; catalog: Catalog }) {
  const v = useWatch({ control: form.control }) as LogForm;
  const restricted = isRestricted(v.category);
  const bins = useBinSuggestion(restricted ? null : v.category || null);
  const suggested = bins.data?.suggested ?? null;
  useEffect(() => {
    if (!restricted && suggested && !form.getValues('binCode')) form.setValue('binCode', suggested);
  }, [suggested, restricted, form]);
  const category = categoryByCode(v.category);
  const building = catalog.buildings.find((b) => b.code === v.building)?.name ?? v.building;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-subtle text-ink">
          {v.photoIds[0] ? (
            <img src={photoUrl(v.photoIds[0])} alt="" className="size-full object-cover" />
          ) : (
            <CategoryIcon code={v.category} size={32} />
          )}
        </span>
        <div>
          <p className="text-heading-s font-bold text-ink">{v.shortName || category?.label}</p>
          <p className="flex items-center gap-1 text-body text-muted">
            <MapPin size={16} aria-hidden="true" /> {building}
          </p>
        </div>
      </div>
      <dl className="divide-y divide-line border-y border-line">
        {[
          ['Category', category?.label ?? v.category],
          ['Found', v.foundAt ? dhakaDateTime(new Date(v.foundAt).toISOString()) : '—'],
          ['Private ticks', `${v.privateTicks.length} ticked`],
        ].map(([k, value]) => (
          <div key={k} className="flex justify-between gap-4 py-3">
            <dt className="text-body text-muted">{k}</dt>
            <dd className="text-body font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {restricted ? (
        <Notice tone="danger" icon={ShieldAlert}>
          Restricted item: don’t shelve it. Hand it to campus security today and log the transfer.
        </Notice>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg bg-primary p-5 text-on-primary">
            <p className="text-body">Put it in bin</p>
            <p className="font-mono text-[40px] leading-[48px] font-bold" data-testid="bin-code">
              {v.binCode || '—'}
            </p>
          </div>
          <SelectField
            label="Bin"
            hint="The suggested bin has the most room on the right shelf; change it if the shelf is full."
            options={(bins.data?.bins ?? []).map((b) => ({
              value: b.code,
              label: `${b.code}${b.code === suggested ? ' (suggested)' : ''} · ${b.itemCount} items`,
            }))}
            error={form.formState.errors.binCode?.message}
            {...form.register('binCode')}
          />
        </div>
      )}
    </div>
  );
}

/** Route entry (code-split). */
export default function LogFoundItemRoute() {
  const { me } = getRouteApi('/app').useRouteContext();
  return <LogFoundItemFlow me={me} />;
}
