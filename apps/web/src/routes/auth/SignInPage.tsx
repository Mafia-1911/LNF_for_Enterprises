// Sign in (Figma 39:283) and Visitor sign up (Figma 39:582): one page, two tabs.
//   Student or staff: NSU single sign-on, or a 6-digit code by email (students; staff use SSO).
//   Visitor: name + Bangladesh mobile number, 6-digit code by SMS.
// After a code is sent the same column asks for the code (no Figma frame; built in the same style).
import { BdMobileSchema, OtpCodeSchema, UniversityEmailSchema } from '@lf/contracts';
import { Button, Logo, Notice, Segmented, TextField } from '@lf/ui';
import { useQueryClient } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { BuildingComplex, Mail, Phone, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { keys, useTenant } from '../../api/hooks';
import { authClient, authErrorMessage, SSO_PROVIDER } from '../../lib/auth-client';

const route = getRouteApi('/sign-in');

const SSO_ERRORS: Record<string, string> = {
  sso_refused:
    'Single sign-on only accepts university accounts; sign in with your university account.',
  sso_failed: "Single sign-on didn't finish; try again, or use an email code.",
};

type CodeTarget =
  { kind: 'email'; email: string } | { kind: 'phone'; phoneNumber: string; name: string };

export function SignInPage() {
  const { tab, error: errorCode } = route.useSearch();
  const navigate = useNavigate();
  const tenant = useTenant();
  const domain = tenant.data?.tenant.emailDomain ?? 'northsouth.edu';
  const [target, setTarget] = useState<CodeTarget | null>(null);

  const visitor = tab === 'visitor';
  const title = target
    ? target.kind === 'email'
      ? 'Check your email'
      : 'Check your phone'
    : visitor
      ? 'Visitor sign up'
      : 'Sign in';

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[52fr_48fr]">
      <Hero />
      <main className="flex items-start justify-center px-4 py-10 sm:px-5 lg:items-center">
        <div className="w-full max-w-[448px]">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="font-display text-display-m font-semibold text-ink">{title}</h1>
          <p className="mt-1 text-body text-muted">
            {target
              ? target.kind === 'email'
                ? `We sent a 6-digit code to ${target.email}. It expires in 5 minutes.`
                : `We sent a 6-digit code to ${target.phoneNumber}. It expires in 5 minutes.`
              : 'No passwords. We’ll send you a one-time code.'}
          </p>

          {errorCode && SSO_ERRORS[errorCode] && !target ? (
            <Notice tone="danger" live="assertive" className="mt-6">
              {SSO_ERRORS[errorCode]}
            </Notice>
          ) : null}

          {target ? (
            <CodeEntry
              target={target}
              onBack={() => setTarget(null)}
              onSignedIn={() => void navigate({ to: '/' })}
            />
          ) : (
            <Segmented
              className="mt-6"
              label="Who are you?"
              value={visitor ? 'visitor' : 'student'}
              onValueChange={(v) =>
                void navigate({
                  to: '/sign-in',
                  search: { tab: v === 'visitor' ? 'visitor' : 'student' },
                  replace: true,
                })
              }
              items={[
                {
                  value: 'student',
                  label: 'Student or staff',
                  content: <StudentForm domain={domain} onCodeSent={setTarget} />,
                },
                {
                  value: 'visitor',
                  label: 'Visitor',
                  content: <VisitorForm onCodeSent={setTarget} />,
                },
              ]}
            />
          )}

          <p className="mt-8 text-body text-muted">
            Staff (desk officers, supervisors, IT) sign in with university single sign-on.
          </p>
        </div>
      </main>
    </div>
  );
}

function Hero() {
  return (
    <aside className="relative hidden overflow-hidden bg-hero text-on-hero lg:block">
      <div className="lf-campus-photo absolute inset-0" aria-hidden="true" />
      <div
        className="absolute inset-0 bg-linear-to-t from-hero via-hero/60 to-hero/10"
        aria-hidden="true"
      />
      <div className="relative flex h-full flex-col px-12 pt-[130px] pb-16">
        <div className="flex items-center gap-3">
          <img src="/nsu-crest.webp" alt="" width={41} height={49} />
          <div className="leading-tight">
            <p className="font-display text-heading-s font-semibold">NSU Lost &amp; Found</p>
            <p className="text-logo-sub font-semibold uppercase opacity-75">
              North South University
            </p>
          </div>
        </div>
        <div className="mt-auto max-w-[512px]">
          <p className="font-display text-[48px] leading-[50.4px] font-semibold">
            Lost something on campus?
            <br />
            Don’t worry, it’s probably waiting for you.
          </p>
          <p className="mt-4 text-body-l opacity-80">
            Report what you lost or found, get alerted when there’s a likely match, and collect it
            from the L&amp;F Office with a pickup code.
          </p>
          <div className="mt-8 border-t border-on-hero/20 pt-6">
            {/* Plan §9.5: replaces "Claims Resolved within 30 Mins" with the SRS hand-in deadline. */}
            <p className="font-display text-display-m font-semibold text-accent">48 hours</p>
            <p className="text-body opacity-75">to hand in a found item</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

function StudentForm({
  domain,
  onCodeSent,
}: {
  domain: string;
  onCodeSent: (t: CodeTarget) => void;
}) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState<'sso' | 'email' | null>(null);

  async function sso() {
    setBusy('sso');
    const { error: err } = await authClient.signIn.social({
      provider: SSO_PROVIDER,
      callbackURL: '/',
      errorCallbackURL: '/sign-in?error=sso_failed',
    });
    if (err) {
      setError(authErrorMessage(err));
      setBusy(null);
    }
  }

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    const parsed = UniversityEmailSchema.safeParse(email);
    if (!parsed.success || !parsed.data.endsWith(`@${domain}`)) {
      setError(`Enter your @${domain} email, or use single sign-on.`);
      return;
    }
    setBusy('email');
    setError(undefined);
    const { error: err } = await authClient.emailOtp.sendVerificationOtp({
      email: parsed.data,
      type: 'sign-in',
    });
    setBusy(null);
    if (err) setError(authErrorMessage(err));
    else onCodeSent({ kind: 'email', email: parsed.data });
  }

  return (
    <div className="mt-6 flex flex-col">
      <Button
        size="lg"
        icon={BuildingComplex}
        className="w-full"
        loading={busy === 'sso'}
        onClick={() => void sso()}
      >
        Continue with NSU single sign-on
      </Button>
      <div className="my-6 flex items-center gap-3 text-body text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        or use an email code
        <span className="h-px flex-1 bg-line" />
      </div>
      <form noValidate onSubmit={(e) => void sendCode(e)} className="flex flex-col gap-4">
        <TextField
          label="University email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={`name@${domain}`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={error}
        />
        <Button
          type="submit"
          variant="secondary"
          size="lg"
          icon={Mail}
          className="w-full"
          loading={busy === 'email'}
        >
          Email me a code
        </Button>
      </form>
    </div>
  );
}

function VisitorForm({ onCodeSent }: { onCodeSent: (t: CodeTarget) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    const nameOk = name.trim().length >= 2;
    const parsedPhone = BdMobileSchema.safeParse(phone);
    const next = {
      ...(nameOk ? {} : { name: 'Enter your name as it appears on your ID.' }),
      ...(parsedPhone.success
        ? {}
        : { phone: 'Enter a Bangladesh mobile number, e.g. 01712 345678.' }),
    };
    setErrors(next);
    if (!nameOk || !parsedPhone.success) return;
    setBusy(true);
    const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: parsedPhone.data });
    setBusy(false);
    if (error) setErrors({ form: authErrorMessage(error) });
    else onCodeSent({ kind: 'phone', phoneNumber: parsedPhone.data, name: name.trim() });
  }

  return (
    <form noValidate onSubmit={(e) => void sendCode(e)} className="mt-6 flex flex-col gap-4">
      <Notice tone="info" icon={ShieldCheck}>
        Visitors can report a lost item and claim it. Bring your national ID (NID) or passport when
        you collect it.
      </Notice>
      <TextField
        label="Your name"
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />
      <TextField
        label="Mobile number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+880 1XXX-XXXXXX"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
      />
      {errors.form ? (
        <Notice tone="danger" live="assertive">
          {errors.form}
        </Notice>
      ) : null}
      <Button type="submit" size="lg" icon={Phone} className="w-full" loading={busy}>
        Text me a code
      </Button>
    </form>
  );
}

function CodeEntry({
  target,
  onBack,
  onSignedIn,
}: {
  target: CodeTarget;
  onBack: () => void;
  onSignedIn: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  async function verify(e: FormEvent) {
    e.preventDefault();
    const parsed = OtpCodeSchema.safeParse(code);
    if (!parsed.success) {
      setError('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    setError(undefined);
    const result =
      target.kind === 'email'
        ? await authClient.signIn.emailOtp({ email: target.email, otp: parsed.data })
        : await authClient.phoneNumber.verify({
            phoneNumber: target.phoneNumber,
            code: parsed.data,
          });
    if (result.error) {
      setBusy(false);
      setError(authErrorMessage(result.error));
      return;
    }
    if (target.kind === 'phone') {
      const session = await authClient.getSession();
      if (session.data?.user.name === 'Visitor') await authClient.updateUser({ name: target.name });
    }
    await queryClient.invalidateQueries({ queryKey: keys.me });
    onSignedIn();
  }

  async function resend() {
    const { error: err } =
      target.kind === 'email'
        ? await authClient.emailOtp.sendVerificationOtp({ email: target.email, type: 'sign-in' })
        : await authClient.phoneNumber.sendOtp({ phoneNumber: target.phoneNumber });
    if (err) setError(authErrorMessage(err));
    else setNotice('We sent a new code; it replaces the old one.');
  }

  return (
    <form noValidate onSubmit={(e) => void verify(e)} className="mt-6 flex flex-col gap-4">
      <TextField
        label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="\d{6}"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        error={error}
        className="[&_input]:font-mono [&_input]:text-[24px] [&_input]:tracking-[8px]"
      />
      {notice ? (
        <Notice tone="success" live="polite">
          {notice}
        </Notice>
      ) : null}
      <Button type="submit" size="lg" className="w-full" loading={busy}>
        Sign in
      </Button>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={() => void resend()}>
          Send a new code
        </Button>
        <Button variant="ghost" onClick={onBack}>
          {target.kind === 'email' ? 'Use a different email' : 'Use a different number'}
        </Button>
      </div>
    </form>
  );
}
