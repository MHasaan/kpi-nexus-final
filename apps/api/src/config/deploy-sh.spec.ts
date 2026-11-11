import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

/**
 * infra/prod/deploy.sh (ADR-001): runs on the VM for every deploy. Driven here
 * with stand-in `docker` and `curl` commands that log their calls, so the
 * order (release before the new containers start) and the automatic rollback
 * are checked without a VM.
 */

const SCRIPT = fileURLToPath(new URL('../../../../infra/prod/deploy.sh', import.meta.url));
const NEW = 'a'.repeat(40);
const OLD = 'b'.repeat(40);

interface Run {
  status: number | null;
  output: string;
  calls: string[];
  state: string | undefined;
}

/**
 * healthVersion: the version /health reports after `up` for each tag (missing
 * means the API never answers). releaseFails: the release container exits 1.
 */
function deploy(opts: { previous?: string; healthFor?: Record<string, string>; releaseFails?: boolean }): Run {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-sh-'));
  copyFileSync(SCRIPT, join(dir, 'deploy.sh'));
  writeFileSync(join(dir, '.env'), 'API_DOMAIN=api.example.test\nPOSTGRES_PASSWORD=not-read\n');
  if (opts.previous) writeFileSync(join(dir, 'current-tag'), `${opts.previous} db-old\n`);
  const log = join(dir, 'calls.log');
  const live = join(dir, 'live-tag');

  // docker: log every call with the tags it would use; `up` makes that tag live.
  writeFileSync(
    join(dir, 'docker'),
    `#!/usr/bin/env bash
echo "docker IMAGE_TAG=$IMAGE_TAG DB_IMAGE_TAG=$DB_IMAGE_TAG $*" >> "${log}"
case " $* " in
  *" run --rm release "*) [ "${opts.releaseFails ? '1' : '0'}" = 1 ] && exit 1 ;;
  *" up -d "*) echo "$IMAGE_TAG" > "${live}" ;;
esac
exit 0
`,
  );
  const health = Object.entries(opts.healthFor ?? {})
    .map(([tag, version]) => `  ${tag}) echo '{"db":"ok","redis":"ok","version":"${version}"}' ;;`)
    .join('\n');
  writeFileSync(
    join(dir, 'curl'),
    `#!/usr/bin/env bash
echo "curl $*" >> "${log}"
case "$(cat "${live}" 2>/dev/null)" in
${health}
  *) exit 7 ;;
esac
`,
  );
  chmodSync(join(dir, 'docker'), 0o755);
  chmodSync(join(dir, 'curl'), 0o755);

  const result = spawnSync('bash', [join(dir, 'deploy.sh'), NEW, 'db-new'], {
    encoding: 'utf8',
    env: { PATH: `${dir}:${process.env.PATH ?? ''}`, HEALTH_ATTEMPTS: '3', HEALTH_INTERVAL: '0' },
  });
  const read = (f: string) => {
    try {
      return readFileSync(join(dir, f), 'utf8');
    } catch {
      return undefined;
    }
  };
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls: (read('calls.log') ?? '').trim().split('\n'),
    state: read('current-tag')?.trim(),
  };
}

const index = (calls: string[], needle: string, tag = NEW) =>
  calls.findIndex((c) => c.includes(`IMAGE_TAG=${tag}`) && c.includes(needle));

describe('infra/prod/deploy.sh', () => {
  test('pulls, releases the database, then starts the new images and records the tag', () => {
    const run = deploy({ previous: OLD, healthFor: { [NEW]: NEW } });
    expect(run.status, run.output).toBe(0);
    const pull = index(run.calls, ' pull');
    const release = index(run.calls, 'run --rm release');
    const up = index(run.calls, 'up -d');
    expect(pull).toBeGreaterThanOrEqual(0);
    expect(release).toBeGreaterThan(pull);
    expect(up).toBeGreaterThan(release);
    expect(run.calls[up]).toContain('DB_IMAGE_TAG=db-new');
    const healthUrls = run.calls.filter((c) => c.startsWith('curl ')).map((c) => c.split(' ').at(-1));
    expect(healthUrls).toContain('https://api.example.test/health');
    // Through the local Caddy, not out to the public address and back.
    expect(run.calls.find((c) => c.startsWith('curl '))).toContain('--resolve api.example.test:443:127.0.0.1');
    expect(run.state).toBe(`${NEW} db-new`);
  });

  test('a failed database release stops before any container changes', () => {
    const run = deploy({ previous: OLD, healthFor: { [NEW]: NEW, [OLD]: OLD }, releaseFails: true });
    expect(run.status).not.toBe(0);
    expect(run.calls.some((c) => c.includes('up -d'))).toBe(false);
    expect(run.state).toBe(`${OLD} db-old`);
  });

  test('rolls back to the previous tag when the new build never reports healthy', () => {
    const run = deploy({ previous: OLD, healthFor: { [OLD]: OLD } });
    expect(run.status).not.toBe(0);
    const upNew = index(run.calls, 'up -d');
    const upOld = index(run.calls, 'up -d', OLD);
    expect(upNew).toBeGreaterThanOrEqual(0);
    expect(upOld).toBeGreaterThan(upNew);
    expect(run.calls[upOld]).toContain('DB_IMAGE_TAG=db-old');
    expect(run.output).toMatch(/rolled back to b{40}/);
    expect(run.state).toBe(`${OLD} db-old`);
  });

  test('a healthy API still running the old build counts as a failed deploy', () => {
    // e.g. the new container crashed and Docker kept nothing new running.
    const run = deploy({ previous: OLD, healthFor: { [NEW]: OLD, [OLD]: OLD } });
    expect(run.status).not.toBe(0);
    expect(index(run.calls, 'up -d', OLD)).toBeGreaterThan(index(run.calls, 'up -d'));
  });

  test('a first deploy with nothing to roll back to fails loudly', () => {
    const run = deploy({ healthFor: {} });
    expect(run.status).not.toBe(0);
    expect(run.output).toMatch(/no previous tag/);
    expect(run.state).toBeUndefined();
  });

  test('refuses a tag that is not a commit SHA', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deploy-sh-'));
    copyFileSync(SCRIPT, join(dir, 'deploy.sh'));
    const result = spawnSync('bash', [join(dir, 'deploy.sh'), 'latest', 'db-new'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
  });
});
