#!/usr/bin/env node
/**
 * Fails when prisma/migrations does not reproduce prisma/schema.prisma.
 *
 * Production builds its schema with `prisma migrate deploy` (release-db.mjs),
 * while local dev uses `db push` (scripts/setup-db.mjs). This check keeps the
 * two identical: it replays every migration into a throwaway shadow database
 * and diffs the result against the schema. Needs DATABASE_URL with rights to
 * create a database; the shadow database is dropped afterwards.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('check-migrations: DATABASE_URL is required');
  process.exit(1);
}

const shadowName = `migrations_check_${process.pid}`;
const shadowUrl = new URL(url);
shadowUrl.pathname = `/${shadowName}`;

const admin = new pg.Client({ connectionString: url });
await admin.connect();
await admin.query(`CREATE DATABASE "${shadowName}"`);
let status = 1;
try {
  const diff = spawnSync(
    process.execPath,
    [
      prismaCli,
      'migrate',
      'diff',
      '--from-migrations',
      join(PKG_ROOT, 'prisma/migrations'),
      '--to-schema-datamodel',
      join(PKG_ROOT, 'prisma/schema.prisma'),
      '--shadow-database-url',
      shadowUrl.toString(),
      '--script',
      '--exit-code',
    ],
    { cwd: PKG_ROOT, encoding: 'utf8' },
  );
  // --exit-code: 0 = no difference, 2 = difference, anything else = error.
  status = diff.status ?? 1;
  if (status === 0) {
    console.log('✓ prisma/migrations reproduce prisma/schema.prisma');
  } else if (status === 2) {
    console.error('✗ prisma/migrations do not match prisma/schema.prisma. Missing migration SQL:\n');
    console.error(diff.stdout);
  } else {
    console.error(diff.stdout, diff.stderr);
  }
} finally {
  await admin.query(`DROP DATABASE IF EXISTS "${shadowName}" WITH (FORCE)`);
  await admin.end();
}
process.exit(status === 0 ? 0 : 1);
