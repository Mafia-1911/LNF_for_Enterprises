// Proves each architecture rule in eslint/architecture.js fires (and stays quiet when it should).
// Snippets are linted as if they lived at paths inside eslint/fixtures.
import path from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { architecture } from './architecture.js';

const root = path.join(import.meta.dirname, 'fixtures');

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
    ...architecture,
    {
      settings: {
        'boundaries/root-path': root,
        'import/resolver': { node: { extensions: ['.ts', '.js'] } },
      },
    },
  ],
});

async function ruleIds(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
}

const BETA_SERVICE = 'apps/server/src/modules/beta/service.ts';

describe('rule 1–2: other modules only through index.ts', () => {
  it('allows importing another module through its index', async () => {
    expect(
      await ruleIds(
        BETA_SERVICE,
        "import { indexValue } from '../alpha/index';\nexport const x = indexValue;",
      ),
    ).toEqual([]);
  });
  it.each(['repo', 'schema', 'service'])('rejects importing alpha/%s from beta', async (file) => {
    expect(
      await ruleIds(
        BETA_SERVICE,
        `import { ${file}Value } from '../alpha/${file}';\nexport const x = ${file}Value;`,
      ),
    ).toContain('boundaries/dependencies');
  });
  it('allows a module to import its own internals', async () => {
    expect(
      await ruleIds(
        BETA_SERVICE,
        "import { repoValue } from './repo';\nexport const x = repoValue;",
      ),
    ).toEqual([]);
  });
  it('allows schema.ts to import another schema.ts for foreign keys (ADR-0011)', async () => {
    expect(
      await ruleIds(
        'apps/server/src/modules/beta/schema.ts',
        "import { schemaValue } from '../alpha/schema';\nexport const x = schemaValue;",
      ),
    ).toEqual([]);
  });
  it('still rejects schema.ts importing another module repo', async () => {
    expect(
      await ruleIds(
        'apps/server/src/modules/beta/schema.ts',
        "import { repoValue } from '../alpha/repo';\nexport const x = repoValue;",
      ),
    ).toContain('boundaries/dependencies');
  });
});

describe('rule 3: raw pool only in repo.ts and platform', () => {
  const importPool = "import { pool } from '../../platform/db/pool';\nexport const x = pool;";
  it('rejects the pool in a service', async () => {
    expect(await ruleIds(BETA_SERVICE, importPool)).toContain('boundaries/dependencies');
  });
  it('allows the pool in a repo', async () => {
    expect(await ruleIds('apps/server/src/modules/beta/repo.ts', importPool)).toEqual([]);
  });
  it('allows withTx in a service', async () => {
    expect(
      await ruleIds(
        BETA_SERVICE,
        "import { withTx } from '../../platform/db/tx';\nexport const x = withTx;",
      ),
    ).toEqual([]);
  });
  it('rejects tx.db in a service but allows it in a repo', async () => {
    const code = 'export const f = (tx: { db: unknown }) => tx.db;';
    expect(await ruleIds(BETA_SERVICE, code)).toContain('no-restricted-syntax');
    expect(await ruleIds('apps/server/src/modules/beta/repo.ts', code)).toEqual([]);
  });
});

describe('composition root and test harness', () => {
  it('lets app.ts import module routes', async () => {
    expect(
      await ruleIds(
        'apps/server/src/app.ts',
        "import { indexValue } from './modules/alpha/index';\nimport { serviceValue } from './modules/alpha/service';\nexport const x = [indexValue, serviceValue];",
      ),
    ).toEqual(['boundaries/dependencies']);
  });
  it('lets the test harness use the pool but not module internals', async () => {
    expect(
      await ruleIds(
        'apps/server/test/db.ts',
        "import { pool } from '../src/platform/db/pool';\nexport const x = pool;",
      ),
    ).toEqual([]);
    expect(
      await ruleIds(
        'apps/server/test/db.ts',
        "import { repoValue } from '../src/modules/alpha/repo';\nexport const x = repoValue;",
      ),
    ).toContain('boundaries/dependencies');
  });
});

describe('rule 4: no implicit "now" outside the clock', () => {
  it.each(['export const t = Date.now();', 'export const t = new Date();'])(
    'rejects %s in a service',
    async (code) => {
      expect(await ruleIds(BETA_SERVICE, code)).toContain('no-restricted-syntax');
    },
  );
  it('allows new Date(value)', async () => {
    expect(
      await ruleIds(BETA_SERVICE, "export const t = new Date('2026-11-08T10:00:00Z');"),
    ).toEqual([]);
  });
  it('allows Date.now() inside platform/clock', async () => {
    expect(
      await ruleIds('apps/server/src/platform/clock/system.ts', 'export const t = Date.now();'),
    ).toEqual([]);
  });
});

describe('rule 5: no console', () => {
  it('rejects console.log', async () => {
    expect(await ruleIds(BETA_SERVICE, "console.log('hi');")).toContain('no-console');
  });
});

describe('layering between packages', () => {
  it('rejects domain importing server code', async () => {
    expect(
      await ruleIds(
        'packages/domain/src/ids.ts',
        "import { indexValue } from '../../../apps/server/src/modules/alpha/index';\nexport const x = indexValue;",
      ),
    ).toContain('boundaries/dependencies');
  });
  it('rejects the web app importing server code', async () => {
    expect(
      await ruleIds(
        'apps/web/src/page.ts',
        "import { indexValue } from '../../server/src/modules/alpha/index';\nexport const x = indexValue;",
      ),
    ).toContain('boundaries/dependencies');
  });
  it('rejects platform importing a module', async () => {
    expect(
      await ruleIds(
        'apps/server/src/platform/db/tx.ts',
        "import { indexValue } from '../../modules/alpha/index';\nexport const x = indexValue;",
      ),
    ).toContain('boundaries/dependencies');
  });
  it('allows the web app to import domain', async () => {
    expect(
      await ruleIds(
        'apps/web/src/page.ts',
        "import { pure } from '../../../packages/domain/src/index';\nexport const x = pure;",
      ),
    ).toEqual([]);
  });
});
