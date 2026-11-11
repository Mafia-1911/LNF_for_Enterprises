// Help a walk-in student (US-10): the desk files a lost report for someone without a phone. The
// report belongs to the student (by university email), who then gets the alerts.
import { Button, Card, TextField } from '@lf/ui';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';

export function WalkInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  function start() {
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Type the student's university email, e.g. name@northsouth.edu.");
      return;
    }
    void navigate({ to: '/lost/new', search: { step: 1, for: value } });
  }
  return (
    <div className="mx-auto max-w-[640px]">
      <PageHeader title="Help a walk-in student" back={{ to: '/desk/more' }} />
      <Card className="mt-6 flex flex-col gap-4 !p-5">
        <p className="text-body text-ink">
          File a lost report for a student who walked in without a phone. They must have signed in
          once before. The report is theirs: they get the match alerts and can claim the item.
        </p>
        <TextField
          label="Student's university email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error ?? undefined}
        />
        <div>
          <Button onClick={start}>Start the report</Button>
        </div>
      </Card>
    </div>
  );
}
