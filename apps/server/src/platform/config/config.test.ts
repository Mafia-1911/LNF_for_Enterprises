import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from './index';

const KEY = Buffer.alloc(32, 7).toString('base64');
const base: Record<string, string> = {
  NODE_ENV: 'development',
  APP_ENV: 'development',
  PORT: '3000',
  APP_ORIGIN: 'http://localhost:5173/',
  ENABLE_DEV_TOOLS: 'true',
  DATABASE_URL: 'postgres://lf_app:x@localhost:54320/lostfound',
  BETTER_AUTH_SECRET: 'a'.repeat(40),
  OIDC_ISSUER: 'http://localhost:8090/nsu/',
  OIDC_CLIENT_ID: 'id',
  OIDC_CLIENT_SECRET: 'secret',
  EMAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_USER: '',
  EMAIL_FROM: 'NSU <no-reply@example.test>',
  SMS_PROVIDER: 'dev',
  STORAGE_ENDPOINT: 'http://localhost:9100',
  STORAGE_BUCKET: 'bucket',
  STORAGE_ACCESS_KEY_ID: 'k',
  STORAGE_SECRET_ACCESS_KEY: 's',
  PRIVATE_DETAILS_KEYS: `1:${KEY},2:${KEY}`,
  PRIVATE_DETAILS_KEY_VERSION: '2',
};

function problems(env: Record<string, string>): string[] {
  try {
    parseConfig(env);
    return [];
  } catch (err) {
    if (err instanceof ConfigError) return err.problems;
    throw err;
  }
}

describe('parseConfig', () => {
  it('parses a complete development environment', () => {
    const config = parseConfig(base);
    expect(config.appOrigin).toBe('http://localhost:5173');
    expect(config.auth.oidc.issuer).toBe('http://localhost:8090/nsu');
    expect(config.privateDetails.activeVersion).toBe(2);
    expect(config.privateDetails.keys.get(1)).toHaveLength(32);
    expect(config.email).toMatchObject({
      transport: 'smtp',
      host: 'localhost',
      port: 1025,
      user: undefined,
    });
    expect(config.logLevel).toBe('info');
  });

  it('lists every missing or invalid variable at once, with a next step', () => {
    const env: Record<string, string> = { ...base, PORT: 'abc', BETTER_AUTH_SECRET: 'short' };
    delete env['DATABASE_URL'];
    const found = problems(env);
    expect(found.some((p) => p.startsWith('DATABASE_URL'))).toBe(true);
    expect(found.some((p) => p.startsWith('PORT'))).toBe(true);
    expect(found.some((p) => p.startsWith('BETTER_AUTH_SECRET'))).toBe(true);
    try {
      parseConfig(env);
    } catch (err) {
      expect((err as Error).message).toContain('see .env.example');
    }
  });

  it('rejects a key version that is not in the key ring', () => {
    expect(problems({ ...base, PRIVATE_DETAILS_KEY_VERSION: '3' })).toEqual([
      'PRIVATE_DETAILS_KEY_VERSION: version 3 is not in PRIVATE_DETAILS_KEYS.',
    ]);
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(
      problems({
        ...base,
        PRIVATE_DETAILS_KEYS: `1:${Buffer.alloc(16).toString('base64')}`,
        PRIVATE_DETAILS_KEY_VERSION: '1',
      }),
    ).toEqual(['PRIVATE_DETAILS_KEYS: key version 1 must decode to exactly 32 bytes.']);
  });

  it('needs SMTP host and port when the transport is smtp', () => {
    const env = { ...base };
    delete env['SMTP_HOST'];
    expect(problems(env)).toEqual(['SMTP_HOST and SMTP_PORT: required when EMAIL_TRANSPORT=smtp.']);
  });

  it('refuses development settings in production', () => {
    const found = problems({
      ...base,
      NODE_ENV: 'production',
      APP_ENV: 'production',
      EMAIL_TRANSPORT: 'memory',
      OIDC_CLIENT_SECRET: 'dev-only-oidc-client-secret',
    });
    expect(found).toEqual(
      expect.arrayContaining([
        'SMS_PROVIDER: the dev adapter is not allowed in production.',
        'ENABLE_DEV_TOOLS: must be false in production.',
        'EMAIL_TRANSPORT: memory is for tests only.',
        'APP_ORIGIN: must use https in production.',
        'OIDC_CLIENT_SECRET: still has the development placeholder from .env.example.',
      ]),
    );
  });

  it('refuses the .env.example encryption key in production', () => {
    const found = problems({
      ...base,
      NODE_ENV: 'production',
      APP_ENV: 'production',
      ENABLE_DEV_TOOLS: 'false',
      APP_ORIGIN: 'https://lostfound.example.edu',
      PRIVATE_DETAILS_KEYS: '1:ZGV2LW9ubHkta2V5LWRvLW5vdC11c2UtaW4tcHJvZCE=',
      PRIVATE_DETAILS_KEY_VERSION: '1',
    });
    expect(found).toContain(
      'PRIVATE_DETAILS_KEYS: still has the development placeholder from .env.example.',
    );
  });

  it('runs a public demo with the dev adapters but still needs https and real secrets', () => {
    const demo = {
      ...base,
      NODE_ENV: 'production',
      APP_ENV: 'demo',
      APP_ORIGIN: 'https://lostfound-demo.example.app',
      EMAIL_TRANSPORT: 'memory',
      STORAGE_DRIVER: 'database',
      STORAGE_ENDPOINT: '',
      TRUSTED_CLIENT_IP_HEADER: 'x-real-ip',
    };
    const config = parseConfig(demo);
    expect(config).toMatchObject({
      appEnv: 'demo',
      devTools: true,
      sms: { provider: 'dev' },
      registrar: { provider: 'dev' },
      storage: { driver: 'database' },
      clientIpHeader: 'x-real-ip',
    });
    expect(
      problems({
        ...demo,
        APP_ORIGIN: 'http://lostfound-demo.example.app',
        BETTER_AUTH_SECRET: 'dev-only-better-auth-secret-change-me-0000',
      }),
    ).toEqual([
      'APP_ORIGIN: must use https for a public demo.',
      'BETTER_AUTH_SECRET: still has the development placeholder from .env.example.',
    ]);
  });

  it('needs the bucket settings only for the s3 storage driver', () => {
    const env = { ...base };
    delete env['STORAGE_ENDPOINT'];
    delete env['STORAGE_ACCESS_KEY_ID'];
    expect(problems(env)).toEqual([
      'STORAGE_ENDPOINT: required when STORAGE_DRIVER=s3.',
      'STORAGE_ACCESS_KEY_ID: required when STORAGE_DRIVER=s3.',
    ]);
    expect(parseConfig({ ...env, STORAGE_DRIVER: 'database' }).storage).toEqual({
      driver: 'database',
    });
  });
});
