// pnpm build:vercel — builds the public demo for Vercel's Build Output API (docs/deploy-vercel.md):
//   .vercel/output/static/            the web app built in demo mode (dev tools live on /dev/tools)
//   .vercel/output/functions/api.func the server (apps/server/src/vercel.ts) bundled into one ESM
//                                     file, plus sharp's Linux binaries (native, so not bundled)
//   .vercel/output/config.json        /api/* and /healthz go to the function, then files, then the
//                                     SPA fallback; security headers; a daily timer tick
// Deploy the result with: vercel deploy --prebuilt --prod
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { repoRoot } from '@lf/server/cli';
import { out } from './lib';

const root = repoRoot();
const output = path.join(root, '.vercel/output');
const func = path.join(output, 'functions/api.func');
const run = (cmd: string, args: string[], cwd = root) =>
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });

rmSync(output, { recursive: true, force: true });
mkdirSync(func, { recursive: true });

out('1/4 Web app (demo mode)');
run('pnpm', [
  '--filter',
  '@lf/web',
  'exec',
  'vite',
  'build',
  '--mode',
  'demo',
  '--outDir',
  path.join(output, 'static'),
  '--emptyOutDir',
]);

out('2/4 Server function');
await build({
  entryPoints: [path.join(root, 'apps/server/src/vercel.ts')],
  outfile: path.join(func, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // sharp loads a native library; pg-native is an optional driver we don't use.
  external: ['sharp', 'pg-native'],
  // Some bundled packages are CommonJS and call require(); give the ESM bundle one.
  banner: {
    js: "import { createRequire as lfCreateRequire } from 'node:module'; const require = lfCreateRequire(import.meta.url);",
  },
  legalComments: 'none',
  logLevel: 'warning',
});

out('3/4 Native packages for the function (sharp, linux-x64)');
const serverPkg = JSON.parse(readFileSync(path.join(root, 'apps/server/package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};
writeFileSync(
  path.join(func, 'package.json'),
  `${JSON.stringify({ private: true, type: 'module', dependencies: { sharp: serverPkg.dependencies['sharp'] } }, null, 2)}\n`,
);
run(
  'npm',
  [
    'install',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    '--no-package-lock',
    '--ignore-scripts',
    '--os=linux',
    '--cpu=x64',
    '--libc=glibc',
  ],
  func,
);
writeFileSync(
  path.join(func, '.vc-config.json'),
  `${JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: 30,
      regions: ['sin1'],
    },
    null,
    2,
  )}\n`,
);

out('4/4 Routes and headers');
// The same policy the server sends with the SPA when it serves it itself (app.ts).
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');
const pageHeaders = {
  'Content-Security-Policy': csp,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
writeFileSync(
  path.join(output, 'config.json'),
  `${JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/(api/.*|healthz)$', dest: '/api' },
        {
          src: '^/assets/(.*)$',
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
          continue: true,
        },
        { src: '^/(.*)$', headers: pageHeaders, continue: true },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
      // 01:00 in Dhaka: timers still run on days with no visitors (Hobby plans allow one a day).
      crons: [{ path: '/api/cron/tick', schedule: '0 19 * * *' }],
    },
    null,
    2,
  )}\n`,
);
out(`Built ${path.relative(root, output)}. Deploy it with: vercel deploy --prebuilt --prod`);
