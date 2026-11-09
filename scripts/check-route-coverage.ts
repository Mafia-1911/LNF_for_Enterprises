// Fails when an API route has no API test (plan §5.3, §12.4). The API test harness records every
// route it calls into apps/server/.route-coverage/*.json; run `pnpm test:api` first.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { closeDatabase, repoRoot } from '@lf/server/cli';
import { fail, inspectApp, out } from './lib';

const dir = path.join(repoRoot(), 'apps/server/.route-coverage');
if (!existsSync(dir)) fail('No route coverage found; run `pnpm test:api` first.');

const tested = new Set<string>();
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  for (const route of JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as string[])
    tested.add(route);
}

const { app, services } = inspectApp();
const routes = [
  ...new Set(app.routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path}`)),
].sort();
await closeDatabase(services.db);

const missing = routes.filter((r) => !tested.has(r));
if (missing.length > 0) {
  fail(
    `These routes have no API test (add one under apps/server/test/api):\n${missing.map((r) => `  - ${r}`).join('\n')}`,
  );
}
out(`Route coverage: all ${routes.length} routes have API tests.`);
