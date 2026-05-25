#!/usr/bin/env node
/**
 * Idempotent local database setup for KPI Nexus.
 *
 *  1. Probes Postgres until it accepts connections (≤10 attempts × 1s)
 *  2. Runs `prisma generate` to refresh the typed client
 *  3. Runs `prisma db push --skip-generate` to sync the (currently empty) schema
 *  4. Applies extensions.sql and rls-policies.sql
 *  5. Verifies timescaledb + vector are present in pg_extension
 *
 * Exits non-zero on any failure. Safe to re-run.
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://kpi_nexus:dev_password@localhost:5432/kpi_nexus';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

const log = {
  step: (msg) =>
    console.log(`${c.cyan}${c.bold}→${c.reset} ${c.bold}${msg}${c.reset}`),
  ok: (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`),
  warn: (msg) => console.log(`  ${c.yellow}⚠${c.reset} ${msg}`),
  err: (msg) => console.error(`  ${c.red}✗${c.reset} ${msg}`),
  done: (msg) =>
    console.log(`\n${c.green}${c.bold}✓ ${msg}${c.reset}\n`),
};

async function probePostgres(url) {
  log.step('Probing Postgres connectivity');
  const u = new URL(url);
  const host = u.hostname;
  const port = Number(u.port || 5432);
  const maxAttempts = 10;

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await new Promise((res, rej) => {
        const sock = createConnection({ host, port });
        const timer = setTimeout(() => {
          sock.destroy();
          rej(new Error('timeout after 1000ms'));
        }, 1000);
        sock.once('connect', () => {
          clearTimeout(timer);
          sock.end();
          res();
        });
        sock.once('error', (e) => {
          clearTimeout(timer);
          rej(e);
        });
      });
      log.ok(`reachable at ${host}:${port} (attempt ${i})`);
      return;
    } catch (err) {
      if (i === maxAttempts) {
        log.err(
          `unreachable after ${maxAttempts} attempts (${err.message}). ` +
            `Is docker-compose up?`,
        );
        throw err;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

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

async function applySql(client, relPath) {
  const fullPath = join(REPO_ROOT, relPath);
  const sql = await readFile(fullPath, 'utf-8');
  const meaningful = sql
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('--'))
    .join('\n')
    .trim();

  log.step(`Applying ${relPath}`);
  if (!meaningful) {
    log.warn('file has no executable statements (skipping)');
    return;
  }
  await client.query(sql);
  log.ok('applied');
}

async function verifyHypertables(client) {
  log.step('Verifying TimescaleDB hypertables');
  const required = ['KPIDataPoint'];
  // timescaledb_information.hypertables is the canonical view in TS 2.x+
  const { rows } = await client.query(
    `SELECT hypertable_name FROM timescaledb_information.hypertables
     WHERE hypertable_name = ANY($1)`,
    [required],
  );
  const found = new Set(rows.map((r) => r.hypertable_name));
  for (const ht of required) {
    if (found.has(ht)) {
      log.ok(`hypertable '${ht}' present`);
    } else {
      log.err(`hypertable '${ht}' NOT present — rls/extensions may have run before hypertables`);
      throw new Error(`Missing required hypertable: ${ht}`);
    }
  }
}

async function verifyExtensions(client) {
  log.step('Verifying Postgres extensions');
  const required = ['timescaledb', 'vector'];
  const { rows } = await client.query(
    'SELECT extname FROM pg_extension WHERE extname = ANY($1)',
    [required],
  );
  const found = new Set(rows.map((r) => r.extname));
  for (const ext of required) {
    if (found.has(ext)) {
      log.ok(`extension '${ext}' enabled`);
    } else {
      log.err(`extension '${ext}' NOT enabled — check timescaledb-ha image`);
      throw new Error(`Missing required extension: ${ext}`);
    }
  }
}

async function main() {
  console.log(`${c.dim}DATABASE_URL=${DATABASE_URL}${c.reset}\n`);

  await probePostgres(DATABASE_URL);

  log.step('Running prisma generate');
  await run('pnpm', [
    '--filter',
    '@kpi-nexus/db',
    'exec',
    'prisma',
    'generate',
  ]);
  log.ok('client generated');

  log.step('Running prisma db push (schema is empty in P0 — no-op)');
  await run('pnpm', [
    '--filter',
    '@kpi-nexus/db',
    'exec',
    'prisma',
    'db',
    'push',
    '--skip-generate',
  ]);
  log.ok('schema synced');

  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    await applySql(client, 'packages/db/prisma/sql/extensions.sql');
    await applySql(client, 'packages/db/prisma/sql/rls-policies.sql');
    await applySql(client, 'packages/db/prisma/sql/hypertables.sql');
    await verifyExtensions(client);
    await verifyHypertables(client);
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
