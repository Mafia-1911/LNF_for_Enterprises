// Development only: text messages the DevSmsAdapter would have sent (SMS_PROVIDER=dev).
import { Card, Notice } from '@lf/ui';
import { useQuery } from '@tanstack/react-query';

export function DevSmsPage() {
  const sms = useQuery({
    queryKey: ['dev-sms'],
    queryFn: async () => {
      const res = await fetch('/api/dev/sms', { credentials: 'include' });
      if (!res.ok)
        throw new Error("The dev SMS list isn't available; check that ENABLE_DEV_TOOLS=true.");
      return (await res.json()) as { messages: { to: string; body: string; at: string }[] };
    },
    refetchInterval: 2000,
  });
  return (
    <div className="mx-auto max-w-[768px] px-4 py-8">
      <h1 className="font-display text-display-m font-semibold text-ink">Dev SMS</h1>
      <p className="text-body text-muted">
        Messages the dev SMS adapter would have sent, newest first. Refreshes every 2 seconds.
      </p>
      {sms.isError ? <Notice tone="danger">{sms.error.message}</Notice> : null}
      <div className="mt-6 flex flex-col gap-3">
        {sms.data?.messages.length === 0 ? (
          <p className="text-body text-muted">No messages yet.</p>
        ) : null}
        {sms.data?.messages.map((m) => (
          <Card key={`${m.at}-${m.to}`} className="!p-4">
            <p className="text-body font-semibold text-ink">{m.to}</p>
            <p className="text-body text-ink" data-testid="sms-body">
              {m.body}
            </p>
            <p className="text-body text-muted">{m.at}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
