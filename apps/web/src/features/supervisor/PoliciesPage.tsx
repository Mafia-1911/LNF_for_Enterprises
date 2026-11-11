// Policies (Figma 39:26930): proxy pickup, retention periods, pickup window, claim cap, SMS (not yet
// available), and the holiday pause (closures and semester breaks). Supervisors only.
import { PoliciesSchema, type Policies } from '@lf/contracts';
import { Badge, Button, Card, IconButton, Notice, TextField, Toggle, useToast } from '@lf/ui';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import {
  useAddClosure,
  usePolicySettings,
  useRemoveClosure,
  useSavePolicies,
} from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';

type NumberKey = 'retentionDays' | 'lookAlikeRetentionDays' | 'pickupWindowDays' | 'activeClaimCap';
const NUMBERS: { key: NumberKey; label: string; hint: string }[] = [
  {
    key: 'retentionDays',
    label: 'Retention period',
    hint: 'Days an item stays in custody before it moves to Expired.',
  },
  {
    key: 'lookAlikeRetentionDays',
    label: 'Look-alike retention',
    hint: 'Shorter period for umbrellas, bottles, chargers, keys and calculators.',
  },
  {
    key: 'pickupWindowDays',
    label: 'Pickup window',
    hint: 'Working days (Sun–Thu) an approved owner has to collect.',
  },
  {
    key: 'activeClaimCap',
    label: 'Active claim cap',
    hint: 'Maximum active claims per person. Stops people fishing for valuables.',
  },
];

const dateLabel = (d: string) =>
  new Date(`${d}T00:00:00+06:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Dhaka',
  });

function PolicyForm({ policies }: { policies: Policies }) {
  const save = useSavePolicies();
  const toast = useToast();
  const [form, setForm] = useState<Record<NumberKey, string> & { proxy: boolean }>({
    proxy: policies.proxyPickup,
    retentionDays: String(policies.retentionDays),
    lookAlikeRetentionDays: String(policies.lookAlikeRetentionDays),
    pickupWindowDays: String(policies.pickupWindowDays),
    activeClaimCap: String(policies.activeClaimCap),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function savePolicies() {
    const next: Policies = {
      proxyPickup: form.proxy,
      retentionDays: Number(form.retentionDays),
      lookAlikeRetentionDays: Number(form.lookAlikeRetentionDays),
      pickupWindowDays: Number(form.pickupWindowDays),
      activeClaimCap: Number(form.activeClaimCap),
      smsAlerts: policies.smsAlerts,
    };
    const parsed = PoliciesSchema.safeParse(next);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    try {
      await save.mutateAsync(parsed.data);
      toast({ title: 'Policies saved. They apply straight away.' });
    } catch (e) {
      setErrors(e instanceof ApiError ? e.fields : {});
    }
  }

  return (
    <Card className="mt-6 flex flex-col gap-5 !p-5">
      <div>
        <Toggle
          label="Proxy pickup"
          checked={form.proxy}
          onCheckedChange={(proxy) => setForm({ ...form, proxy })}
        />
        <p className="text-body text-muted">
          Owners can nominate someone (by university ID) to collect for them. Turn off if the
          authority does not allow it.
        </p>
      </div>
      {NUMBERS.map((n) => (
        <TextField
          key={n.key}
          label={n.label}
          hint={n.hint}
          inputMode="numeric"
          value={form[n.key]}
          onChange={(e) => setForm({ ...form, [n.key]: e.target.value })}
          error={errors[n.key]}
        />
      ))}
      <div>
        <div className="flex items-center gap-2">
          <Toggle label="SMS alerts" checked={false} onCheckedChange={() => {}} disabled />
          <Badge tone="neutral">Coming later</Badge>
        </div>
        <p className="text-body text-muted">
          Match and pickup alerts go by email and in the app. SMS needs a paid provider, so it is
          off for now.
        </p>
      </div>
      <div>
        <Button loading={save.isPending} onClick={() => void savePolicies()}>
          Save policies
        </Button>
      </div>
    </Card>
  );
}

export function PoliciesPage() {
  const settings = usePolicySettings();
  const add = useAddClosure();
  const remove = useRemoveClosure();
  const toast = useToast();
  const [closure, setClosure] = useState({ name: '', from: '', to: '' });
  const [closureErrors, setClosureErrors] = useState<Record<string, string>>({});

  const policies = settings.data?.policies;

  async function addClosure() {
    setClosureErrors({});
    try {
      await add.mutateAsync(closure);
      setClosure({ name: '', from: '', to: '' });
      toast({ title: 'Closure added. Retention pauses on those days.' });
    } catch (e) {
      setClosureErrors(
        e instanceof ApiError
          ? { ...e.fields, ...(Object.keys(e.fields).length ? {} : { name: e.message }) }
          : {},
      );
    }
  }

  return (
    <div className="max-w-[720px]">
      <PageHeader title="Policies" />
      <p className="mt-2 text-body text-muted">
        Changes apply straight away to new and open records.
      </p>
      {settings.isError ? (
        <Notice tone="danger" className="mt-4">
          {settings.error.message}
        </Notice>
      ) : null}
      {policies ? <PolicyForm policies={policies} /> : null}

      <h2 className="mt-10 flex items-center gap-2 text-heading-m font-bold text-ink">
        <CalendarOff size={24} aria-hidden="true" /> Holiday pause
      </h2>
      <p className="mt-1 text-body text-muted">
        The retention countdown pauses during official closures and semester breaks.
      </p>
      <Card className="mt-4 !p-5">
        {settings.data?.closures.length === 0 ? (
          <p className="text-body text-muted">No closures yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {settings.data?.closures.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-md bg-subtle px-4 py-2"
              >
                <span className="text-body font-semibold text-ink">{c.name}</span>
                <span className="flex items-center gap-2 text-body text-muted">
                  {dateLabel(c.from)} – {dateLabel(c.to)}
                  <IconButton
                    icon={Trash2}
                    label={`Remove ${c.name}`}
                    onClick={() => void remove.mutateAsync(c.id)}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[minmax(0,1fr)_160px_160px_auto] sm:items-end">
          <TextField
            label="Name"
            placeholder="e.g. Durga Puja closure"
            value={closure.name}
            onChange={(e) => setClosure({ ...closure, name: e.target.value })}
            error={closureErrors['name']}
          />
          <TextField
            label="From"
            type="date"
            value={closure.from}
            onChange={(e) => setClosure({ ...closure, from: e.target.value })}
            error={closureErrors['from']}
          />
          <TextField
            label="To"
            type="date"
            value={closure.to}
            onChange={(e) => setClosure({ ...closure, to: e.target.value })}
            error={closureErrors['to']}
          />
          <Button icon={Plus} loading={add.isPending} onClick={() => void addClosure()}>
            Add
          </Button>
        </div>
      </Card>
    </div>
  );
}
