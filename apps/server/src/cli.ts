// Entry points for the root scripts/ folder (seed, verify-audit, gen-api, route coverage).
export { runSeed } from './seed';
export { API_INFO, createApp } from './app';
export { createServices } from './services';
export { parseConfig, loadDotEnv, repoRoot } from './platform/config';
export { createLogger } from './platform/logger';
export { closeDatabase } from './platform/db/pool';
export { verifyAuditChain, createCheckpoint, NO_TENANT } from './modules/audit';
