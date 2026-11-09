// Starts the server: config (refuses to start if incomplete), services, pg-boss workers and cron,
// then HTTP. On SIGINT/SIGTERM it stops accepting requests, lets running jobs finish, then exits.
import path from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { ConfigError, loadDotEnv, parseConfig, repoRoot } from './platform/config';
import { closeDatabase } from './platform/db/pool';
import { ensureQueues, startWorkers, stopBoss } from './platform/jobs';
import { createLogger } from './platform/logger';
import { createServices } from './services';

loadDotEnv();

function loadConfigOrExit() {
  try {
    return parseConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

const config = loadConfigOrExit();
const logger = createLogger({ level: config.logLevel, pretty: config.nodeEnv === 'development' });
const services = createServices(config, logger);

let jobsRunning = false;
await services.boss.start();
await ensureQueues(services.boss, services.jobs);
await startWorkers(services.boss, services.jobs);
jobsRunning = true;

const webDist = config.nodeEnv === 'production' ? path.join(repoRoot(), 'apps/web/dist') : null;
const app = createApp(services, { webDist, jobsRunning: () => jobsRunning });

const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: config.nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1',
  },
  (info) => {
    logger.info(
      { port: info.port, appOrigin: config.appOrigin, devTools: config.devTools },
      'Lost & Found server listening',
    );
  },
);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'Shutting down: no new requests, finishing running jobs');
  server.close();
  jobsRunning = false;
  await stopBoss(services.boss);
  await closeDatabase(services.db);
  logger.info('Stopped');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
