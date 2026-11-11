// pg-boss setup (ADR-0002). The migration owner installs pg-boss's schema (platform/db/migrate.ts);
// the app connects as lf_app with migrate and createSchema off. Jobs are sent inside withTx:
//   await boss.send('match-lost-report', data, { db: tx.jobs });
import { PgBoss, type Job, type QueueOptions, type SendOptions } from 'pg-boss';
import type { Logger } from '../logger';

export { PgBoss, type Job } from 'pg-boss';

/** What a service needs to queue jobs: pg-boss's send, inside the caller's transaction ({ db: tx.jobs }). */
export type JobSender = {
  send(name: string, data: object, options: SendOptions): Promise<string | null>;
};

export const BOSS_SCHEMA = 'pgboss';

/** A queue, its worker and (optionally) a cron schedule. Modules export these from jobs.ts. */
export type JobDefinition<T extends object = object> = {
  name: string;
  options?: QueueOptions;
  /** Cron expression in Asia/Dhaka, e.g. '0 * * * *' for hourly. */
  cron?: string;
  handler: (jobs: Job<T>[]) => Promise<void>;
};

export function createBoss(
  connectionString: string,
  logger: Logger,
  opts: { schedule: boolean },
): PgBoss {
  const boss = new PgBoss({
    connectionString,
    schema: BOSS_SCHEMA,
    application_name: 'lf-jobs',
    migrate: false,
    createSchema: false,
    schedule: opts.schedule,
    supervise: opts.schedule,
    max: 5,
  });
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  return boss;
}

/** Creates any missing queues and their schedules. Workers are started separately. */
export async function ensureQueues(
  boss: PgBoss,
  definitions: readonly JobDefinition[],
): Promise<void> {
  for (const def of definitions) {
    if (!(await boss.getQueue(def.name))) await boss.createQueue(def.name, def.options ?? {});
    if (def.cron) await boss.schedule(def.name, def.cron, {}, { tz: 'Asia/Dhaka' });
  }
}

export async function startWorkers(
  boss: PgBoss,
  definitions: readonly JobDefinition[],
): Promise<void> {
  for (const def of definitions) {
    await boss.work(def.name, def.handler);
  }
}

/** Stops taking new jobs, lets running jobs finish (up to 30 s), then closes the pool. */
export async function stopBoss(boss: PgBoss): Promise<void> {
  await boss.stop({ graceful: true, timeout: 30_000, close: true });
}

// Serverless hosts (the public demo on Vercel) can't keep pg-boss workers and its cron monitor
// running between requests. Instead, after each request the host calls sendDueSchedules and
// drainJobs: due timers are queued at most once per period, then queued jobs run until the queues
// are empty or the time budget is spent. Jobs still commit with the transaction that queued them.

/**
 * Seconds between runs of one of our cron expressions: "*\/15 * * * *" → 900, "10 * * * *" →
 * 3600, "30 0 * * *" → 86400. Anything else falls back to hourly.
 */
export function cronPeriodSeconds(cron: string): number {
  const [minute = '', hour = ''] = cron.trim().split(/\s+/);
  const every = /^\*\/(\d+)$/.exec(minute);
  if (every && hour === '*') return Number(every[1]) * 60;
  if (/^\d+$/.test(minute) && hour === '*') return 3600;
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour)) return 86_400;
  return 3600;
}

/** Queues each scheduled job once per period; pg-boss's singleton slot drops repeats. */
export async function sendDueSchedules(
  boss: PgBoss,
  definitions: readonly JobDefinition[],
): Promise<void> {
  for (const def of definitions) {
    if (!def.cron) continue;
    await boss.send(
      def.name,
      {},
      { singletonKey: 'schedule', singletonSeconds: cronPeriodSeconds(def.cron) },
    );
  }
}

/**
 * Runs queued jobs in this process, queue by queue in batches, until every queue is empty or
 * `budgetMs` has passed. A failing batch is marked failed so pg-boss retries it later.
 * Returns how many jobs ran.
 */
export async function drainJobs(
  boss: PgBoss,
  definitions: readonly JobDefinition[],
  opts: { budgetMs: number; now: () => number; logger: Logger },
): Promise<number> {
  const deadline = opts.now() + opts.budgetMs;
  let ran = 0;
  let busy = true;
  while (busy && opts.now() < deadline) {
    busy = false;
    for (const def of definitions) {
      if (opts.now() >= deadline) break;
      const jobs = await boss.fetch<object>(def.name, { batchSize: 10 });
      if (jobs.length === 0) continue;
      busy = true;
      const ids = jobs.map((j) => j.id);
      try {
        await def.handler(jobs);
        await boss.complete(def.name, ids);
        ran += jobs.length;
      } catch (err) {
        opts.logger.error({ err, queue: def.name }, 'Job batch failed; pg-boss will retry it');
        await boss.fail(def.name, ids, { message: err instanceof Error ? err.message : 'failed' });
      }
    }
  }
  return ran;
}
