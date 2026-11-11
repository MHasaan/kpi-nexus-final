import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { SECRET_SPECS } from './secrets.js';

/**
 * The production stack on the Oracle Always Free VM (ADR-001): infra/prod
 * must keep the invariants the app and the free VM rely on. Static checks
 * only — the local rehearsal (rehearsal.override.yml) is what runs it.
 */

const ROOT = new URL('../../../../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), 'utf8');

interface Service {
  image?: string;
  command?: string[];
  environment?: Record<string, string>;
  env_file?: string[] | string;
  ports?: string[];
  volumes?: string[];
  profiles?: string[];
  restart?: string;
  mem_limit?: string;
  healthcheck?: { test?: string[] };
  logging?: { driver?: string };
  depends_on?: Record<string, { condition?: string }>;
}

const composeText = read('infra/prod/docker-compose.yml');
const compose = parseYaml(composeText, { merge: true }) as { services: Record<string, Service> };
const services = compose.services;
const svc = (name: string): Service => {
  const s = services[name];
  if (!s) throw new Error(`no service ${name}`);
  return s;
};

/** KEY=value lines of an env template, comments skipped. */
function envTemplate(path: string): Map<string, string> {
  const entries = read(path)
    .split('\n')
    .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)] as const;
    });
  return new Map(entries);
}

const composeEnv = envTemplate('infra/prod/.env.example');
const appEnv = envTemplate('infra/prod/app.env.example');
const LONG_RUNNING = ['postgres', 'redis', 'ml', 'api', 'worker', 'caddy'];

describe('infra/prod/docker-compose.yml: processes', () => {
  test('API and worker run from one image; only the API leaves out the queue processors', () => {
    expect(svc('api').image).toBe(svc('worker').image);
    expect(svc('api').environment?.RUN_QUEUE_WORKERS).toBe('false');
    // The worker refuses RUN_QUEUE_WORKERS=false, so it must not inherit it.
    expect(svc('worker').environment?.RUN_QUEUE_WORKERS).toBeUndefined();
    expect(svc('worker').command).toEqual(['node', 'dist/worker.js']);
    expect(svc('api').command).toEqual(['node', '--import', './dist/instrumentation.js', 'dist/main.js']);
  });

  test('the database release is a one-off profile from the API image, after Postgres is healthy', () => {
    const release = svc('release');
    expect(release.image).toBe(svc('api').image);
    expect(release.profiles).toEqual(['release']);
    expect(release.restart).toBe('no');
    expect(release.command).toEqual(['node', 'node_modules/@kpi-nexus/db/scripts/release-db.mjs']);
    expect(release.depends_on?.postgres?.condition).toBe('service_healthy');
  });

  test('runs production mode with row-level security enforced behind one proxy', () => {
    for (const name of ['api', 'worker', 'release']) {
      const env = svc(name).environment ?? {};
      expect(env.NODE_ENV, name).toBe('production');
      expect(env.RLS_ENFORCED, name).toBe('true');
      expect(env.TRUST_PROXY, name).toBe('1');
      expect(env.DATABASE_URL_APP, name).toMatch(/^postgresql:\/\/kpi_app:/);
      expect(env.DATABASE_URL_SYSTEM, name).toMatch(/^postgresql:\/\/kpi_system:/);
    }
  });

  test('the Postgres superuser password reaches only the database container', () => {
    for (const [name, s] of Object.entries(services)) {
      if (name === 'postgres') continue;
      expect(JSON.stringify(s.environment ?? {}), name).not.toContain('POSTGRES_PASSWORD');
    }
    expect(svc('postgres').environment?.POSTGRES_USER).toBe('postgres');
  });
});

describe('infra/prod/docker-compose.yml: the free VM', () => {
  test('only Caddy publishes ports', () => {
    for (const [name, s] of Object.entries(services)) {
      if (name === 'caddy') continue;
      expect(s.ports, name).toBeUndefined();
    }
    expect(svc('caddy').ports).toEqual(['80:80', '443:443', '443:443/udp']);
  });

  test('the database image wraps the dev stack\'s pinned TimescaleDB with the volume fix and the owner script', () => {
    const dockerfile = read('infra/prod/postgres/Dockerfile');
    const pinned = /timescale\/timescaledb-ha:pg16@sha256:[0-9a-f]{64}/.exec(read('infra/docker/docker-compose.yml'))?.[0];
    expect(pinned).toBeDefined();
    expect(dockerfile).toContain(`FROM ${pinned}`);
    expect(dockerfile).toContain('COPY entrypoint.sh /usr/local/bin/kpi-entrypoint.sh');
    expect(dockerfile).toContain('/docker-entrypoint-initdb.d/100_kpi_nexus_roles.sh');
    expect(read('infra/prod/postgres/entrypoint.sh')).toContain('chown postgres:postgres /home/postgres/pgdata');
    // The schema owner must not be a superuser: superusers bypass RLS (DR-005).
    expect(read('infra/prod/postgres/initdb/100_kpi_nexus_roles.sh')).toMatch(/CREATE ROLE kpi_nexus LOGIN NOSUPERUSER NOBYPASSRLS/);
  });

  test('Postgres keeps its data on the volume at the TimescaleDB data dir', () => {
    expect(svc('postgres').volumes).toEqual(['pgdata:/home/postgres/pgdata']);
    expect(svc('postgres').image).toMatch(/\/kpi-nexus-db:\$\{DB_IMAGE_TAG:\?\}$/);
  });

  test('Redis keeps jobs: password, append-only file, never evicts', () => {
    const cmd = svc('redis').command ?? [];
    expect(cmd).toContain('--requirepass');
    expect(cmd.join(' ')).toContain('--appendonly yes');
    expect(cmd.join(' ')).toContain('--maxmemory-policy noeviction');
    expect(svc('redis').volumes).toEqual(['redisdata:/data']);
  });

  test('every long-running service restarts, has a memory limit and rotated logs', () => {
    for (const name of LONG_RUNNING) {
      const s = svc(name);
      expect(s.restart, name).toBe('unless-stopped');
      expect(s.mem_limit, name).toMatch(/^\d+[mg]$/);
      expect(s.logging?.driver, name).toBe('json-file');
    }
  });

  test('memory limits fit the 2 OCPU / 12 GB Always Free VM with room to spare', () => {
    const toMb = (v: string) => (v.endsWith('g') ? Number(v.slice(0, -1)) * 1024 : Number(v.slice(0, -1)));
    const total = LONG_RUNNING.reduce((sum, name) => sum + toMb(svc(name).mem_limit ?? '0m'), 0);
    expect(total).toBeLessThanOrEqual(8 * 1024);
  });

  test('every service with a port to answer has a health check', () => {
    for (const name of ['postgres', 'redis', 'ml', 'api']) {
      expect(svc(name).healthcheck?.test, name).toBeDefined();
    }
    expect(svc('api').healthcheck?.test?.join(' ')).toContain('http://localhost:4000/health');
  });

  test('third-party images are pinned by digest; our own come from the registry by tag', () => {
    for (const name of ['redis', 'caddy']) {
      expect(svc(name).image, name).toMatch(/@sha256:[0-9a-f]{64}$/);
    }
    for (const name of ['api', 'ml']) {
      expect(svc(name).image, name).toMatch(/^\$\{REGISTRY:-ghcr\.io\/mhasaan\}\/kpi-nexus-(api|ml):\$\{IMAGE_TAG:\?\}$/);
    }
  });

  test('Caddy proxies the API domain to the API container', () => {
    const caddyfile = read('infra/prod/Caddyfile');
    expect(caddyfile).toContain('{$API_DOMAIN} {');
    expect(caddyfile).toContain('reverse_proxy api:4000');
  });
});

describe('infra/prod env templates', () => {
  test('every variable the compose file requires is in .env.example', () => {
    const required = new Set([...composeText.matchAll(/\$\{([A-Z0-9_]+):\?\}/g)].map((m) => m[1]));
    for (const key of required) expect(composeEnv.has(key ?? ''), key).toBe(true);
  });

  test('every production secret the API checks at boot is supplied', () => {
    const supplied = new Set([...appEnv.keys(), ...Object.keys(svc('api').environment ?? {})]);
    for (const spec of SECRET_SPECS) expect(supplied.has(spec.name), spec.name).toBe(true);
    expect(supplied.has('BYO_ENCRYPTION_KEY')).toBe(true);
    expect(supplied.has('INTEGRATION_CRYPTO_KEY')).toBe(true);
  });

  test('templates carry no secret values', () => {
    const secretKey = /(PASSWORD|SECRET|KEY|PASS|PASSPHRASE|TOKEN)$/;
    for (const [path, env] of [
      ['.env.example', composeEnv],
      ['app.env.example', appEnv],
    ] as const) {
      for (const [key, value] of env) {
        if (secretKey.test(key)) expect(value, `${path} ${key}`).toBe('');
      }
    }
    // Hex runs outside image digests would be committed keys.
    expect(composeText.replace(/sha256:[0-9a-f]{64}/g, '')).not.toMatch(/[0-9a-f]{32,}/);
  });

  test('settings files are git-ignored, templates are not', () => {
    const ignore = read('.gitignore');
    for (const f of [
      'infra/prod/.env',
      'infra/prod/app.env',
      'infra/prod/rehearsal.env',
      'infra/prod/rehearsal.app.env',
      'infra/prod/current-tag',
    ]) {
      expect(ignore.split('\n')).toContain(f);
    }
  });
});

describe('infra/prod backups', () => {
  const backup = read('infra/prod/backup.sh');
  const restore = read('infra/prod/restore.sh');

  test('dumps as the superuser, encrypts, then uploads and prunes', () => {
    expect(backup).toContain('pg_dump -U postgres -d kpi_nexus --format=custom');
    expect(backup).toContain('openssl enc -aes-256-cbc -pbkdf2 -iter 200000');
    expect(backup).toMatch(/copy "\/backup\/\$name" "store:\$BACKUP_S3_BUCKET\/db\/"/);
    expect(backup).toContain('--min-age "${keep_days}d"');
  });

  test('restore decrypts with the same cipher and uses the same rclone image', () => {
    expect(restore).toContain('openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000');
    const image = /RCLONE_IMAGE=(\S+)/;
    expect(backup.match(image)?.[1]).toMatch(/@sha256:[0-9a-f]{64}$/);
    expect(restore.match(image)?.[1]).toBe(backup.match(image)?.[1]);
  });

  test('scripts read only their own settings from .env and never source it', () => {
    for (const script of [backup, restore]) {
      expect(script).not.toMatch(/^\s*(source|\.)\s+\.?\/?\.env/m);
      expect(script).toContain('done < .env');
    }
  });
});

describe('.github/workflows/deploy.yml', () => {
  const text = read('.github/workflows/deploy.yml');
  const wf = parseYaml(text) as {
    on: Record<string, { workflows?: string[]; branches?: string[]; inputs?: Record<string, unknown> } | null>;
    jobs: Record<string, { if?: string; 'runs-on'?: string; needs?: string[] | string }>;
  };

  test('deploys only after CI succeeded on a push to main in this repository', () => {
    expect(wf.on.workflow_run?.workflows).toEqual(['CI']);
    expect(wf.on.workflow_run?.branches).toEqual(['main']);
    const gate = wf.jobs.gate?.if ?? '';
    expect(gate).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(gate).toContain("github.event.workflow_run.event == 'push'");
    expect(gate).toContain('github.event.workflow_run.head_repository.full_name == github.repository');
    expect(text).toContain('git merge-base --is-ancestor "$sha" origin/main');
    expect(text).toContain('--workflow Security');
  });

  test('can redeploy any earlier commit by hand (rollback)', () => {
    expect(wf.on.workflow_dispatch?.inputs).toHaveProperty('sha');
  });

  test('nothing is pushed or deployed until all four deploy secrets exist', () => {
    for (const s of ['DEPLOY_HOST', 'DEPLOY_USER', 'DEPLOY_SSH_KEY', 'DEPLOY_KNOWN_HOSTS']) {
      expect(text).toContain(`secrets.${s} != ''`);
    }
    expect(text).toMatch(/if \[ "\$HAS_SECRETS" != true \]; then[\s\S]*?echo "deploy=false"/);
    expect(text).toContain("if: env.PUSH == 'true'");
  });

  test('pull requests build without pushing or deploying', () => {
    expect(text).toMatch(/pull_request\) echo "sha=\$PR_SHA" >> "\$GITHUB_OUTPUT"; echo "deploy=false"/);
    expect(wf.jobs.deploy?.if).toBe("needs.gate.outputs.deploy == 'true'");
    expect(text).toContain('if [ "$PUSH" = true ]; then docker push "$ref"; fi');
  });

  test('builds on native arm64 the same images the compose file runs', () => {
    expect(wf.jobs.images?.['runs-on']).toBe('ubuntu-24.04-arm');
    for (const image of ['kpi-nexus-api', 'kpi-nexus-ml', 'kpi-nexus-db']) {
      expect(text).toContain(`build ${image} `);
      expect(composeText).toContain(`/${image}:`);
    }
    expect(text).toContain('--build-arg APP_VERSION="$SHA"');
    expect(text).toContain('git rev-parse HEAD:infra/prod/postgres');
  });

  test('SSH pins the host key and runs deploy.sh with the commit and database tags', () => {
    expect(text).toContain('StrictHostKeyChecking=yes');
    expect(text).not.toContain('StrictHostKeyChecking=no');
    expect(text).toContain(`/srv/kpi-nexus/deploy.sh '$SHA' '$DB_TAG'`);
    for (const file of ['docker-compose.yml', 'Caddyfile', 'deploy.sh', 'backup.sh', 'restore.sh']) {
      expect(text).toContain(`infra/prod/${file}`);
    }
  });
});

describe('VM bootstrap and runbook', () => {
  const bootstrap = read('infra/prod/bootstrap.sh');
  const runbook = read('docs/deploy.md');

  test('the deploy user gets the deploy key only, and SSH passwords are off', () => {
    expect(bootstrap).toContain(`printf 'restrict %s\\n' "$DEPLOY_PUBKEY"`);
    expect(bootstrap).toContain('PasswordAuthentication no');
    expect(bootstrap).toContain('PermitRootLogin no');
  });

  test('the nightly backup runs the script the deploy copies to the stack directory', () => {
    expect(bootstrap).toMatch(/^30 3 \* \* \* \$DEPLOY_USER cd \$STACK_DIR && \[ -x \.\/backup\.sh \] && \.\/backup\.sh/m);
    expect(bootstrap).toContain('STACK_DIR=/srv/kpi-nexus');
  });

  test('the DuckDNS token stays out of process lists and cron', () => {
    expect(bootstrap).toContain('-K /etc/kpi-nexus/duckdns.curl');
    const cronFile = bootstrap.split('cat > /etc/cron.d/kpi-nexus <<EOF')[1]?.split('\nEOF')[0] ?? '';
    expect(cronFile).toContain('kpi-nexus-duckdns');
    expect(cronFile).not.toContain('TOKEN');
  });

  test('the runbook names every deploy secret and the never-charged rules', () => {
    for (const s of ['DEPLOY_HOST', 'DEPLOY_USER', 'DEPLOY_SSH_KEY', 'DEPLOY_KNOWN_HOSTS']) {
      expect(runbook).toContain(`\`${s}\``);
    }
    expect(runbook).toContain('Never click "Upgrade"');
    expect(runbook).toContain('**2 OCPU and 12 GB**');
    expect(runbook).toContain('./restore.sh drill');
  });
});
