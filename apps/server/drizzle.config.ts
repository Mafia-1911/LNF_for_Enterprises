// drizzle-kit: generates SQL migrations from every schema.ts (platform and modules).
// Runs as the owner role. Usage: pnpm db:generate (schema changes), pnpm db:migrate (apply).
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/platform/*/schema.ts', './src/modules/*/schema.ts'],
  out: './migrations',
  dbCredentials: {
    url:
      process.env['DATABASE_OWNER_URL'] ??
      'postgres://lf_owner:owner-dev-only@localhost:54320/lostfound',
  },
  migrations: { schema: 'drizzle' },
  strict: true,
  verbose: false,
});
