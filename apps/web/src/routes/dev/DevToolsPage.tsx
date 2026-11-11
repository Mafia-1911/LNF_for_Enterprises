// Development only (/dev/tools): sign in as a seeded person and move the server clock. This replaces
// the old prototype toolbar, so nothing dev-only sits on the app's top bar. Not in production builds.
import { dhakaParts } from '@lf/domain';
import { Button, Card, TextField } from '@lf/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Clock, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useMe } from '../../api/hooks';
import { syncWithServerClock } from '../../lib/clock';

const ACCOUNTS = [
  { email: 'rafiq.ahmed@northsouth.edu', name: 'Rafiq Ahmed', role: 'Student' },
  { email: '8801700000001@visitors.lostfound.invalid', name: 'Karim Hossain', role: 'Visitor' },
  { email: 'nusrat.jahan@northsouth.edu', name: 'Nusrat Jahan', role: 'Desk officer' },
  { email: 'farhana.islam@northsouth.edu', name: 'Farhana Islam', role: 'Supervisor' },
  { email: 'tanvir.alam@northsouth.edu', name: 'Tanvir Alam', role: 'IT admin' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function label(d: Date): string {
  const p = dhakaParts(d);
  return `${p.day} ${MONTHS[p.month - 1] ?? ''} ${p.year}, ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function DevToolsPage() {
  const me = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [serverNow, setServerNow] = useState<Date | null>(null);
  const [other, setOther] = useState('');
  const [otherError, setOtherError] = useState<string | undefined>();

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

  async function signInAs(email: string) {
    const res = await fetch('/api/auth/dev/sign-in-as', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    if (!res.ok) {
      setOtherError('There is no account with that email yet; check it, or pick one above.');
      return;
    }
    queryClient.clear();
    await navigate({ to: '/' });
  }

  return (
    <div className="mx-auto flex max-w-[768px] flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="font-display text-display-m font-semibold text-ink">Dev tools</h1>
        <p className="text-body text-muted">
          Sample accounts and the server clock (not in production builds). Signed in as{' '}
          <span className="font-semibold text-ink">{me.data?.name ?? 'nobody'}</span>.
        </p>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="text-title-s font-semibold text-ink">Sign in as</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {ACCOUNTS.map((a) => (
            <Button key={a.email} variant="secondary" onClick={() => void signInAs(a.email)}>
              {a.name} · {a.role}
            </Button>
          ))}
        </div>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setOtherError(undefined);
            void signInAs(other);
          }}
        >
          <div className="flex-1">
            <TextField
              label="Or any other account's email"
              type="email"
              autoComplete="off"
              value={other}
              onChange={(e) => setOther(e.target.value)}
              error={otherError}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={other.trim().length < 3}>
            Sign in
          </Button>
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-title-s font-semibold text-ink">Server clock</h2>
        <p className="inline-flex items-center gap-2 text-body text-ink" aria-live="polite">
          <Clock size={20} aria-hidden="true" />
          {serverNow ? label(serverNow) : '—'} (Dhaka)
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void moveClock({ advanceMs: 3_600_000 })}>
            +1 hour
          </Button>
          <Button variant="secondary" onClick={() => void moveClock({ advanceMs: 86_400_000 })}>
            +1 day
          </Button>
          <Button variant="secondary" onClick={() => void moveClock({ advanceMs: 7 * 86_400_000 })}>
            +1 week
          </Button>
          <Button variant="ghost" icon={RotateCcw} onClick={() => void moveClock({ reset: true })}>
            Back to real time
          </Button>
        </div>
      </Card>
    </div>
  );
}
