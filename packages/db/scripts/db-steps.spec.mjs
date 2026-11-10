import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyDatabaseSql } from './db-steps.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Records every query; answers the verification queries as a healthy database would. */
function fakeClient() {
  const queries = [];
  return {
    queries,
    async query(sql, params) {
      queries.push(typeof sql === 'string' ? sql : String(sql));
      // Whole SQL files arrive without params; only the verification queries are answered.
      if (!params) return { rows: [] };
      if (sql.includes('FROM pg_extension')) return { rows: params[0].map((extname) => ({ extname })) };
      if (sql.includes('timescaledb_information.hypertables')) {
        return { rows: params[0].map((hypertable_name) => ({ hypertable_name })) };
      }
      if (sql.includes('timescaledb_information.continuous_aggregates')) {
        return { rows: params[0].map((view_name) => ({ view_name })) };
      }
      if (sql.includes('timescaledb_information.jobs')) return { rows: [] };
      if (sql.startsWith("SELECT format('ALTER ROLE")) return { rows: [{ format: `ALTER ROLE ${params[0]} PASSWORD '***'` }] };
      return { rows: [] };
    },
  };
}

const indexOf = (queries, needle) => queries.findIndex((q) => q.includes(needle));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('applyDatabaseSql', () => {
  it('applies extensions, hypertables, continuous aggregates, then RLS', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const client = fakeClient();
    await applyDatabaseSql(client);
    const order = [
      indexOf(client.queries, 'CREATE EXTENSION'),
      indexOf(client.queries, 'create_hypertable'),
      indexOf(client.queries, 'timescaledb.continuous'),
      indexOf(client.queries, 'ENABLE ROW LEVEL SECURITY'),
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('sets the runtime-role passwords only when they are configured', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('KPI_APP_DB_PASSWORD', '');
    vi.stubEnv('KPI_SYSTEM_DB_PASSWORD', '');
    const without = fakeClient();
    await applyDatabaseSql(without);
    expect(without.queries.some((q) => q.startsWith('ALTER ROLE'))).toBe(false);

    vi.stubEnv('KPI_APP_DB_PASSWORD', 'app-secret');
    vi.stubEnv('KPI_SYSTEM_DB_PASSWORD', 'system-secret');
    const withPasswords = fakeClient();
    await applyDatabaseSql(withPasswords);
    expect(withPasswords.queries.filter((q) => q.startsWith('ALTER ROLE'))).toEqual([
      "ALTER ROLE kpi_app PASSWORD '***'",
      "ALTER ROLE kpi_system PASSWORD '***'",
    ]);
  });
});

describe('release-db.mjs', () => {
  it('refuses to run without DATABASE_URL', () => {
    const env = { ...process.env };
    delete env.DATABASE_URL;
    const result = spawnSync(process.execPath, [join(HERE, 'release-db.mjs')], { env, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL');
  });

  it('migrates with `migrate deploy`, never `db push`', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(join(HERE, 'release-db.mjs'), 'utf8');
    expect(source).toContain("'migrate', 'deploy'");
    expect(source).not.toMatch(/'db',\s*'push'/);
  });
});
