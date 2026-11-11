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
import { createDevRegistrar, noRegistrar, type Registrar } from './platform/registrar';
import { createDevSmsAdapter, type SmsSender } from './platform/sms';
import { createStorage, type Storage } from './platform/storage';
import { createTenantResolver, type TenantResolver } from './platform/tenancy';
import { auditJobs } from './modules/audit/jobs';
import { createAuthPolicy } from './modules/identity';
import { claimsJobs } from './modules/claims/jobs';
import { itemsJobs } from './modules/items/jobs';
import { matchingJobs } from './modules/matching/jobs';
import { notificationsJobs } from './modules/notifications/jobs';
import { photosJobs } from './modules/photos/jobs';
import { DEV_DIRECTORY } from './seed/data';

export type Services = {
  config: Config;
  logger: Logger;
  clock: Clock;
  /** Set when dev tools are on: the clock /dev/tools moves. */
  devClock: AdjustableClock | null;
  db: DatabaseHandle;
  boss: PgBoss;
  auth: Auth;
  email: EmailSender;
  sms: SmsSender;
  storage: Storage;
  crypto: PrivateDetailsCrypto;
  registrar: Registrar;
  tenants: TenantResolver;
  jobs: JobDefinition[];
};

export function createServices(
  config: Config,
  logger: Logger,
  overrides: {
    clock?: AdjustableClock;
    /** On a serverless host: no pg-boss cron monitor or supervisor (see platform/jobs drainJobs). */
    serverless?: boolean;
  } = {},
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
  const boss = createBoss(config.database.url, logger, {
    schedule: config.nodeEnv !== 'test' && !overrides.serverless,
  });
  const storage = createStorage(config.storage, db);
  const crypto = createPrivateDetailsCrypto(
    config.privateDetails.keys,
    config.privateDetails.activeVersion,
  );
  const registrar =
    config.registrar.provider === 'dev' ? createDevRegistrar(DEV_DIRECTORY) : noRegistrar;
  const itemDeps = { boss, crypto, registrar, appOrigin: config.appOrigin };
  return {
    config,
    logger,
    clock,
    devClock,
    db,
    boss,
    auth,
    email,
    sms,
    storage,
    crypto,
    registrar,
    tenants: createTenantResolver(db, () => clock.now().getTime()),
    jobs: [
      ...auditJobs({ db, clock, logger }),
      ...matchingJobs({ ...itemDeps, db, clock, logger }),
      ...notificationsJobs({ email, logger }),
      ...photosJobs({ storage, db, clock, logger }),
      ...itemsJobs({ ...itemDeps, db, clock, logger }),
      ...claimsJobs({ ...itemDeps, db, clock, logger }),
    ],
  };
}
