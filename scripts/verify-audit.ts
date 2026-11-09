// pnpm db:verify-audit — recomputes every audit checkpoint from its member rows and checks the
// hash chain (plan §5.4). Exit code 1 when anything does not match. Used nightly and by
// scripts/restore-test.sh after restoring a backup. DATABASE_URL picks the database.
import {
  closeDatabase,
  createLogger,
  createServices,
  NO_TENANT,
  verifyAuditChain,
} from '@lf/server/cli';
import { fail, loadConfig, out } from './lib';

const config = loadConfig();
const services = createServices(
  { ...config, devTools: false },
  createLogger({ level: 'silent', pretty: false }),
);
try {
  const result = await verifyAuditChain({
    tenantId: NO_TENANT,
    actor: { kind: 'system', job: 'verify-audit' },
    requestId: 'verify-audit',
    clock: services.clock,
    db: services.db,
  });
  if (!result.ok)
    fail(
      `Audit log check FAILED (${result.checkpoints} checkpoints):\n${result.problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  out(`Audit log OK: ${result.checkpoints} checkpoints covering ${result.events} events.`);
} finally {
  await closeDatabase(services.db);
}
