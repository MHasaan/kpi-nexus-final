import { fileURLToPath } from 'node:url';

import { defineConfig } from 'prisma/config';

// Prisma 7's CLI no longer reads .env itself. Load the repo-root .env the way
// the API does (variables already in the real environment win), so local
// `prisma` commands keep working; CI and production pass real env vars.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // No .env — nothing to load.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Optional: `prisma generate` (CI builds, the image build) runs without a
  // database. Commands that need one fail clearly when it's unset.
  // shadowDatabaseUrl: set by scripts/check-migrations.mjs for `migrate diff`.
  datasource: { url: process.env.DATABASE_URL, shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL },
});
