// Environment for API tests. Values are local test placeholders, never real secrets.
export const TEMPLATE_DB = 'lf_test_template';
const host = process.env['LF_TEST_PG_HOST'] ?? 'localhost';
const port = process.env['LF_TEST_PG_PORT'] ?? '54320';

export const ownerUrl = (db: string) => `postgres://lf_owner:owner-dev-only@${host}:${port}/${db}`;
export const appUrl = (db: string) => `postgres://lf_app:app-dev-only@${host}:${port}/${db}`;

export function testEnv(db: string): Record<string, string> {
  return {
    NODE_ENV: 'test',
    APP_ENV: 'test',
    PORT: '3999',
    APP_ORIGIN: 'http://nsu.test',
    LOG_LEVEL: process.env['LOG_LEVEL'] ?? 'silent',
    ENABLE_DEV_TOOLS: 'true',
    DATABASE_URL: appUrl(db),
    DATABASE_OWNER_URL: ownerUrl(db),
    DATABASE_POOL_MAX: '4',
    BETTER_AUTH_SECRET: 'test-only-secret-0123456789abcdef0123456789',
    OIDC_ISSUER: 'http://localhost:8090/nsu',
    OIDC_CLIENT_ID: 'nsu-lost-and-found',
    OIDC_CLIENT_SECRET: 'test-only-oidc-secret',
    EMAIL_TRANSPORT: 'memory',
    EMAIL_FROM: 'NSU Lost & Found <no-reply@lostfound.test>',
    SMS_PROVIDER: 'dev',
    STORAGE_ENDPOINT: 'http://localhost:9100',
    STORAGE_BUCKET: 'lostfound-dev',
    STORAGE_ACCESS_KEY_ID: 'lf-dev-minio',
    STORAGE_SECRET_ACCESS_KEY: 'minio-dev-only-password',
    PRIVATE_DETAILS_KEYS: `1:${Buffer.alloc(32, 9).toString('base64')}`,
    PRIVATE_DETAILS_KEY_VERSION: '1',
  };
}

/** Local superuser, only for tests that simulate a DBA tampering with the audit log. */
export const superUrl = (db: string) =>
  `postgres://postgres:postgres-dev-only@${host}:${port}/${db}`;
