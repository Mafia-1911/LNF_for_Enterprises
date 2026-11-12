// Better-Auth (ADR-0003): university SSO (OIDC), email OTP and phone OTP, sessions in Postgres.
// The tenant rules (university domain, staff SSO only, visitors phone only, default roles) live in
// modules/identity and are injected as `policy`, because platform code never imports modules.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { phoneNumber } from 'better-auth/plugins/phone-number';
import { trustedOrigins, type Config } from '../config';
import { drizzleOf } from '../db/pool';
import type { DatabaseHandle } from '../db/types';
import type { EmailSender } from '../email';
import { currentRequestScope } from '../http/context';
import type { Logger } from '../logger';
import type { SmsSender } from '../sms';
import type { Tenant } from '../tenancy';
import { devSignInPlugin } from './dev-sign-in';
import { authSchema } from './schema';

export { authSchema, users } from './schema';

export const SSO_PROVIDER_ID = 'nsu-sso';
export const CLIENT_IP_HEADER = 'x-lf-client-ip';
export type SignInMethod = 'sso' | 'email_otp' | 'phone_otp';

/** Thrown by policy checks; the message is shown to the person signing in. */
export class SignInRefused extends Error {}

export type AuthPolicy = {
  /** Before sending or accepting an email code. Throw SignInRefused to stop it. */
  checkEmailCode(email: string, tenant: Tenant): Promise<void>;
  /** Before sending or accepting a phone code. Throw SignInRefused to stop it. */
  checkPhoneCode(phoneNumber: string, tenant: Tenant): Promise<void>;
  /** Before a new person is created on first sign-in. Throw SignInRefused to stop it. */
  beforeUserCreate(email: string, method: SignInMethod, tenant: Tenant): Promise<void>;
  /** Before a session is created, whatever the method. Throw SignInRefused to stop it. */
  beforeSession(userId: string, method: SignInMethod, tenant: Tenant): Promise<void>;
  /** After a session is created: give a first-time user their default role in this tenant. */
  afterSession(userId: string, method: SignInMethod, tenant: Tenant): Promise<void>;
};

export type AuthDeps = {
  db: DatabaseHandle;
  config: Config;
  email: EmailSender;
  sms: SmsSender;
  policy: AuthPolicy;
  logger: Logger;
};

const BD_MOBILE = /^\+8801[3-9]\d{8}$/;

function requireTenant(): Tenant {
  const tenant = currentRequestScope()?.tenant;
  if (!tenant)
    throw new APIError('NOT_FOUND', {
      message: "This address isn't set up for Lost & Found; check the link you were given.",
    });
  return tenant;
}

async function enforce(check: () => Promise<void>): Promise<void> {
  try {
    await check();
  } catch (err) {
    if (err instanceof SignInRefused) throw new APIError('FORBIDDEN', { message: err.message });
    throw err;
  }
}

function methodFromPath(path: string | undefined): SignInMethod | null {
  if (!path) return null;
  if (path.startsWith('/callback/') || path.startsWith('/oauth2/callback/')) return 'sso';
  if (path === '/sign-in/email-otp') return 'email_otp';
  if (path === '/phone-number/verify' || path === '/sign-in/phone-number') return 'phone_otp';
  return null;
}

function emailOtpMessage(otp: string): { subject: string; text: string; html: string } {
  return {
    subject: `${otp} is your NSU Lost & Found sign-in code`,
    text: `Your sign-in code is ${otp}. It expires in 5 minutes. If you didn't ask for it, ignore this email.`,
    html: `<p>Your sign-in code is <strong style="font-size:20px;letter-spacing:2px">${otp}</strong>.</p><p>It expires in 5 minutes. If you didn't ask for it, ignore this email.</p>`,
  };
}

export function createAuth(deps: AuthDeps) {
  const { config, policy, logger } = deps;
  const production = config.nodeEnv === 'production';

  return betterAuth({
    appName: 'NSU Lost & Found',
    baseURL: config.appOrigin,
    basePath: '/api/auth',
    secret: config.auth.secret,
    trustedOrigins: trustedOrigins(config),
    database: drizzleAdapter(drizzleOf(deps.db), { provider: 'pg', schema: authSchema }),
    telemetry: { enabled: false },
    logger: {
      level: 'warn',
      log: (level, message) => logger[level]({ source: 'better-auth' }, message),
    },
    advanced: {
      cookiePrefix: 'lf',
      useSecureCookies: production,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: production },
      database: { generateId: 'uuid' },
      // The server sets this header from the TCP connection (app.ts) and drops any copy the client
      // sent, so the rate limiter sees the caller's address. Behind Cloudflare, map cf-connecting-ip instead.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    // Seeded and returning users sign in with SSO to the account that already has their email.
    account: { accountLinking: { enabled: true, trustedProviders: [SSO_PROVIDER_ID] } },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/sign-in/email-otp': { window: 60, max: 10 },
        '/phone-number/send-otp': { window: 60, max: 3 },
        '/phone-number/verify': { window: 60, max: 10 },
      },
    },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: SSO_PROVIDER_ID,
            discoveryUrl: `${config.auth.oidc.issuer}/.well-known/openid-configuration`,
            clientId: config.auth.oidc.clientId,
            clientSecret: config.auth.oidc.clientSecret,
            scopes: ['openid', 'email', 'profile'],
            pkce: true,
            mapProfileToUser: (profile) => {
              const email = typeof profile.email === 'string' ? profile.email.toLowerCase() : '';
              const fallbackName =
                typeof profile['preferred_username'] === 'string'
                  ? profile['preferred_username']
                  : email.split('@')[0];
              return {
                email,
                name:
                  typeof profile.name === 'string' && profile.name
                    ? profile.name
                    : (fallbackName ?? email),
                emailVerified: true,
              };
            },
          },
        ],
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        rateLimit: { window: 60, max: 3 },
        sendVerificationOTP: async ({ email, otp }) => {
          await deps.email.send({ to: email, ...emailOtpMessage(otp) });
        },
      }),
      phoneNumber({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 5,
        phoneNumberValidator: (value) => BD_MOBILE.test(value),
        sendOTP: async ({ phoneNumber: to, code }) => {
          await deps.sms.send(
            to,
            `Your NSU Lost & Found code is ${code}. It expires in 5 minutes.`,
          );
        },
        signUpOnVerification: {
          getTempEmail: (value) => `${value.replace(/\D/g, '')}@visitors.lostfound.invalid`,
          getTempName: () => 'Visitor',
        },
      }),
      ...(config.devTools ? [devSignInPlugin()] : []),
    ],
    hooks: {
      // Refuse early, before a code is sent, so people learn the right way to sign in.
      before: createAuthMiddleware(async (ctx) => {
        const body = (ctx.body ?? {}) as { email?: unknown; phoneNumber?: unknown };
        if (ctx.path === '/email-otp/send-verification-otp' || ctx.path === '/sign-in/email-otp') {
          const tenant = requireTenant();
          await enforce(() =>
            policy.checkEmailCode(
              typeof body.email === 'string' ? body.email.toLowerCase() : '',
              tenant,
            ),
          );
        }
        if (ctx.path === '/phone-number/send-otp' || ctx.path === '/phone-number/verify') {
          const tenant = requireTenant();
          await enforce(() =>
            policy.checkPhoneCode(
              typeof body.phoneNumber === 'string' ? body.phoneNumber : '',
              tenant,
            ),
          );
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            const method = methodFromPath(ctx?.path);
            if (!method) return;
            const tenant = requireTenant();
            await enforce(() => policy.beforeUserCreate(user.email.toLowerCase(), method, tenant));
          },
        },
      },
      session: {
        create: {
          // The last word on every sign-in: the right method for this person in this tenant.
          before: async (session, ctx) => {
            const method = methodFromPath(ctx?.path);
            if (!method) return;
            const tenant = requireTenant();
            await enforce(() => policy.beforeSession(session.userId, method, tenant));
          },
          after: async (session, ctx) => {
            const method = methodFromPath(ctx?.path);
            const tenant = currentRequestScope()?.tenant;
            if (method && tenant) await policy.afterSession(session.userId, method, tenant);
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
