#!/usr/bin/env node
/**
 * Production database release (OT-011) — the Fly `release_command`, run once
 * per deploy before new machines start. Never runs on app boot.
 *
 *  1. Waits for Postgres
 *  2. `prisma migrate deploy` (append-only migrations; never `db push` here)
 *  3. The SQL steps shared with local setup (db-steps.mjs): extensions,
 *     hypertables, continuous aggregates, RLS, runtime-role passwords
 *     (KPI_APP_DB_PASSWORD / KPI_SYSTEM_DB_PASSWORD when set), verification
 *
 * DATABASE_URL must be the owner role. Safe to re-run; exits non-zero on any
 * failure, which makes Fly abort the deploy.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';

import pg from 'pg';

import { PKG_ROOT, applyDatabaseSql, c, log, probePostgres } from './db-steps.mjs';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL (the owner role) is required');

  await probePostgres(url);

  log.step('Running prisma migrate deploy');
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  const migrate = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: PKG_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (migrate.status !== 0) throw new Error(`prisma migrate deploy exited with code ${migrate.status}`);
  log.ok('migrations applied');

  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    await applyDatabaseSql(client);
  } finally {
    await client.end();
  }

  log.done('database release complete');
}

main().catch((err) => {
  console.error(`\n${c.red}${c.bold}✗ database release failed${c.reset}`);
  console.error(`  ${err.message}`);
  process.exit(1);
});
