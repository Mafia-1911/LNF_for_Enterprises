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
  APP_ENV: z.enum(
    ['development', 'test', 'staging', 'production'],
    'Use development, test, staging or production.',
  ),
  PORT: z.coerce.number('Must be a number.').int().min(1).max(65535),
  APP_ORIGIN: z.url('Must be a full URL such as http://localhost:5173.'),
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
  STORAGE_ENDPOINT: z.url('Must be the S3-compatible endpoint URL.'),
  STORAGE_REGION: z.string().min(1).default('auto'),
  STORAGE_BUCKET: z.string('Required.').min(3, 'Required.'),
  STORAGE_ACCESS_KEY_ID: z.string('Required.').min(1, 'Required.'),
  STORAGE_SECRET_ACCESS_KEY: z.string('Required.').min(1, 'Required.'),
  STORAGE_FORCE_PATH_STYLE: bool.default(true),
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
  storage: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  };
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

  const production = e.NODE_ENV === 'production' || e.APP_ENV === 'production';
  if (production) {
    if (e.SMS_PROVIDER === 'dev')
      problems.push('SMS_PROVIDER: the dev adapter is not allowed in production.');
    if (e.ENABLE_DEV_TOOLS) problems.push('ENABLE_DEV_TOOLS: must be false in production.');
    if (e.EMAIL_TRANSPORT === 'memory') problems.push('EMAIL_TRANSPORT: memory is for tests only.');
    if (!e.APP_ORIGIN.startsWith('https://'))
      problems.push('APP_ORIGIN: must use https in production.');
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
    storage: {
      endpoint: e.STORAGE_ENDPOINT,
      region: e.STORAGE_REGION,
      bucket: e.STORAGE_BUCKET,
      accessKeyId: e.STORAGE_ACCESS_KEY_ID,
      secretAccessKey: e.STORAGE_SECRET_ACCESS_KEY,
      forcePathStyle: e.STORAGE_FORCE_PATH_STYLE,
    },
    privateDetails: { keys, activeVersion: e.PRIVATE_DETAILS_KEY_VERSION },
  };
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
