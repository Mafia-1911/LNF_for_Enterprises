// pnpm gen:api — writes the server's OpenAPI document and generates the typed web client types:
//   apps/web/src/api/openapi.json  and  apps/web/src/api/schema.d.ts (openapi-typescript)
// CI runs this and fails if either file changed (the client is out of date).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { API_INFO, closeDatabase, repoRoot } from '@lf/server/cli';
import { inspectApp, out } from './lib';

const { app, services } = inspectApp();
const document = app.getOpenAPI31Document(API_INFO);
await closeDatabase(services.db);

const apiDir = path.join(repoRoot(), 'apps/web/src/api');
mkdirSync(apiDir, { recursive: true });
const jsonFile = path.join(apiDir, 'openapi.json');
writeFileSync(jsonFile, `${JSON.stringify(document, null, 2)}\n`);
execFileSync(
  'pnpm',
  [
    '--filter',
    '@lf/web',
    'exec',
    'openapi-typescript',
    'src/api/openapi.json',
    '-o',
    'src/api/schema.d.ts',
    '--alphabetize',
  ],
  {
    cwd: repoRoot(),
    stdio: ['ignore', 'ignore', 'inherit'],
  },
);
// Format both files the way the commit hook does, so a fresh run matches what was committed and the
// CI "client up to date" check compares content, not whitespace.
execFileSync(
  'pnpm',
  ['exec', 'prettier', '--write', 'apps/web/src/api/openapi.json', 'apps/web/src/api/schema.d.ts'],
  { cwd: repoRoot(), stdio: ['ignore', 'ignore', 'inherit'] },
);
out(
  `Wrote ${path.relative(repoRoot(), jsonFile)} and src/api/schema.d.ts (${Object.keys(document.paths ?? {}).length} paths).`,
);
