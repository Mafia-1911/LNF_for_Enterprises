// Runs before `pnpm dev`: creates .env from .env.example on first run, waits for Postgres,
// applies migrations and loads the seed data (idempotent). Development only.
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadDotEnv, repoRoot } from './platform/config';
import { runMigrations } from './platform/db/migrate';
import { runSeed } from './seed';

const root = repoRoot();
const envFile = path.join(root, '.env');
if (!existsSync(envFile)) {
  copyFileSync(path.join(root, '.env.example'), envFile);
  process.stdout.write('Created .env from .env.example (local development values).\n');
}
loadDotEnv();

const ownerUrl = process.env['DATABASE_OWNER_URL'] ?? '';
async function waitForPostgres(timeoutMs: number): Promise<void> {
  const started = performance.now();
  for (;;) {
    const client = new pg.Client({ connectionString: ownerUrl });
    try {
      await client.connect();
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      if (performance.now() - started > timeoutMs) {
        process.stderr.write(
          "Postgres isn't reachable; start the local services with: docker compose -f infra/docker-compose.dev.yml up -d\n",
        );
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

await waitForPostgres(60_000);
await runMigrations(ownerUrl, path.join(import.meta.dirname, '../migrations'));
const summary = await runSeed();
process.stdout.write(`Database ready (${summary}).\n`);
