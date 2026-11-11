// Flagged accounts (Figma 39:23882): repeat no-show finders (CC-03), claimants paused after 3 failed
// verifications (CC-15), and wrong recipients after a dispute (CC-14). "Review done — clear" hides
// a flag until new evidence arrives and lifts a claim pause.
import { Avatar, Button, Notice, useToast } from '@lf/ui';
import { useClearFlag, useFlags } from '../../api/hooks';
import { PageHeader } from '../../components/PageHeader';

export function FlagsPage() {
  const flags = useFlags();
  const clear = useClearFlag();
  const toast = useToast();
  const list = flags.data?.flags ?? [];
  return (
    <div className="max-w-[860px]">
      <PageHeader title="Flagged accounts" />
      <p className="mt-2 text-body text-muted">
        Repeat no-show finders, claimants paused after 3 failed verifications, and accounts that
        received the wrong item.
      </p>
      {flags.isError ? (
        <Notice tone="danger" className="mt-4">
          {flags.error.message}
        </Notice>
      ) : null}
      {flags.data && list.length === 0 ? (
        <p className="mt-6 text-body text-muted">No accounts need review.</p>
      ) : null}
      <ul className="mt-6 flex flex-col gap-3">
        {list.map((f) => (
          <li
            key={f.userId}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4"
          >
            <Avatar name={f.name} size="m" />
            <div className="min-w-0 flex-1">
              <p className="text-body font-semibold text-ink">{f.name}</p>
              <ul>
                {f.reasons.map((r) => (
                  <li key={r} className="text-body text-muted">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
            <Button
              variant="secondary"
              loading={clear.isPending && clear.variables === f.userId}
              onClick={() =>
                void clear
                  .mutateAsync(f.userId)
                  .then(() => toast({ title: `Review done for ${f.name}.` }))
              }
            >
              Review done — clear
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
