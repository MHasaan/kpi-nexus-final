/**
 * Database steps shared by local setup (scripts/setup-db.mjs, `db push`) and
 * the production release (release-db.mjs, `migrate deploy`), so the SQL both
 * apply and the checks both run cannot drift apart. Paths are relative to
 * packages/db, which ships this folder in the deployed image.
 */

import { readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

export const log = {
  step: (msg) =>
    console.log(`${c.cyan}${c.bold}→${c.reset} ${c.bold}${msg}${c.reset}`),
  ok: (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`),
  warn: (msg) => console.log(`  ${c.yellow}⚠${c.reset} ${msg}`),
  err: (msg) => console.error(`  ${c.red}✗${c.reset} ${msg}`),
  done: (msg) =>
    console.log(`\n${c.green}${c.bold}✓ ${msg}${c.reset}\n`),
};

export async function probePostgres(url) {
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

/**
 * Splits a SQL file into individual statements on top-level semicolons.
 * Naive but sufficient for our SQL files: strips line comments, then splits
 * on ';'. We don't use $$ dollar-quoting or embedded semicolons in the files
 * applied with splitStatements, so this stays correct.
 */
function splitSqlStatements(sql) {
  const noComments = sql
    .split('\n')
    .map((l) => {
      const idx = l.indexOf('--');
      return idx === -1 ? l : l.slice(0, idx);
    })
    .join('\n');
  return noComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Applies a .sql file.
 *
 * @param {import('pg').Client} client
 * @param {string} relPath
 * @param {{ splitStatements?: boolean }} [opts]
 *   splitStatements:true runs each statement in its own `query()` call. The
 *   `pg` simple-query protocol wraps a multi-statement string in one implicit
 *   transaction; TimescaleDB rejects `CREATE MATERIALIZED VIEW ... WITH
 *   (timescaledb.continuous)` inside a transaction block. Running statements
 *   one-at-a-time keeps each in its own autocommit, so CAGG DDL succeeds.
 */
export async function applySql(client, relPath, opts = {}) {
  const fullPath = join(PKG_ROOT, relPath);
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

  if (opts.splitStatements) {
    const statements = splitSqlStatements(sql);
    for (const stmt of statements) {
      await client.query(stmt);
    }
    log.ok(`applied (${statements.length} statements, autocommit each)`);
    return;
  }

  await client.query(sql);
  log.ok('applied');
}

export async function verifyHypertables(client) {
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

export async function verifyContinuousAggregates(client) {
  log.step('Verifying TimescaleDB continuous aggregates');
  const required = [
    'kpi_data_hourly',
    'kpi_data_daily',
    'kpi_data_weekly',
    'kpi_data_monthly',
    'kpi_data_quarterly',
  ];
  const { rows } = await client.query(
    `SELECT view_name FROM timescaledb_information.continuous_aggregates
     WHERE view_name = ANY($1)`,
    [required],
  );
  const found = new Set(rows.map((r) => r.view_name));
  for (const v of required) {
    if (found.has(v)) {
      log.ok(`continuous aggregate '${v}' present`);
    } else {
      log.err(`continuous aggregate '${v}' NOT present`);
      throw new Error(`Missing required continuous aggregate: ${v}`);
    }
  }

  // Policies: each CAGG should have a refresh job; compression policies exist
  // on the CAGGs + the base hypertable.
  const { rows: jobRows } = await client.query(
    `SELECT proc_name, count(*)::int AS n
     FROM timescaledb_information.jobs
     WHERE proc_name IN ('policy_refresh_continuous_aggregate', 'policy_compression')
     GROUP BY proc_name`,
  );
  const jobs = Object.fromEntries(jobRows.map((r) => [r.proc_name, r.n]));
  const refreshN = jobs.policy_refresh_continuous_aggregate ?? 0;
  const compressN = jobs.policy_compression ?? 0;
  if (refreshN >= required.length) {
    log.ok(`${refreshN} continuous-aggregate refresh policies present`);
  } else {
    log.warn(`only ${refreshN} refresh policies present (expected ≥${required.length})`);
  }
  // 5 CAGG compression policies. The base hypertable is not compressed — it
  // carries row-level security, which TimescaleDB compression forbids (OT-014).
  if (compressN >= required.length) {
    log.ok(`${compressN} compression policies present`);
  } else {
    log.warn(`only ${compressN} compression policies present (expected ≥${required.length})`);
  }
}

/**
 * Production / CI set real passwords for the two runtime roles; locally the
 * dev defaults from rls-policies.sql stay. Values are passed as literals via
 * format(%L) so they are quoted safely and never logged.
 */
export async function setRolePasswords(client) {
  for (const [role, envName] of [
    ['kpi_app', 'KPI_APP_DB_PASSWORD'],
    ['kpi_system', 'KPI_SYSTEM_DB_PASSWORD'],
  ]) {
    const pw = process.env[envName];
    if (!pw) continue;
    await client.query(`SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text)`, [role, pw]).then(
      ({ rows }) => client.query(rows[0].format),
    );
    log.ok(`${role} password set from ${envName}`);
  }
}

export async function verifyExtensions(client) {
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

/**
 * Everything after the tables exist: extensions, hypertables, continuous
 * aggregates, RLS, runtime-role passwords, then verification. Safe to re-run.
 */
export async function applyDatabaseSql(client) {
  await applySql(client, 'prisma/sql/extensions.sql');
  await applySql(client, 'prisma/sql/hypertables.sql');
  // CAGG DDL cannot run inside a transaction block — apply statement-by-statement.
  await applySql(client, 'prisma/sql/continuous-aggregates.sql', { splitStatements: true });
  // RLS last (OT-014): KPIDataPoint's compression must already be off, and
  // the continuous aggregates must exist so the request role can be revoked.
  await applySql(client, 'prisma/sql/rls-policies.sql');
  await setRolePasswords(client);
  await verifyExtensions(client);
  await verifyHypertables(client);
  await verifyContinuousAggregates(client);
}
