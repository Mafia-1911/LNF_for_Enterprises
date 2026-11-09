// Composition root (plan §2): builds every dependency once from config. No DI container; tests call
// createServices with a test config and replace what they need.
import type { Config } from './platform/config';
import { createAuth, type Auth } from './platform/auth';
import { createOffsetClock, systemClock, type AdjustableClock, type Clock } from './platform/clock';
import { createPrivateDetailsCrypto, type PrivateDetailsCrypto } from './platform/crypto';
import { createDatabase } from './platform/db/pool';
import type { DatabaseHandle } from './platform/db/types';
import { createEmailSender, type EmailSender } from './platform/email';
import { createBoss, type JobDefinition, type PgBoss } from './platform/jobs';
import type { Logger } from './platform/logger';
import { createDevSmsAdapter, type SmsSender } from './platform/sms';
import { createStorage, type Storage } from './platform/storage';
import { createTenantResolver, type TenantResolver } from './platform/tenancy';
import { auditJobs } from './modules/audit/jobs';
import { createAuthPolicy } from './modules/identity';
import { matchingJobs } from './modules/matching/jobs';

export type Services = {
  config: Config;
  logger: Logger;
  clock: Clock;
  /** Set when dev tools are on: the clock the prototype toolbar moves. */
  devClock: AdjustableClock | null;
  db: DatabaseHandle;
  boss: PgBoss;
  auth: Auth;
  email: EmailSender;
  sms: SmsSender;
  storage: Storage;
  crypto: PrivateDetailsCrypto;
  tenants: TenantResolver;
  jobs: JobDefinition[];
};

export function createServices(
  config: Config,
  logger: Logger,
  overrides: { clock?: AdjustableClock } = {},
): Services {
  const devClock = overrides.clock ?? (config.devTools ? createOffsetClock() : null);
  const clock: Clock = devClock ?? systemClock;
  const db = createDatabase(config.database.url, {
    max: config.database.poolMax,
    applicationName: 'lf-app',
  });
  const email = createEmailSender(config.email);
  const sms = createDevSmsAdapter(logger, clock);
  const auth = createAuth({
    db,
    config,
    email,
    sms,
    policy: createAuthPolicy({ db, clock }),
    logger,
  });
  return {
    config,
    logger,
    clock,
    devClock,
    db,
    boss: createBoss(config.database.url, logger, { schedule: config.nodeEnv !== 'test' }),
    auth,
    email,
    sms,
    storage: createStorage(config.storage),
    crypto: createPrivateDetailsCrypto(
      config.privateDetails.keys,
      config.privateDetails.activeVersion,
    ),
    tenants: createTenantResolver(db, () => clock.now().getTime()),
    jobs: [...auditJobs({ db, clock, logger }), ...matchingJobs({ db, clock, logger })],
  };
}
