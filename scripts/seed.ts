// pnpm db:seed — idempotent seed: NSU tenant, practice tenant, catalog, people, holidays.
import { runSeed } from '@lf/server/cli';
import { out } from './lib';

out(`Seeded: ${await runSeed()}.`);
