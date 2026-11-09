// pnpm db:migrate — applies migrations as the owner role (DATABASE_OWNER_URL).
import path from 'node:path';
import { loadDotEnv } from './platform/config';
import { runMigrations } from './platform/db/migrate';

loadDotEnv();
const ownerUrl = process.env['DATABASE_OWNER_URL'];
if (!ownerUrl) {
  process.stderr.write(
    'DATABASE_OWNER_URL is not set; add it to .env (see .env.example) and try again.\n',
  );
  process.exit(1);
}
await runMigrations(ownerUrl, path.join(import.meta.dirname, '../migrations'));
process.stdout.write('Migrations applied.\n');
