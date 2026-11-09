// pg-boss setup (ADR-0002). The migration owner installs pg-boss's schema (platform/db/migrate.ts);
// the app connects as lf_app with migrate and createSchema off. Jobs are sent inside withTx:
//   await boss.send('match-lost-report', data, { db: tx.jobs });
import { PgBoss, type Job, type QueueOptions } from 'pg-boss';
import type { Logger } from '../logger';

export { PgBoss, type Job } from 'pg-boss';

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
