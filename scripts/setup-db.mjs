#!/usr/bin/env node
/**
 * Idempotent local database setup for KPI Nexus.
 *
 *  1. Probes Postgres until it accepts connections (≤10 attempts × 1s)
 *  2. Runs `prisma generate` to refresh the typed client
 *  3. Runs `prisma db push` to sync the schema (Prisma 7's db push never generates)
 *  4. Applies the shared SQL steps (packages/db/scripts/db-steps.mjs):
 *     extensions, hypertables, continuous aggregates, RLS, role passwords
 *  5. Verifies extensions, hypertables and continuous aggregates
 *
 * Production uses packages/db/scripts/release-db.mjs instead (`migrate deploy`).
 *
 * Exits non-zero on any failure. Safe to re-run.
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { applyDatabaseSql, c, log, probePostgres } from '../packages/db/scripts/db-steps.mjs';

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://kpi_nexus:dev_password@127.0.0.1:5432/kpi_nexus';

function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      shell: true,
      cwd: REPO_ROOT,
      ...opts,
    });
    child.on('exit', (code) => {
      if (code === 0) res();
      else rej(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', rej);
  });
}

async function main() {
  console.log(`${c.dim}DATABASE_URL=${DATABASE_URL}${c.reset}\n`);

  await probePostgres(DATABASE_URL);

  log.step('Running prisma generate');
  try {
    await run('pnpm', [
      '--filter',
      '@kpi-nexus/db',
      'exec',
      'prisma',
      'generate',
    ]);
    log.ok('client generated');
  } catch (err) {
    // On Windows, a running api/worker process holds query_engine-windows.dll
    // open, so `prisma generate` can't rename the freshly-built engine and
    // fails with EPERM. The previously-generated client is still valid (the
    // schema hasn't changed if it generated before), so this is non-fatal: the
    // DDL + verify steps below are what db:setup actually needs to land.
    log.warn(
      `prisma generate failed (${err.message}); continuing with the ` +
        `existing generated client. If the schema changed, stop the api/worker ` +
        `and re-run \`pnpm db:generate\`.`,
    );
  }

  log.step('Running prisma db push (schema is empty in P0 — no-op)');
  await run('pnpm', [
    '--filter',
    '@kpi-nexus/db',
    'exec',
    'prisma',
    'db',
    'push',
  ]);
  log.ok('schema synced');

  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await applyDatabaseSql(client);
  } finally {
    await client.end();
  }

  log.done('db:setup complete');
}

main().catch((err) => {
  console.error(`\n${c.red}${c.bold}✗ db:setup failed${c.reset}`);
  console.error(`  ${err.message}`);
  if (err.stack) {
    console.error(`${c.dim}${err.stack.split('\n').slice(1).join('\n')}${c.reset}`);
  }
  process.exit(1);
});
