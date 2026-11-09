// Runs as the migration owner (lf_owner): Drizzle SQL migrations, then pg-boss's own schema, then
// the privileges the app role (lf_app) needs on pg-boss tables. Safe to run repeatedly.
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { BOSS_SCHEMA } from '../jobs';

export const APP_ROLE = 'lf_app';

const BOSS_GRANTS = `
  GRANT USAGE ON SCHEMA ${BOSS_SCHEMA} TO ${APP_ROLE};
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${BOSS_SCHEMA} TO ${APP_ROLE};
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${BOSS_SCHEMA} TO ${APP_ROLE};
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${BOSS_SCHEMA} TO ${APP_ROLE};
`;

export async function runMigrations(ownerUrl: string, migrationsFolder: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: ownerUrl, max: 2, application_name: 'lf-migrate' });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder, migrationsSchema: 'drizzle' });

    const boss = new PgBoss({
      connectionString: ownerUrl,
      schema: BOSS_SCHEMA,
      migrate: true,
      createSchema: true,
      supervise: false,
      schedule: false,
      max: 2,
    });
    await boss.start();
    await boss.stop({ graceful: false, close: true });

    await pool.query(BOSS_GRANTS);
  } finally {
    await pool.end();
  }
}
