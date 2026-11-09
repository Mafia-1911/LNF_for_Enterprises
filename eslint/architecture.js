// Architecture rules from plan §3.2, enforced by lint. Kept separate from the style rules so
// eslint/architecture.test.ts can check every rule against small fixture imports.
//
//  1. A module may import another module only through its index.ts.
//  2. schema.ts and repo.ts can't be imported from outside their module.
//     (One exception, ADR-0011: a schema.ts may import another module's schema.ts, for foreign keys.)
//  3. The raw pool (platform/db/pool.ts) can only be imported by repo.ts files and platform/*.
//     Services also may not reach into `tx.db`; they pass `tx` to a repo function.
//  4. Date.now() and new Date() with no arguments are banned outside the clock files.
//  5. console.* is banned; use the logger.
//
// boundaries/dependencies evaluates policies in order and the last matching one wins, so each
// group below opens access first and then closes the exceptions.
import boundaries from 'eslint-plugin-boundaries';

const MODULE = 'server-module';
const PLATFORM = 'server-platform';

/** Folders the boundaries plugin classifies. Order matters: most specific first. */
export const elements = [
  { type: MODULE, pattern: 'apps/server/src/modules/*', capture: ['module'], partialMatch: false },
  { type: PLATFORM, pattern: 'apps/server/src/platform/*', capture: ['part'], partialMatch: false },
  { type: 'server-test', pattern: 'apps/server/test', partialMatch: false },
  { type: 'server-app', pattern: 'apps/server/src', partialMatch: false },
  { type: 'server-config', pattern: 'apps/server', partialMatch: false },
  { type: 'web', pattern: 'apps/web/src', partialMatch: false },
  { type: 'web-config', pattern: 'apps/web', partialMatch: false },
  { type: 'domain', pattern: 'packages/domain/src', partialMatch: false },
  { type: 'contracts', pattern: 'packages/contracts/src', partialMatch: false },
  { type: 'ui', pattern: 'packages/ui/src', partialMatch: false },
  { type: 'ui-scripts', pattern: 'packages/ui/scripts', partialMatch: false },
  { type: 'scripts', pattern: 'scripts', partialMatch: false },
  { type: 'e2e', pattern: 'e2e', partialMatch: false },
  { type: 'lint', pattern: 'eslint', partialMatch: false },
];

const el = (type, extra = {}) => ({ element: { type, ...extra } });
const moduleFile = (file) => el(MODULE, { fileInternalPath: file });
const POOL = el(PLATFORM, { captured: { part: 'db' }, fileInternalPath: 'pool.ts' });

const MODULE_ENTRY_MESSAGE =
  'Import another module only through its index.ts (plan §3.2 rules 1–2). Export what you need from that index.';
const POOL_MESSAGE =
  'Only repo.ts files and platform/* may import the raw pool (plan §3.2 rule 3). Use withTx() from platform/db/tx and a repo function.';

const allowTo = (fromType, tos) => ({
  from: el(fromType),
  allow: { to: tos.map((t) => (typeof t === 'string' ? el(t) : t)) },
});

/** Who may depend on whom. Anything not listed is an error. Same-element imports are not checked. */
export const dependencyPolicies = [
  // Package layering
  allowTo('contracts', ['domain']),
  allowTo('web', ['ui', 'contracts', 'domain']),
  allowTo('web-config', ['web', 'ui']),
  allowTo('ui-scripts', ['ui']),
  allowTo('scripts', ['server-app', 'contracts', 'domain']),
  allowTo('e2e', ['contracts', 'domain']),
  allowTo('lint', ['lint']),

  // Server: platform never depends on modules
  allowTo(PLATFORM, [PLATFORM, 'contracts', 'domain']),

  // Server modules: other modules through index.ts only (rules 1–2)
  allowTo(MODULE, [PLATFORM, 'contracts', 'domain']),
  { from: el(MODULE), disallow: { to: el(MODULE) }, message: MODULE_ENTRY_MESSAGE },
  { from: el(MODULE), allow: { to: moduleFile('index.ts') } },
  // ADR-0011: schema.ts may reference another module's schema.ts for foreign keys
  { from: moduleFile('schema.ts'), allow: { to: moduleFile('schema.ts') } },
  // Rule 3: the raw pool is for repo.ts files only
  { from: el(MODULE), disallow: { to: POOL }, message: POOL_MESSAGE },
  { from: moduleFile('repo.ts'), allow: { to: POOL } },

  // Composition root (app.ts, main.ts, cli.ts): module index, routes and jobs; any platform file
  allowTo('server-app', [
    PLATFORM,
    'contracts',
    'domain',
    moduleFile('index.ts'),
    moduleFile('routes.ts'),
    moduleFile('jobs.ts'),
  ]),
  // Test harness: public module surface, platform (including the pool for DB assertions), app
  allowTo('server-test', [PLATFORM, 'server-app', 'contracts', 'domain', moduleFile('index.ts')]),
  // drizzle.config.ts and vitest config
  allowTo('server-config', [PLATFORM, 'server-app']),
];

const DATE_SELECTORS = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'Use clock.now() from platform/clock (or lib/clock in the web app) instead of new Date() (plan §3.2 rule 4).',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message:
      'Use clock.now() from platform/clock (or lib/clock in the web app) instead of Date.now() (plan §3.2 rule 4).',
  },
];
const TX_DB_SELECTOR = {
  selector: "MemberExpression[object.name='tx'][property.name='db']",
  message:
    'Only repo.ts files and platform/* may use tx.db. Pass tx to a repo function instead (plan §3.2 rule 3).',
};

const CLOCK_FILES = ['apps/server/src/platform/clock/**', 'apps/web/src/lib/clock.ts'];
const TX_DB_ALLOWED = [
  'apps/server/src/modules/*/repo.ts',
  'apps/server/src/platform/**',
  'apps/server/test/**',
];

/** @type {import('eslint').Linter.Config[]} */
export const architecture = [
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': elements,
      'boundaries/include': ['apps/**', 'packages/**', 'scripts/**', 'e2e/**', 'eslint/**'],
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          noWarnOnMultipleProjects: true,
          project: ['tsconfig.json', 'apps/*/tsconfig.json', 'packages/*/tsconfig.json'],
        },
        node: true,
      },
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', policies: dependencyPolicies }],
      'no-console': 'error',
      'no-restricted-syntax': ['error', ...DATE_SELECTORS, TX_DB_SELECTOR],
    },
  },
  // Rule 3: repo files, platform and the test harness may use tx.db directly.
  {
    files: TX_DB_ALLOWED,
    rules: { 'no-restricted-syntax': ['error', ...DATE_SELECTORS] },
  },
  // Rule 4: the clock files are the only allowed source of "now".
  {
    files: CLOCK_FILES,
    rules: { 'no-restricted-syntax': ['error', TX_DB_SELECTOR] },
  },
];
