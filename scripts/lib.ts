// Shared helpers for root scripts: config from .env (or .env.example) and an app instance for
// reading its routes and OpenAPI document (no database connection is opened for that).
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  createApp,
  createLogger,
  createServices,
  loadDotEnv,
  parseConfig,
  repoRoot,
} from '@lf/server/cli';

export function loadConfig() {
  loadDotEnv();
  if (!existsSync(path.join(repoRoot(), '.env')))
    process.loadEnvFile(path.join(repoRoot(), '.env.example'));
  return parseConfig(process.env);
}

/** The full app with dev tools on, so every route that can exist is listed. */
export function inspectApp() {
  const config = { ...loadConfig(), devTools: true };
  const services = createServices(config, createLogger({ level: 'silent', pretty: false }));
  return { app: createApp(services, { webDist: null, jobsRunning: () => true }), services };
}

export function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function fail(line: string): never {
  process.stderr.write(`${line}\n`);
  process.exit(1);
}
