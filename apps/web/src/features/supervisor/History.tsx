// An append-only audit trail: what happened, who did it, when, and the note.
import type { HistoryEntry } from '@lf/contracts';
import { dhakaDateTime } from '../../lib/clock';

export function History({ entries }: { entries: HistoryEntry[] }) {
  return (
    <ol className="flex flex-col">
      {entries.map((h, i) => (
        <li key={`${h.at}-${i}`} className="border-t border-line py-2 first:border-t-0">
          <p className="text-body text-ink">
            <span className="font-semibold">{h.label}</span>{' '}
            <span className="text-muted">
              · {h.actor}, {dhakaDateTime(h.at)}
            </span>
          </p>
          {h.note ? <p className="text-body text-muted">“{h.note}”</p> : null}
        </li>
      ))}
    </ol>
  );
}
