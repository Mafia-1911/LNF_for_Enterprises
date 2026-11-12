// Every environment variable, parsed once at startup. The app refuses to start with a clear list
// of what is missing or invalid (see main.ts). Values are documented in .env.example.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const bool = z.enum(['true', 'false'], 'Use true or false.').transform((v) => v === 'true');
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const postgresUrl = z
  .string('Required.')
  .regex(/^postgres(ql)?:\/\//, 'Must be a postgres:// connection URL.');

const KEY_RING = /^(\d+:[A-Za-z0-9+/]+={0,2})(,\d+:[A-Za-z0-9+/]+={0,2})*$/;

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production'], 'Use development, test or production.'),
  /**
   * demo: a public showcase on a free host (seeded sample data, "sign in as" on /dev/tools). It
   * needs https and real secrets like production, but allows the dev adapters.
   */
  APP_ENV: z.enum(
    ['development', 'test', 'staging', 'demo', 'production'],
    'Use development, test, staging, demo or production.',
  ),
  PORT: z.coerce.number('Must be a number.').int().min(1).max(65535),
  APP_ORIGIN: z.url('Must be a full URL such as http://localhost:5173.'),
  /** Practice mode's own address (FR-21), e.g. http://practice.localhost:5173. Trusted like APP_ORIGIN. */
  PRACTICE_ORIGIN: z.preprocess(
    emptyToUndefined,
    z.url('Must be a full URL such as http://practice.localhost:5173.').optional(),
  ),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  ENABLE_DEV_TOOLS: bool,
  DATABASE_URL: postgresUrl,
  DATABASE_OWNER_URL: z.preprocess(emptyToUndefined, postgresUrl.optional()),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  BETTER_AUTH_SECRET: z.string('Required.').min(32, 'Must be at least 32 characters.'),
  OIDC_ISSUER: z.url('Must be the issuer URL of the university identity provider.'),
  OIDC_CLIENT_ID: z.string('Required.').min(1, 'Required.'),
  OIDC_CLIENT_SECRET: z.string('Required.').min(1, 'Required.'),
  EMAIL_TRANSPORT: z.enum(['smtp', 'memory'], 'Use smtp or memory.'),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).optional()),
  SMTP_SECURE: z.preprocess(emptyToUndefined, bool.optional()),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  EMAIL_FROM: z.string('Required.').min(3, 'Required.'),
  SMS_PROVIDER: z.enum(['dev'], 'Only the dev SMS adapter exists in this phase.'),
  /** University ID lookups for the ID card fast lane (NF-02): dev directory or none. */
  REGISTRAR_PROVIDER: z.preprocess(
    emptyToUndefined,
    z.enum(['dev', 'none'], 'Use dev or none.').optional(),
  ),
  /** s3: MinIO or any S3-compatible bucket. database: photos in Postgres, for hosts without one. */
  STORAGE_DRIVER: z.enum(['s3', 'database'], 'Use s3 or database.').default('s3'),
  STORAGE_ENDPOINT: z.preprocess(
    emptyToUndefined,
    z.url('Must be the S3-compatible endpoint URL.').optional(),
  ),
  STORAGE_REGION: z.string().min(1).default('auto'),
  STORAGE_BUCKET: z.preprocess(emptyToUndefined, z.string().min(3, 'Too short.').optional()),
  STORAGE_ACCESS_KEY_ID: optionalString,
  STORAGE_SECRET_ACCESS_KEY: optionalString,
  STORAGE_FORCE_PATH_STYLE: bool.default(true),
  /**
   * Behind a proxy that sets the visitor's address (e.g. Vercel's x-real-ip), read it from this
   * header for rate limits. Leave empty when the server faces visitors directly.
   */
  TRUSTED_CLIENT_IP_HEADER: z.preprocess(
    emptyToUndefined,
    z.enum(['x-real-ip', 'x-forwarded-for'], 'Use x-real-ip or x-forwarded-for.').optional(),
  ),
  /** Vercel sends it as a bearer token on its scheduled calls to /api/cron/tick (the demo). */
  CRON_SECRET: z.preprocess(
    emptyToUndefined,
    z.string().min(32, 'Must be at least 32 characters.').optional(),
  ),
  PRIVATE_DETAILS_KEYS: z
    .string('Required.')
    .regex(KEY_RING, 'Use "1:<base64 key>,2:<base64 key>".'),
  PRIVATE_DETAILS_KEY_VERSION: z.coerce.number('Must be a number.').int().positive(),
});

type Env = z.infer<typeof EnvSchema>;

export type Config = {
  nodeEnv: Env['NODE_ENV'];
  appEnv: Env['APP_ENV'];
  port: number;
  appOrigin: string;
  /** Practice mode's address, or undefined when it has none. */
  practiceOrigin: string | undefined;
  logLevel: Env['LOG_LEVEL'];
  devTools: boolean;
  database: { url: string; ownerUrl: string | undefined; poolMax: number };
  auth: { secret: string; oidc: { issuer: string; clientId: string; clientSecret: string } };
  email:
    | { transport: 'memory'; from: string }
    | {
        transport: 'smtp';
        from: string;
        host: string;
        port: number;
        secure: boolean;
        user: string | undefined;
        password: string | undefined;
      };
  sms: { provider: 'dev' };
  registrar: { provider: 'dev' | 'none' };
  storage:
    | { driver: 'database' }
    | {
        driver: 's3';
        endpoint: string;
        region: string;
        bucket: string;
        accessKeyId: string;
        secretAccessKey: string;
        forcePathStyle: boolean;
      };
  /** Header the hosting proxy puts the visitor's address in, or undefined to use the socket. */
  clientIpHeader: 'x-real-ip' | 'x-forwarded-for' | undefined;
  /** Bearer token for the serverless timer tick; undefined turns the tick endpoint off. */
  cronSecret: string | undefined;
  privateDetails: { keys: ReadonlyMap<number, Buffer>; activeVersion: number };
};

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `The server can't start because its configuration is incomplete:\n${problems.map((p) => `  - ${p}`).join('\n')}\nFix these in .env (see .env.example) and start again.`,
    );
    this.name = 'ConfigError';
  }
}

function parseKeyRing(raw: string, problems: string[]): Map<number, Buffer> {
  const keys = new Map<number, Buffer>();
  for (const part of raw.split(',')) {
    const [version, b64 = ''] = part.split(':');
    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32)
      problems.push(
        `PRIVATE_DETAILS_KEYS: key version ${version} must decode to exactly 32 bytes.`,
      );
    keys.set(Number(version), key);
  }
  return keys;
}

/** Parses and checks the environment. Throws ConfigError listing every problem at once. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => `${i.path.join('.') || 'environment'}: ${i.message}`),
    );
  }
  const e = parsed.data;
  const problems: string[] = [];
  const keys = parseKeyRing(e.PRIVATE_DETAILS_KEYS, problems);
  if (!keys.has(e.PRIVATE_DETAILS_KEY_VERSION)) {
    problems.push(
      `PRIVATE_DETAILS_KEY_VERSION: version ${e.PRIVATE_DETAILS_KEY_VERSION} is not in PRIVATE_DETAILS_KEYS.`,
    );
  }

  if (e.EMAIL_TRANSPORT === 'smtp' && (!e.SMTP_HOST || !e.SMTP_PORT)) {
    problems.push('SMTP_HOST and SMTP_PORT: required when EMAIL_TRANSPORT=smtp.');
  }

  if (e.STORAGE_DRIVER === 's3') {
    for (const name of [
      'STORAGE_ENDPOINT',
      'STORAGE_BUCKET',
      'STORAGE_ACCESS_KEY_ID',
      'STORAGE_SECRET_ACCESS_KEY',
    ] as const) {
      if (!e[name]) problems.push(`${name}: required when STORAGE_DRIVER=s3.`);
    }
  }

  // A demo runs the production build on a public host, so it gets the https and real-secret
  // checks below, but keeps the dev adapters and dev tools that make it showable.
  const demo = e.APP_ENV === 'demo';
  const production = e.APP_ENV === 'production' || (e.NODE_ENV === 'production' && !demo);
  if (demo && !e.APP_ORIGIN.startsWith('https://'))
    problems.push('APP_ORIGIN: must use https for a public demo.');
  if ((demo || production) && e.PRACTICE_ORIGIN && !e.PRACTICE_ORIGIN.startsWith('https://'))
    problems.push('PRACTICE_ORIGIN: must use https outside development.');
  if (production) {
    if (e.SMS_PROVIDER === 'dev')
      problems.push('SMS_PROVIDER: the dev adapter is not allowed in production.');
    if (e.ENABLE_DEV_TOOLS) problems.push('ENABLE_DEV_TOOLS: must be false in production.');
    if (e.REGISTRAR_PROVIDER === 'dev')
      problems.push('REGISTRAR_PROVIDER: the dev directory is not allowed in production.');
    if (e.EMAIL_TRANSPORT === 'memory') problems.push('EMAIL_TRANSPORT: memory is for tests only.');
    if (!e.APP_ORIGIN.startsWith('https://'))
      problems.push('APP_ORIGIN: must use https in production.');
  }
  if (production || demo) {
    for (const [name, value] of Object.entries(env)) {
      if (
        value?.includes('dev-only') ||
        (name === 'PRIVATE_DETAILS_KEYS' && value?.includes('ZGV2LW9ubHkt'))
      ) {
        problems.push(`${name}: still has the development placeholder from .env.example.`);
      }
    }
  }
  if (problems.length > 0) throw new ConfigError(problems);

  return {
    nodeEnv: e.NODE_ENV,
    appEnv: e.APP_ENV,
    port: e.PORT,
    appOrigin: e.APP_ORIGIN.replace(/\/$/, ''),
    practiceOrigin: e.PRACTICE_ORIGIN?.replace(/\/$/, ''),
    logLevel: e.LOG_LEVEL,
    devTools: e.ENABLE_DEV_TOOLS,
    database: { url: e.DATABASE_URL, ownerUrl: e.DATABASE_OWNER_URL, poolMax: e.DATABASE_POOL_MAX },
    auth: {
      secret: e.BETTER_AUTH_SECRET,
      oidc: {
        issuer: e.OIDC_ISSUER.replace(/\/$/, ''),
        clientId: e.OIDC_CLIENT_ID,
        clientSecret: e.OIDC_CLIENT_SECRET,
      },
    },
    email:
      e.EMAIL_TRANSPORT === 'memory'
        ? { transport: 'memory', from: e.EMAIL_FROM }
        : {
            transport: 'smtp',
            from: e.EMAIL_FROM,
            host: e.SMTP_HOST ?? '',
            port: e.SMTP_PORT ?? 0,
            secure: e.SMTP_SECURE ?? false,
            user: e.SMTP_USER,
            password: e.SMTP_PASSWORD,
          },
    sms: { provider: e.SMS_PROVIDER },
    registrar: { provider: e.REGISTRAR_PROVIDER ?? (production ? 'none' : 'dev') },
    storage:
      e.STORAGE_DRIVER === 'database'
        ? { driver: 'database' }
        : {
            driver: 's3',
            endpoint: e.STORAGE_ENDPOINT ?? '',
            region: e.STORAGE_REGION,
            bucket: e.STORAGE_BUCKET ?? '',
            accessKeyId: e.STORAGE_ACCESS_KEY_ID ?? '',
            secretAccessKey: e.STORAGE_SECRET_ACCESS_KEY ?? '',
            forcePathStyle: e.STORAGE_FORCE_PATH_STYLE,
          },
    clientIpHeader: e.TRUSTED_CLIENT_IP_HEADER,
    cronSecret: e.CRON_SECRET,
    privateDetails: { keys, activeVersion: e.PRIVATE_DETAILS_KEY_VERSION },
  };
}

/**
 * The sign-in methods this deployment offers. The public demo (APP_ENV=demo) has no SSO or SMS
 * provider: with an SMTP service it signs anyone in by email code; without one no code can be
 * delivered, and people pick a sample account on /dev/tools instead.
 */
export function signInMethods(config: Pick<Config, 'appEnv' | 'email'>): {
  sso: boolean;
  phone: boolean;
  emailCodes: boolean;
  anyEmail: boolean;
} {
  const demo = config.appEnv === 'demo';
  const delivers = config.email.transport === 'smtp';
  return { sso: !demo, phone: !demo, emailCodes: !demo || delivers, anyEmail: demo && delivers };
}

/** The addresses browsers may send requests from: the app, and practice mode's own address. */
export function trustedOrigins(config: Pick<Config, 'appOrigin' | 'practiceOrigin'>): string[] {
  return config.practiceOrigin ? [config.appOrigin, config.practiceOrigin] : [config.appOrigin];
}

/** Finds the repository root (the folder with pnpm-workspace.yaml) from this file. */
export function repoRoot(): string {
  let dir = import.meta.dirname;
  while (!existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
    const parent = path.dirname(dir);
    if (parent === dir)
      throw new Error('Could not find the repository root (pnpm-workspace.yaml).');
    dir = parent;
  }
  return dir;
}

/** Loads the root .env into process.env outside production. Variables already set win. */
export function loadDotEnv(): void {
  if (process.env['NODE_ENV'] === 'production') return;
  const file = path.join(repoRoot(), '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}
