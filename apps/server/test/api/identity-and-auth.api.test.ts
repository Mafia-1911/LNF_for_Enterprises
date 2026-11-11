// Sign-in methods, the sign-in policy and role checks (A2, CC-10, prompt §5.2 "Auth" tests).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignInRefused } from '../../src/platform/auth';
import { createAuthPolicy } from '../../src/modules/identity';
import { createTestContext, type TestContext } from '../harness';
import { email, TEST_NOW } from '../fixtures';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

const report = {
  category: 'phone',
  colour: 'black',
  shortName: 'Black Samsung phone',
  brand: 'Samsung',
  publicDescription: null,
  privateNote: null,
  place: { buildingCode: 'PLZ', floorId: null, zoneId: null },
  timeFrom: '2026-11-08T08:00:00.000Z',
  timeTo: TEST_NOW,
};

describe('GET /api/me', () => {
  it.each([
    [email.student, 'student', 'Rafiq Ahmed'],
    [email.desk, 'desk_officer', 'Nusrat Jahan'],
    [email.supervisor, 'supervisor', 'Farhana Islam'],
    [email.itAdmin, 'it_admin', 'Tanvir Alam'],
    [email.visitor, 'visitor', 'Karim Hossain'],
  ])('returns %s as %s', async (who, role, name) => {
    const res = await (
      await ctx.as(who)
    ).get<{ me: { role: string; name: string; contact: string } }>('/api/me');
    expect(res.status).toBe(200);
    expect(res.body.me).toMatchObject({ role, name });
    expect(res.body.me.contact).toBe(role === 'visitor' ? '+8801700000001' : who);
  });

  it('answers 401 with a one-sentence message when signed out', async () => {
    const res = await ctx.anonymous().get<{ error: { kind: string; message: string } }>('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toEqual({
      kind: 'unauthenticated',
      message: 'You are signed out; sign in again to continue.',
    });
  });

  it("refuses a person who has no role at this university (tenant A's student on tenant B's address)", async () => {
    const res = await (
      await ctx.as(email.student, ctx.hosts.B)
    ).get<{ error: { kind: string } }>('/api/me');
    expect(res.status).toBe(403);
    expect(res.body.error.kind).toBe('forbidden');
  });
});

describe('who may submit a lost report', () => {
  it('lets a visitor submit (visitors can report a lost item)', async () => {
    expect((await (await ctx.as(email.visitor)).post('/api/lost-reports', report)).status).toBe(
      201,
    );
  });

  it('lets a desk officer submit (walk-in students, US-10)', async () => {
    expect((await (await ctx.as(email.desk)).post('/api/lost-reports', report)).status).toBe(201);
  });

  it('refuses the IT admin (no item decisions)', async () => {
    const res = await (
      await ctx.as(email.itAdmin)
    ).post<{ error: { kind: string } }>('/api/lost-reports', report);
    expect(res.status).toBe(403);
    expect(res.body.error.kind).toBe('forbidden');
  });

  it('refuses a signed-out request', async () => {
    const res = await ctx
      .anonymous()
      .post<{ error: { kind: string } }>('/api/lost-reports', report);
    expect(res.status).toBe(401);
  });

  it('refuses a request for an address no university uses', async () => {
    const res = await ctx
      .client({ host: 'unknown.test' })
      .get<{ error: { message: string } }>('/api/tenant');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe(
      "This address isn't set up for Lost & Found; check the link you were given.",
    );
  });
});

describe('email one-time codes (students and staff without SSO)', () => {
  const send = (who: string) =>
    ctx
      .anonymous()
      .post<{ message?: string; success?: boolean }>('/api/auth/email-otp/send-verification-otp', {
        email: who,
        type: 'sign-in',
      });

  it('refuses staff, who must use single sign-on', async () => {
    const res = await send(email.desk);
    expect(res.status).toBe(403);
    expect(res.body.message).toContain('NSU single sign-on');
  });

  it('refuses addresses outside the university domain', async () => {
    const res = await send('someone@gmail.com');
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(
      'Use your @northsouth.edu email to sign in, or choose Visitor to sign in with your phone.',
    );
  });

  it('signs a student in with a 6-digit code sent by email', async () => {
    const outbox = ctx.services.email.outbox ?? [];
    outbox.length = 0;
    expect((await send(email.student2)).status).toBe(200);
    const message = outbox.at(-1);
    expect(message?.to).toBe(email.student2);
    const code = /\b(\d{6})\b/.exec(message?.text ?? '')?.[1];
    expect(code).toMatch(/^\d{6}$/);

    const browser = ctx.anonymous();
    expect(
      (await browser.post('/api/auth/sign-in/email-otp', { email: email.student2, otp: '000000' }))
        .status,
    ).toBe(400);
    const ok = await browser.post('/api/auth/sign-in/email-otp', {
      email: email.student2,
      otp: code,
    });
    expect(ok.status).toBe(200);
    expect((await browser.get<{ me: { role: string } }>('/api/me')).body.me.role).toBe('student');
  });

  it('rate-limits sending codes (3 a minute)', async () => {
    const res = await send(email.student);
    expect(res.status).toBe(429);
  });

  it('stores codes hashed, not in plain text', async () => {
    const { rows } = await ctx.owner.query<{ value: string }>(
      `select value from verifications where identifier like 'sign-in-otp-%'`,
    );
    for (const row of rows) expect(row.value).not.toMatch(/^\d{6}:/);
  });
});

describe('phone one-time codes (visitors)', () => {
  const sendCode = (phoneNumber: string) =>
    ctx.anonymous().post<{ message?: string }>('/api/auth/phone-number/send-otp', { phoneNumber });
  const lastCode = () => /(\d{6})/.exec(ctx.services.sms.recent?.()[0]?.body ?? '')?.[1] ?? '';

  it('signs a new visitor up and gives them the visitor role', async () => {
    expect((await sendCode('+8801900000002')).status).toBe(200);
    const browser = ctx.anonymous();
    const res = await browser.post<{ status: boolean }>('/api/auth/phone-number/verify', {
      phoneNumber: '+8801900000002',
      code: lastCode(),
    });
    expect(res.status).toBe(200);
    const me = await browser.get<{ me: { role: string; contact: string } }>('/api/me');
    expect(me.body.me).toMatchObject({ role: 'visitor', contact: '+8801900000002' });
  });

  it('rejects numbers that are not Bangladesh mobiles', async () => {
    expect((await sendCode('+15551234567')).status).toBe(400);
  });
});

describe('sign-in policy (staff SSO only, university domain, visitors by phone)', () => {
  const tenant = () => ({
    id: ctx.tenantA,
    slug: 'nsu',
    name: 'North South University',
    shortName: 'NSU',
    emailDomain: 'northsouth.edu',
    isPractice: false,
  });
  const policy = () => createAuthPolicy({ db: ctx.services.db, clock: ctx.clock });
  const userId = async (who: string) =>
    (await ctx.owner.query<{ id: string }>('select id from users where email = $1', [who])).rows[0]
      ?.id ?? '';

  it('refuses SSO for addresses outside the university domain, before any account is created', async () => {
    await expect(
      policy().beforeUserCreate('outsider@gmail.com', 'sso', tenant()),
    ).rejects.toBeInstanceOf(SignInRefused);
    await expect(
      policy().beforeUserCreate('new.person@northsouth.edu', 'sso', tenant()),
    ).resolves.toBeUndefined();
    await expect(
      policy().beforeUserCreate('anyone@visitors.lostfound.invalid', 'phone_otp', tenant()),
    ).resolves.toBeUndefined();
  });

  it('lets staff sign in with SSO but not with an email code', async () => {
    const desk = await userId(email.desk);
    await expect(policy().beforeSession(desk, 'sso', tenant())).resolves.toBeUndefined();
    await expect(policy().beforeSession(desk, 'email_otp', tenant())).rejects.toThrow(
      'NSU single sign-on',
    );
  });

  it('keeps university accounts off the visitor phone sign-in', async () => {
    await expect(
      policy().beforeSession(await userId(email.student), 'phone_otp', tenant()),
    ).rejects.toThrow('university account');
    await expect(
      policy().beforeSession(await userId(email.visitor), 'phone_otp', tenant()),
    ).resolves.toBeUndefined();
  });

  it('in the public demo, signs anyone in by email code: outsiders as visitors, staff too', async () => {
    const demo = createAuthPolicy({ db: ctx.services.db, clock: ctx.clock, openEmailSignIn: true });
    await expect(demo.checkEmailCode('someone@gmail.com', tenant())).resolves.toBeUndefined();
    await expect(
      demo.beforeUserCreate('someone@gmail.com', 'email_otp', tenant()),
    ).resolves.toBeUndefined();
    await expect(demo.checkEmailCode(email.desk, tenant())).resolves.toBeUndefined();
    await expect(
      demo.beforeSession(await userId(email.desk), 'email_otp', tenant()),
    ).resolves.toBeUndefined();
    // Single sign-on keeps its domain rule even in the demo.
    await expect(
      demo.beforeUserCreate('someone@gmail.com', 'sso', tenant()),
    ).rejects.toBeInstanceOf(SignInRefused);

    const id =
      (
        await ctx.owner.query<{ id: string }>(
          `insert into users (email, name, email_verified, created_at, updated_at) values ('guest.demo@gmail.com', 'Guest', true, now(), now()) returning id`,
        )
      ).rows[0]?.id ?? '';
    await demo.afterSession(id, 'email_otp', tenant());
    const { rows } = await ctx.owner.query(
      'select role, title from role_assignments where user_id = $1 and tenant_id = $2',
      [id, ctx.tenantA],
    );
    expect(rows).toEqual([{ role: 'visitor', title: 'Visitor' }]);
    // Outside the demo the same address is refused.
    await expect(policy().checkEmailCode('someone@gmail.com', tenant())).rejects.toBeInstanceOf(
      SignInRefused,
    );
  });

  it('gives a first-time university sign-in the student role', async () => {
    const id =
      (
        await ctx.owner.query<{ id: string }>(
          `insert into users (email, name, email_verified, created_at, updated_at) values ('fresh@northsouth.edu', 'Fresh', true, now(), now()) returning id`,
        )
      ).rows[0]?.id ?? '';
    await policy().afterSession(id, 'sso', tenant());
    const { rows } = await ctx.owner.query(
      'select role from role_assignments where user_id = $1 and tenant_id = $2',
      [id, ctx.tenantA],
    );
    expect(rows).toEqual([{ role: 'student' }]);
  });
});
