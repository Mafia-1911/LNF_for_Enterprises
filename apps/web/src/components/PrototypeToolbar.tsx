// Prototype toolbar (Figma "DemoBar", plan §9.13): development and staging builds only. "View as"
// signs in as a seeded account; +1 h / +1 day / +1 week move the server clock (time travel).
// No theme swatches: only the IT admin may change the theme (ADR-0010).
import { dhakaParts } from '@lf/domain';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, Clock, RotateCcw } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useMe } from '../api/hooks';
import { syncWithServerClock } from '../lib/clock';

const ACCOUNTS = [
  { email: 'rafiq.ahmed@northsouth.edu', label: 'Student / Staff — Rafiq Ahmed' },
  { email: '8801700000001@visitors.lostfound.invalid', label: 'Visitor — Karim Hossain' },
  { email: 'nusrat.jahan@northsouth.edu', label: 'Desk officer — Nusrat Jahan' },
  { email: 'farhana.islam@northsouth.edu', label: 'Supervisor — Farhana Islam' },
  { email: 'tanvir.alam@northsouth.edu', label: 'IT admin — Tanvir Alam' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (d: Date) => {
  const p = dhakaParts(d);
  return `${p.day} ${MONTHS[p.month - 1] ?? ''}, ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

export default function PrototypeToolbar() {
  const id = useId();
  const me = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [serverNow, setServerNow] = useState<Date | null>(null);

  useEffect(() => {
    void syncWithServerClock().then(setServerNow);
  }, []);

  async function moveClock(body: { advanceMs: number } | { reset: true }) {
    await fetch('/api/dev/clock', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setServerNow(await syncWithServerClock());
    await queryClient.invalidateQueries();
  }

  async function viewAs(email: string) {
    if (!email) return;
    await fetch('/api/auth/dev/sign-in-as', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    queryClient.clear();
    await navigate({ to: '/' });
  }

  const current =
    ACCOUNTS.find((a) => me.data && (a.email === me.data.contact || a.label.endsWith(me.data.name)))
      ?.email ?? '';
  const button =
    'inline-flex min-h-9 items-center gap-1.5 rounded-sm bg-white/10 px-2.5 text-[14px] leading-5 font-semibold text-white hover:bg-white/20';

  return (
    <div data-prototype-toolbar="" className="bg-toolbar text-white">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <span className="rounded-[6px] bg-white/10 px-2 py-1 text-[12px] leading-4 font-bold tracking-[1.2px] text-white/80 uppercase">
          Prototype
        </span>
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="text-[14px] leading-5 text-white/70">
            View as
          </label>
          <div className="relative">
            <select
              id={id}
              value={current}
              onChange={(e) => void viewAs(e.target.value)}
              className="min-h-9 appearance-none rounded-sm bg-white/10 py-1 pr-9 pl-3 text-[14px] leading-5 font-semibold text-white"
            >
              <option value="" className="text-black">
                Signed out
              </option>
              {ACCOUNTS.map((a) => (
                <option key={a.email} value={a.email} className="text-black">
                  {a.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
            />
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-[14px] leading-5 text-white/70">
            <Clock size={16} aria-hidden="true" />
            <span aria-live="polite">{serverNow ? label(serverNow) : '—'}</span>
          </span>
          <button
            type="button"
            className={button}
            onClick={() => void moveClock({ advanceMs: 3_600_000 })}
          >
            +1 h
          </button>
          <button
            type="button"
            className={button}
            onClick={() => void moveClock({ advanceMs: 86_400_000 })}
          >
            +1 day
          </button>
          <button
            type="button"
            className={button}
            onClick={() => void moveClock({ advanceMs: 7 * 86_400_000 })}
          >
            +1 week
          </button>
          <button
            type="button"
            className={`${button} bg-transparent text-white/80`}
            onClick={() => void moveClock({ reset: true })}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
