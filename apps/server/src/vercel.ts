// Vercel entry for the public demo (APP_ENV=demo; see docs/deploy-vercel.md). One Node function
// serves /api/* and /healthz; Vercel's CDN serves the built web app. Serverless functions can't keep
// pg-boss workers running, so after a request the function drains queued jobs (and queues due
// timers) in the background with Vercel's waitUntil. A daily Vercel cron calls /api/cron/tick so
// the timers also run on days nobody visits. scripts/build-vercel.ts bundles this file.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import { createApp } from './app';
import { systemClock } from './platform/clock';
import { parseConfig } from './platform/config';
import { drainJobs, ensureQueues, sendDueSchedules } from './platform/jobs';
import { createLogger } from './platform/logger';
import { createServices } from './services';

const config = parseConfig(process.env);
const logger = createLogger({ level: config.logLevel, pretty: false });
const services = createServices(config, logger, { serverless: true });
const app = createApp(services, { webDist: null, jobsRunning: () => true });
const listener = getRequestListener(app.fetch);

let started: Promise<void> | null = null;
function start(): Promise<void> {
  started ??= (async () => {
    await services.boss.start();
    await ensureQueues(services.boss, services.jobs);
  })();
  return started;
}

const now = () => systemClock.now().getTime();
const SCHEDULE_EVERY_MS = 60_000;
const IDLE_DRAIN_EVERY_MS = 15_000;
let lastSchedule = 0;
let lastDrain = 0;
let draining: Promise<void> | null = null;

/** Queues due timers (at most once a minute per instance) and runs queued jobs for up to 8 s. */
function background(): Promise<void> {
  draining ??= (async () => {
    lastDrain = now();
    try {
      if (now() - lastSchedule > SCHEDULE_EVERY_MS) {
        lastSchedule = now();
        await sendDueSchedules(services.boss, services.jobs);
      }
      await drainJobs(services.boss, services.jobs, { budgetMs: 8_000, now, logger });
    } catch (err) {
      logger.error({ err }, 'Background jobs failed; the next request tries again');
    } finally {
      draining = null;
    }
  })();
  return draining;
}

/**
 * Vercel's request context (what @vercel/functions' waitUntil reads): keeps the function alive
 * until the promise settles after the response is sent. Outside Vercel the promise just runs.
 */
type RequestContext = { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined };
function waitUntil(promise: Promise<unknown>): void {
  const holder = globalThis as unknown as Record<symbol, RequestContext | undefined>;
  holder[Symbol.for('@vercel/request-context')]?.get?.()?.waitUntil?.(promise);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await start();
  if (req.url?.startsWith('/api/cron/tick')) {
    const authorised =
      config.cronSecret !== undefined &&
      req.headers.authorization === `Bearer ${config.cronSecret}`;
    res.statusCode = authorised ? 200 : 403;
    if (authorised) {
      lastSchedule = 0;
      await background();
    }
    res.end(authorised ? 'ok' : 'forbidden');
    return;
  }
  await listener(req, res);
  // Changes usually queue jobs (matching, alerts, emails); plain page loads only check now and then.
  if (req.method !== 'GET' || now() - lastDrain > IDLE_DRAIN_EVERY_MS) waitUntil(background());
}
