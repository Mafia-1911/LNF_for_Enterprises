// Retention & disposal (Figma 39:21973, WF-05): items past retention wait for a supervisor's decision
// (donate, transfer, dispose; one or many, with a note) or "Keep longer". Also what ends within 14
// days and what was decided, and "Run daily job now".
import type { DisposalDecision, RetentionItem } from '@lf/contracts';
import {
  Badge,
  Button,
  Card,
  CategoryIcon,
  Modal,
  Notice,
  Segmented,
  TextAreaField,
  useToast,
} from '@lf/ui';
import { Gift, PlayCircle, RotateCcw, Trash2, Truck } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../../api/client';
import {
  photoUrl,
  useDecideRetention,
  useKeepLonger,
  useRetention,
  useRunRetention,
} from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';
import { daysUntil, dhakaDateTime } from '../../lib/clock';

const DECISION_LABEL: Record<DisposalDecision, string> = {
  donate: 'Donate',
  transfer: 'Transfer',
  dispose: 'Dispose',
};
const DECIDED_LABEL: Record<DisposalDecision, string> = {
  donate: 'Donated',
  transfer: 'Transferred',
  dispose: 'Disposed of',
};

function endLabel(item: RetentionItem): string | null {
  if (!item.endsAt) return null;
  const days = daysUntil(item.endsAt);
  if (days > 0) return `ends in ${days} ${days === 1 ? 'day' : 'days'}`;
  if (days === 0) return 'ends today';
  return `ended ${-days} ${days === -1 ? 'day' : 'days'} ago`;
}

function Row({
  item,
  selected,
  onSelect,
  onKeep,
  keeping,
}: {
  item: RetentionItem;
  selected?: boolean;
  onSelect?: (on: boolean) => void;
  onKeep?: () => void;
  keeping?: boolean;
}) {
  const end = endLabel(item);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-3 sm:flex-nowrap">
      {onSelect ? (
        <input
          type="checkbox"
          aria-label={`Select ${item.title} (${item.id})`}
          checked={selected ?? false}
          onChange={(e) => onSelect(e.target.checked)}
          className="size-6 shrink-0 accent-primary"
        />
      ) : null}
      {item.photoId ? (
        <img
          src={photoUrl(item.photoId)}
          alt=""
          className="size-12 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-subtle text-muted">
          <CategoryIcon code={item.category} size={24} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink">{item.title}</p>
        <p className="text-body text-muted">
          <span className="font-mono">{item.id}</span>
          {item.binCode ? ` · bin ${item.binCode}` : ''}
          {item.place ? ` · ${item.place}` : ''}
        </p>
        {item.decision ? (
          <p className="text-body text-muted">
            {DECIDED_LABEL[item.decision]}
            {item.decidedAt ? ` on ${dhakaDateTime(item.decidedAt)}` : ''}
            {item.note ? ` · “${item.note}”` : ''}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {item.lookAlike ? <Badge tone="warning">Look-alike · shorter retention</Badge> : null}
        {end && !item.decision ? (
          <Badge tone={item.state === 'EXPIRED' ? 'danger' : 'warning'}>{end}</Badge>
        ) : null}
        {onKeep ? (
          <Button variant="ghost" icon={RotateCcw} onClick={onKeep} loading={keeping ?? false}>
            Keep longer
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function RetentionPage() {
  const retention = useRetention();
  const decide = useDecideRetention();
  const keep = useKeepLonger();
  const run = useRunRetention();
  const toast = useToast();
  const [tab, setTab] = useState('awaiting');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [decision, setDecision] = useState<DisposalDecision | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const data = retention.data;
  const awaiting = data?.awaiting ?? [];
  const chosen = awaiting.filter((i) => selected.has(i.id)).map((i) => i.id);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function confirm() {
    if (!decision) return;
    setError(null);
    try {
      const result = await decide.mutateAsync({ ids: chosen, decision, note });
      toast({ title: `${DECIDED_LABEL[decision]}: ${result.decided} item(s).` });
      setDecision(null);
      setNote('');
      setSelected(new Set());
    } catch (e) {
      setError(
        e instanceof ApiError ? (e.fields['note'] ?? e.message) : 'Saving failed; try again.',
      );
    }
  }

  async function keepItem(id: string) {
    try {
      const item = await keep.mutateAsync(id);
      toast({ title: `${item.title} is kept ${item.endsAt ? endLabel(item) : 'longer'}.` });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Saving failed; try again.' });
    }
  }

  async function runNow() {
    const r = await run.mutateAsync();
    toast({
      title: `Daily job done: ${r.expired} expired, ${r.lastChanceAlerts} last-chance alerts.`,
    });
  }

  const list = (items: RetentionItem[], empty: string, mode: 'awaiting' | 'ending' | 'decided') =>
    items.length === 0 ? (
      <p className="pt-4 text-body text-muted">{empty}</p>
    ) : (
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <Row
            key={item.id}
            item={item}
            {...(mode === 'awaiting'
              ? { selected: selected.has(item.id), onSelect: (on: boolean) => toggle(item.id, on) }
              : {})}
            {...(mode === 'decided'
              ? {}
              : {
                  onKeep: () => void keepItem(item.id),
                  keeping: keep.isPending && keep.variables === item.id,
                })}
          />
        ))}
      </ul>
    );

  return (
    <div>
      <PageHeader
        title="Retention & disposal"
        aside={
          <Button
            variant="secondary"
            icon={PlayCircle}
            loading={run.isPending}
            onClick={() => void runNow()}
          >
            Run daily job now
          </Button>
        }
      />
      <p className="mt-2 max-w-[640px] text-body text-muted">
        Items are kept {data?.policy.days ?? 60} days ({data?.policy.lookAlikeDays ?? 30} for
        look-alikes). Owners with similar reports get a last-chance alert 7 days before. A daily job
        moves items past retention to Expired.
      </p>
      {retention.isError ? (
        <Notice tone="danger" className="mt-4">
          {retention.error.message}
        </Notice>
      ) : null}
      <Segmented
        label="Retention lists"
        value={tab}
        onValueChange={setTab}
        className="mt-6"
        items={[
          {
            value: 'awaiting',
            label: `Awaiting decision (${awaiting.length})`,
            content: (
              <>
                <Card className="mt-4 flex flex-wrap items-center gap-3 !p-3">
                  <label className="flex min-h-11 items-center gap-3 px-1 text-body font-semibold text-ink">
                    <input
                      type="checkbox"
                      className="size-6 accent-primary"
                      checked={awaiting.length > 0 && chosen.length === awaiting.length}
                      onChange={(e) =>
                        setSelected(new Set(e.target.checked ? awaiting.map((i) => i.id) : []))
                      }
                    />
                    Select all
                  </label>
                  <span className="text-body text-muted">{chosen.length} selected</span>
                  <span className="flex-1" />
                  <Button
                    variant="primary"
                    icon={Gift}
                    disabled={chosen.length === 0}
                    onClick={() => setDecision('donate')}
                  >
                    Donate
                  </Button>
                  <Button
                    variant="secondary"
                    icon={Truck}
                    disabled={chosen.length === 0}
                    onClick={() => setDecision('transfer')}
                  >
                    Transfer
                  </Button>
                  <Button
                    variant="danger"
                    icon={Trash2}
                    disabled={chosen.length === 0}
                    onClick={() => setDecision('dispose')}
                  >
                    Dispose
                  </Button>
                </Card>
                {list(awaiting, 'Nothing is past retention.', 'awaiting')}
              </>
            ),
          },
          {
            value: 'ending',
            label: `Ending within 14 days (${data?.ending.length ?? 0})`,
            content: list(data?.ending ?? [], 'Nothing ends in the next 14 days.', 'ending'),
          },
          {
            value: 'decided',
            label: 'Decided',
            content: list(data?.decided ?? [], 'No decisions in the last 90 days.', 'decided'),
          },
        ]}
      />
      <Modal
        open={decision !== null}
        onOpenChange={(open) => {
          if (!open) setDecision(null);
        }}
        title={decision ? `${DECISION_LABEL[decision]} ${chosen.length} item(s)?` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button
              variant={decision === 'dispose' ? 'danger' : 'primary'}
              loading={decide.isPending}
              onClick={() => void confirm()}
            >
              {decision ? DECISION_LABEL[decision] : ''}
            </Button>
          </>
        }
      >
        <p className="text-body text-muted">
          This is recorded on each item and can't be undone. Say who received the items or how they
          were disposed of.
        </p>
        <TextAreaField
          label="Note"
          className="mt-4"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={error ?? undefined}
        />
      </Modal>
    </div>
  );
}
