// Desk home (SRS authority_interface): four large buttons; everything else under "More".
// The flows behind them arrive in phases 1–3, so the buttons are shown but not active yet.
import type { Me } from '@lf/contracts';
import { Notice } from '@lf/ui';
import { ClipboardCheck, HandHelping, PackagePlus, Search, type LucideIcon } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';

const ACTIONS: { label: string; icon: LucideIcon; phase: string }[] = [
  { label: 'Log a found item', icon: PackagePlus, phase: 'phase 1' },
  { label: 'Hand an item back', icon: HandHelping, phase: 'phase 3' },
  { label: 'Check claims', icon: ClipboardCheck, phase: 'phase 3' },
  { label: 'Find an item', icon: Search, phase: 'phase 1' },
];

export function StaffHome({ me, title }: { me: Me; title: string }) {
  return (
    <div>
      <PageHeader eyebrow={me.title ?? undefined} title={title} />
      <Notice tone="neutral" className="mt-6" title="Desk tools are on the way">
        These four tasks arrive in the next phases; each will be a guided flow of up to four
        screens.
      </Notice>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {ACTIONS.map((a) => (
          <li key={a.label}>
            <div
              aria-disabled="true"
              className="flex min-h-[120px] items-center gap-4 rounded-xl border border-line bg-surface p-6 opacity-70"
            >
              <a.icon size={36} aria-hidden="true" className="text-primary" />
              <div>
                <p className="text-heading-m font-bold text-ink">{a.label}</p>
                <p className="text-body text-muted">Coming in {a.phase}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
