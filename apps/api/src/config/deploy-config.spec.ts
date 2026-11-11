import { readFileSync } from 'node:fs';

import { parse as parseToml } from 'smol-toml';
import { describe, expect, test } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { SECRET_SPECS } from './secrets.js';

/**
 * The production deploy config (OT-011): infra/fly/*.toml, the release
 * workflow and the local rehearsal must keep the invariants the app relies
 * on. Static checks only — the rehearsal is what runs it.
 */

const ROOT = new URL('../../../../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), 'utf8');

type Toml = Record<string, unknown> & {
  processes?: Record<string, string>;
  env?: Record<string, string>;
  deploy?: { release_command?: string };
  http_service?: { processes?: string[]; checks?: Array<{ path?: string }> };
  services?: Array<{ http_checks?: Array<{ path?: string }>; tcp_checks?: unknown[] }>;
  mounts?: { source?: string; destination?: string };
  vm?: Array<{ processes?: string[]; memory?: string }>;
  build?: { dockerfile?: string };
};

const api = parseToml(read('infra/fly/api.toml')) as Toml;
const ml = parseToml(read('infra/fly/ml.toml')) as Toml;
const db = parseToml(read('infra/fly/postgres.toml')) as Toml;
const readme = read('infra/fly/README.md');

describe('infra/fly/api.toml', () => {
  test('runs the API and the queue worker as separate processes from one image', () => {
    expect(api.build?.dockerfile).toBe('apps/api/Dockerfile');
    expect(api.processes?.worker).toBe('node dist/worker.js');
    expect(api.processes?.app).toMatch(/dist\/main\.js$/);
  });

  test('takes the queue processors out of the API process only', () => {
    // The worker refuses RUN_QUEUE_WORKERS=false, so it must not be app-wide.
    expect(api.processes?.app).toMatch(/^env RUN_QUEUE_WORKERS=false /);
    expect(api.env?.RUN_QUEUE_WORKERS).toBeUndefined();
  });

  test('serves HTTP from the app process only, with a health check', () => {
    expect(api.http_service?.processes).toEqual(['app']);
    expect(api.http_service?.checks?.[0]?.path).toBe('/health');
  });

  test('migrates with the release script before new machines start', () => {
    expect(api.deploy?.release_command).toBe('node node_modules/@kpi-nexus/db/scripts/release-db.mjs');
  });

  test('runs production with row-level security enforced', () => {
    expect(api.env?.NODE_ENV).toBe('production');
    expect(api.env?.RLS_ENFORCED).toBe('true');
    expect(api.env?.ML_SIDECAR_URL).toBe('http://kpi-nexus-ml.flycast');
  });

  test('sizes both process groups', () => {
    expect(api.vm?.map((vm) => vm.processes?.[0]).sort()).toEqual(['app', 'worker']);
  });
});

describe('infra/fly/ml.toml and postgres.toml', () => {
  test('ML runs in production mode and is health-checked', () => {
    expect(ml.env?.ENV).toBe('production');
    expect(ml.services?.[0]?.http_checks?.[0]?.path).toBe('/health');
  });

  test('Postgres keeps its data on the volume at the TimescaleDB data dir', () => {
    // Not /var/lib/postgresql/data: timescaledb-ha keeps PGDATA under
    // /home/postgres/pgdata, and the wrong path lost the dev DB (OT-011).
    expect(db.mounts).toMatchObject({ source: 'pgdata', destination: '/home/postgres/pgdata' });
    expect(db.services?.[0]?.tcp_checks).toHaveLength(1);
  });

  test('Postgres is built from the wrapper with the volume fix and the owner script', () => {
    expect(db.build?.dockerfile).toBe('Dockerfile');
    const dockerfile = read('infra/fly/postgres/Dockerfile');
    expect(dockerfile).toContain('fly-entrypoint.sh');
    expect(dockerfile).toContain('/docker-entrypoint-initdb.d/100_kpi_nexus_roles.sh');
    // Same pinned image as the dev stack.
    const pinned = /timescale\/timescaledb-ha:pg16@sha256:[0-9a-f]{64}/.exec(read('infra/docker/docker-compose.yml'))?.[0];
    expect(pinned).toBeDefined();
    expect(dockerfile).toContain(pinned);
  });
});

describe('no secret values in the Fly config', () => {
  test.each(['api.toml', 'ml.toml', 'postgres.toml'])('%s', (file) => {
    const env = (parseToml(read(`infra/fly/${file}`)) as Toml).env ?? {};
    for (const key of Object.keys(env)) {
      expect(key).not.toMatch(/SECRET|PASSWORD|KEY|TOKEN|DATABASE_URL|REDIS_URL/);
    }
  });
});

describe('infra/fly/README.md', () => {
  const required = [
    ...SECRET_SPECS.map((spec) => spec.name),
    'BYO_ENCRYPTION_KEY',
    'INTEGRATION_CRYPTO_KEY',
    'DATABASE_URL',
    'DATABASE_URL_APP',
    'DATABASE_URL_SYSTEM',
    'KPI_APP_DB_PASSWORD',
    'KPI_SYSTEM_DB_PASSWORD',
    'KPI_OWNER_DB_PASSWORD',
    'POSTGRES_PASSWORD',
    'REDIS_URL',
    'WEB_APP_URL',
    'CORS_ALLOWED_ORIGINS',
  ];

  test.each(required)('the first-deploy steps set %s', (key) => {
    expect(readme).toMatch(new RegExp(`^\\s*${key}=`, 'm'));
  });

  test('deploys the single-volume database and the ML sidecar without public IPs or HA', () => {
    expect(readme).toMatch(/fly deploy infra\/fly\/postgres .*--no-public-ips .*--ha=false/);
    expect(readme).toMatch(/fly deploy apps\/ml .*--no-public-ips .*--ha=false/);
  });
});

describe('.github/workflows/release.yml', () => {
  const workflow = parseYaml(read('.github/workflows/release.yml')) as {
    on: Record<string, unknown>;
    jobs: Record<string, { steps?: Array<{ run?: string }> }>;
  };

  test('only runs when started by hand until the first live deploy', () => {
    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
  });

  test('deploys with the same commands as the README', () => {
    const runs = (workflow.jobs.fly?.steps ?? []).map((step) => step.run ?? '').join('\n');
    expect(runs).toContain('flyctl deploy infra/fly/postgres --config infra/fly/postgres.toml --remote-only --no-public-ips --flycast --ha=false');
    expect(runs).toContain('flyctl deploy apps/ml --config infra/fly/ml.toml --remote-only --no-public-ips --flycast --ha=false');
    expect(runs).toContain('flyctl deploy . --config infra/fly/api.toml --remote-only');
  });
});

describe('infra/docker/prod-rehearsal.compose.yml', () => {
  const compose = parseYaml(read('infra/docker/prod-rehearsal.compose.yml'), { merge: true }) as {
    services: Record<string, { command?: string[]; environment?: Record<string, string> }>;
  };
  const shellWords = (command: string): string[] => command.split(' ');

  test('runs the exact Fly process and release commands', () => {
    expect(compose.services.api?.command).toEqual(shellWords(api.processes!.app!));
    expect(compose.services.worker?.command).toEqual(shellWords(api.processes!.worker!));
    expect(compose.services.release?.command).toEqual(shellWords(api.deploy!.release_command!));
  });

  test('runs production mode with row-level security enforced', () => {
    for (const name of ['release', 'api', 'worker']) {
      expect(compose.services[name]?.environment).toMatchObject({ NODE_ENV: 'production', RLS_ENFORCED: 'true' });
    }
  });
});
