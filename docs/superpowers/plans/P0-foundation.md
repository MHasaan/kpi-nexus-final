# P0 — Foundation Implementation Plan

| | |
|---|---|
| **Phase** | P0 — Foundation |
| **Goal** | `pnpm dev` boots all 4 apps + Postgres + Redis + MinIO + Mailhog locally; CI green from commit #1 |
| **Effort** | ≈2 weeks solo |
| **Depends on** | Nothing — this is the bootstrap phase |
| **Blocks** | All other phases |
| **Spec reference** | §2.2 (repo layout), §10 (local dev + deployment) |

## Why this phase matters

You can't iterate productively without a working dev loop. P0 ships the boring-but-critical foundation: the monorepo, package boundaries, CI matrix, docker-compose, empty NestJS + Next.js + FastAPI skeletons that boot to a `/health` 200. Everything in P1+ depends on this being solid.

**Do not skip ahead.** Treating P0 as "just scaffolding" leads to weeks of debt later when configs are wrong, modules don't resolve, or hot-reload breaks.

## Exit criteria (all must be true to move to P1)

- [ ] All 4 apps (`apps/web`, `apps/api`, `apps/worker`, `apps/ml`) boot via `pnpm dev`
- [ ] `apps/api`: `GET /health` returns 200 with `{db: "ok", redis: "ok"}`
- [ ] `apps/ml`: `GET /health` returns 200 with `{ok: true}`
- [ ] `apps/web`: landing page loads at http://localhost:3000 with shadcn-themed shell
- [ ] `apps/worker`: connects to Redis + processes an echo test job
- [ ] CI green: lint + typecheck + test + build matrix passes for all 4 apps + 6 packages
- [ ] `pnpm db:setup` runs against compose Postgres with TimescaleDB + pgvector extensions verified
- [ ] One Playwright smoke spec passes (`apps/web/e2e/smoke.spec.ts` loads landing page)
- [ ] `docker-compose up` brings up Postgres + Redis + MinIO + Mailhog + Jaeger
- [ ] All dependencies listed in `package.json` files have explicit versions (no `^` for risky ones)
- [ ] README.md updated with quickstart commands that actually work

## Tasks (in order)

### Task 1: Initialize pnpm + Turborepo

**Files**: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.nvmrc`

- [ ] Install pnpm globally if not present: `npm install -g pnpm@latest`
- [ ] In `C:\work\FYP\khan\KPI_NEXUS_Final\`, run `pnpm init` — set `"name": "kpi-nexus-final"`, `"private": true`
- [ ] Add `"packageManager": "pnpm@9.x.x"` to root package.json (lock to a specific minor)
- [ ] Create `pnpm-workspace.yaml`:
  ```yaml
  packages:
    - 'apps/*'
    - 'packages/*'
  ```
- [ ] Install Turborepo: `pnpm add -D -w turbo@latest`
- [ ] Create `turbo.json` with the pipeline:
  ```json
  {
    "$schema": "https://turbo.build/schema.json",
    "pipeline": {
      "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
      "lint": {},
      "typecheck": { "dependsOn": ["^build"] },
      "test": { "dependsOn": ["^build"] },
      "test:int": { "dependsOn": ["^build"], "cache": false },
      "test:e2e": { "dependsOn": ["^build"], "cache": false },
      "dev": { "cache": false, "persistent": true },
      "db:generate": { "cache": false },
      "db:migrate": { "cache": false }
    }
  }
  ```
- [ ] Create `.gitignore` with: `node_modules/`, `.turbo/`, `.next/`, `dist/`, `*.log`, `.env`, `.env.local`, `.DS_Store`, `coverage/`, `playwright-report/`, `test-results/`
- [ ] Create `.nvmrc` with: `20` (Node LTS)
- [ ] Add root `package.json` scripts:
  ```json
  {
    "scripts": {
      "dev": "turbo dev",
      "build": "turbo build",
      "lint": "turbo lint",
      "typecheck": "turbo typecheck",
      "test": "turbo test",
      "test:int": "turbo test:int",
      "test:e2e": "turbo test:e2e",
      "db:setup": "node scripts/setup-db.mjs",
      "db:migrate": "pnpm --filter @kpi-nexus/db exec prisma migrate dev",
      "db:generate": "pnpm --filter @kpi-nexus/db exec prisma generate",
      "db:studio": "pnpm --filter @kpi-nexus/db exec prisma studio",
      "db:reset": "pnpm --filter @kpi-nexus/db exec prisma migrate reset --force"
    }
  }
  ```

**Verify**: `pnpm install` succeeds; `pnpm turbo --version` prints version.

### Task 2: Create directory structure

**Files**: empty directories with `.gitkeep` files where appropriate

- [ ] `mkdir -p apps/{web,api,worker,ml}`
- [ ] `mkdir -p packages/{contracts,db,ai,formula,ui,config}`
- [ ] `mkdir -p infra/{docker,fly,github}`
- [ ] `mkdir -p docs/{superpowers/specs,superpowers/plans,adrs}`
- [ ] `mkdir -p scripts`
- [ ] `mkdir -p memory` (already exists)
- [ ] `mkdir -p .vscode`

**Verify**: `tree -L 2` (or `dir /s /b /a:d` on Windows) shows all the directories.

### Task 3: Set up `packages/config` (shared tsconfig + eslint + vitest)

**Files**: `packages/config/package.json`, `packages/config/tsconfig.base.json`, `packages/config/eslint.config.js`, `packages/config/vitest.base.ts`, `packages/config/tailwind.config.ts`

- [ ] `packages/config/package.json`:
  ```json
  {
    "name": "@kpi-nexus/config",
    "version": "0.0.0",
    "private": true,
    "main": "./index.js",
    "files": ["*.json", "*.js", "*.ts"]
  }
  ```
- [ ] `packages/config/tsconfig.base.json` — strict mode, ES2022 target, NodeNext modules:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "lib": ["ES2022", "DOM"],
      "strict": true,
      "noUncheckedIndexedAccess": true,
      "noImplicitOverride": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true,
      "declaration": true,
      "sourceMap": true
    }
  }
  ```
- [ ] `packages/config/eslint.config.js` — flat config with TS rules, no-explicit-any error, sort-imports
- [ ] `packages/config/vitest.base.ts` — common test config (globals: true, coverage: v8, reporter: verbose)
- [ ] `packages/config/tailwind.config.ts` — shared tokens (extend in apps/web)

**Verify**: each downstream package can `extends "@kpi-nexus/config/tsconfig.base.json"`.

### Task 4: Set up `packages/contracts` (Zod schemas + TS types)

**Files**: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/index.ts`, `packages/contracts/src/error.ts`, `packages/contracts/src/realtime.ts`, `packages/contracts/src/permissions.ts`

- [ ] `packages/contracts/package.json`:
  ```json
  {
    "name": "@kpi-nexus/contracts",
    "version": "0.0.0",
    "private": true,
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "scripts": {
      "build": "tsc",
      "lint": "eslint .",
      "typecheck": "tsc --noEmit",
      "test": "vitest run"
    },
    "dependencies": {
      "zod": "^3.23.0"
    },
    "devDependencies": {
      "@kpi-nexus/config": "workspace:*",
      "typescript": "^5.5.0",
      "vitest": "^1.6.0"
    }
  }
  ```
- [ ] `packages/contracts/tsconfig.json` extends `@kpi-nexus/config/tsconfig.base.json`
- [ ] `packages/contracts/src/error.ts`: shared error envelope schema + error codes enum
- [ ] `packages/contracts/src/realtime.ts`: SSE event schema (will grow as modules ship)
- [ ] `packages/contracts/src/permissions.ts`: 18-permission enum (populated fully in P1, structure in place now)
- [ ] `packages/contracts/src/index.ts`: re-exports
- [ ] One unit test proving zod + ts inference work

**Verify**: `pnpm --filter @kpi-nexus/contracts build` succeeds; `dist/` has `.d.ts` files.

### Task 5: Set up `packages/db` (Prisma schema)

**Files**: `packages/db/package.json`, `packages/db/prisma/schema.prisma`, `packages/db/src/index.ts`, `packages/db/prisma/sql/extensions.sql`, `packages/db/prisma/sql/rls-policies.sql`

- [ ] `packages/db/package.json`:
  ```json
  {
    "name": "@kpi-nexus/db",
    "version": "0.0.0",
    "private": true,
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "scripts": {
      "build": "tsc",
      "lint": "eslint .",
      "typecheck": "tsc --noEmit",
      "test": "vitest run",
      "prisma:generate": "prisma generate",
      "prisma:migrate": "prisma migrate dev",
      "prisma:studio": "prisma studio",
      "prisma:reset": "prisma migrate reset --force"
    },
    "dependencies": {
      "@prisma/client": "^6.0.0"
    },
    "devDependencies": {
      "@kpi-nexus/config": "workspace:*",
      "prisma": "^6.0.0",
      "typescript": "^5.5.0"
    }
  }
  ```
- [ ] `packages/db/prisma/schema.prisma` with extensions enabled:
  ```prisma
  generator client {
    provider = "prisma-client-js"
    previewFeatures = ["postgresqlExtensions", "fullTextSearchPostgres"]
  }

  datasource db {
    provider = "postgresql"
    url = env("DATABASE_URL")
    extensions = [timescaledb, pgvector(map: "vector")]
  }
  ```
  (No models yet — they land in P1+)
- [ ] `packages/db/prisma/sql/extensions.sql`:
  ```sql
  CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
- [ ] `packages/db/prisma/sql/rls-policies.sql` — empty file with header comment (populates in P1)
- [ ] `packages/db/src/index.ts`: exports a singleton `PrismaClient` with logging + connection pool config
- [ ] `packages/db/prisma/seed.ts`: stub (empty; populates in later phases for demo data)

**Verify**: `pnpm --filter @kpi-nexus/db prisma:generate` works (will run after `db:setup` is built — see Task 12).

### Task 6: Set up `packages/ui` (design tokens stub + theme)

**Files**: `packages/ui/package.json`, `packages/ui/src/tokens.css`, `packages/ui/src/index.ts`, `packages/ui/tailwind.preset.ts`

- [ ] `packages/ui/package.json`:
  ```json
  {
    "name": "@kpi-nexus/ui",
    "version": "0.0.0",
    "private": true,
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
      "./tokens.css": "./src/tokens.css",
      "./tailwind-preset": "./dist/tailwind.preset.js"
    },
    "scripts": {
      "build": "tsc",
      "lint": "eslint .",
      "typecheck": "tsc --noEmit",
      "test": "vitest run"
    },
    "dependencies": {
      "clsx": "^2.1.0",
      "tailwind-merge": "^2.5.0"
    },
    "devDependencies": {
      "@kpi-nexus/config": "workspace:*",
      "tailwindcss": "^3.4.0",
      "typescript": "^5.5.0"
    }
  }
  ```
- [ ] `packages/ui/src/tokens.css` — stub with the semantic palette from spec §12.3 (real values land during Claude Design session):
  ```css
  @layer base {
    :root {
      --surface-bg: 0 0% 100%;
      --surface-1: 0 0% 98%;
      /* ... full set from spec §12.3 ... */
    }
    .dark {
      --surface-bg: 240 10% 4%;
      --surface-1: 240 6% 10%;
      /* ... dark variants ... */
    }
  }
  ```
- [ ] `packages/ui/tailwind.preset.ts` — Tailwind preset wiring tokens to utilities
- [ ] `packages/ui/src/index.ts` — exports `cn()` helper (`clsx` + `tailwind-merge`)

**Verify**: `pnpm --filter @kpi-nexus/ui build` succeeds.

### Task 7: Stub `packages/ai`, `packages/formula` (skeleton only)

**Files**: `packages/ai/package.json`, `packages/ai/src/index.ts`, `packages/formula/package.json`, `packages/formula/src/index.ts`

Both packages get fleshed out in later phases — P2 builds formula, P5 builds ai. For P0, just create the package.json + tsconfig + an empty `index.ts` that exports nothing.

- [ ] `packages/ai/package.json` — minimal, depends on zod + node-fetch types
- [ ] `packages/ai/src/index.ts` — `export {};` placeholder
- [ ] `packages/formula/package.json` — minimal
- [ ] `packages/formula/src/index.ts` — `export {};` placeholder

**Verify**: both packages typecheck without errors (`pnpm --filter @kpi-nexus/ai typecheck`).

### Task 8: Set up `apps/api` (NestJS 11 on Fastify)

**Files**: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/nest-cli.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/.env.example`

- [ ] `apps/api/package.json`:
  ```json
  {
    "name": "@kpi-nexus/api",
    "version": "0.0.0",
    "private": true,
    "scripts": {
      "dev": "nest start --watch",
      "build": "nest build",
      "start:prod": "node dist/main",
      "lint": "eslint src",
      "typecheck": "tsc --noEmit",
      "test": "vitest run",
      "test:int": "vitest run --config vitest.int.config.ts"
    },
    "dependencies": {
      "@kpi-nexus/contracts": "workspace:*",
      "@kpi-nexus/db": "workspace:*",
      "@nestjs/common": "^11.0.0",
      "@nestjs/core": "^11.0.0",
      "@nestjs/platform-fastify": "^11.0.0",
      "@nestjs/config": "^4.0.0",
      "@opentelemetry/api": "^1.9.0",
      "@opentelemetry/sdk-node": "^0.55.0",
      "@sentry/node": "^8.0.0",
      "fastify": "^5.0.0",
      "nestjs-pino": "^4.0.0",
      "pino": "^9.0.0",
      "pino-pretty": "^11.0.0",
      "ioredis": "^5.4.0",
      "reflect-metadata": "^0.2.0",
      "rxjs": "^7.8.0",
      "zod": "^3.23.0"
    },
    "devDependencies": {
      "@kpi-nexus/config": "workspace:*",
      "@nestjs/cli": "^11.0.0",
      "@nestjs/testing": "^11.0.0",
      "@types/node": "^20.0.0",
      "typescript": "^5.5.0",
      "vitest": "^1.6.0"
    }
  }
  ```
- [ ] `apps/api/tsconfig.json` — extends config base, sets `outDir: ./dist`
- [ ] `apps/api/nest-cli.json` — NestJS config
- [ ] `apps/api/src/main.ts`:
  - bootstrap with `NestFactory.create(AppModule, new FastifyAdapter({trustProxy: true}))`
  - Pino logger via `app.useLogger(app.get(Logger))`
  - OTel SDK init (Jaeger exporter pointed at `OTEL_EXPORTER_OTLP_ENDPOINT`)
  - Sentry init with `SENTRY_DSN` (no-op if unset)
  - `await app.listen(process.env.PORT ?? 4000, '0.0.0.0')`
- [ ] `apps/api/src/app.module.ts`: imports `HealthModule`, `ConfigModule.forRoot({isGlobal: true})`, `LoggerModule.forRoot(...)`
- [ ] `apps/api/src/health/health.controller.ts`:
  ```typescript
  @Controller('health')
  export class HealthController {
    constructor(private readonly db: DbHealthService, private readonly redis: RedisHealthService) {}
    @Get()
    async check() {
      return {
        db: await this.db.ping() ? 'ok' : 'down',
        redis: await this.redis.ping() ? 'ok' : 'down',
      };
    }
  }
  ```
- [ ] `apps/api/.env.example`: `DATABASE_URL`, `REDIS_URL`, `PORT=4000`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `SENTRY_DSN=`, `JWT_SECRET=changeme`
- [ ] One unit test: `health.controller.spec.ts` proves the controller wires up

**Verify**: `pnpm --filter @kpi-nexus/api dev` starts; `curl localhost:4000/health` returns `{db: "ok", redis: "ok"}` (once docker is up).

### Task 9: Set up `apps/worker` (NestJS BullMQ host)

**Files**: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/src/main.ts`, `apps/worker/src/app.module.ts`, `apps/worker/src/echo/echo.processor.ts`

- [ ] `apps/worker/package.json` — same dependencies as api PLUS `bullmq`
- [ ] `apps/worker/src/main.ts` — bootstraps a NestJS application context WITHOUT HTTP layer:
  ```typescript
  async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    // BullMQ processors run via the Nest DI; no HTTP listener
    process.on('SIGTERM', () => app.close());
  }
  bootstrap();
  ```
- [ ] `apps/worker/src/app.module.ts` imports `BullModule.forRoot({connection: {host: REDIS_HOST, ...}})` + `EchoModule`
- [ ] `apps/worker/src/echo/echo.processor.ts`: a `@Processor('echo')` that takes a job and logs `{id, data}`
- [ ] One unit test: the processor calls the right log line

**Verify**: `pnpm --filter @kpi-nexus/worker dev` starts; manually push a job to `echo` queue via redis-cli or a small script; processor logs.

### Task 10: Set up `apps/web` (Next.js 15 App Router)

**Files**: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.mjs`, `apps/web/tailwind.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`, `apps/web/playwright.config.ts`, `apps/web/e2e/smoke.spec.ts`

- [ ] `apps/web/package.json`:
  ```json
  {
    "name": "@kpi-nexus/web",
    "version": "0.0.0",
    "private": true,
    "scripts": {
      "dev": "next dev",
      "build": "next build",
      "start": "next start",
      "lint": "next lint",
      "typecheck": "tsc --noEmit",
      "test": "vitest run",
      "test:e2e": "playwright test"
    },
    "dependencies": {
      "@kpi-nexus/contracts": "workspace:*",
      "@kpi-nexus/ui": "workspace:*",
      "@sentry/nextjs": "^8.0.0",
      "clsx": "^2.1.0",
      "lucide-react": "^0.451.0",
      "next": "^15.0.0",
      "next-themes": "^0.4.0",
      "react": "^18.3.0",
      "react-dom": "^18.3.0",
      "tailwind-merge": "^2.5.0"
    },
    "devDependencies": {
      "@kpi-nexus/config": "workspace:*",
      "@playwright/test": "^1.48.0",
      "@types/node": "^20.0.0",
      "@types/react": "^18.3.0",
      "@types/react-dom": "^18.3.0",
      "autoprefixer": "^10.4.0",
      "eslint-config-next": "^15.0.0",
      "postcss": "^8.4.0",
      "tailwindcss": "^3.4.0",
      "typescript": "^5.5.0",
      "vitest": "^1.6.0"
    }
  }
  ```
- [ ] `apps/web/next.config.mjs`:
  - `transpilePackages: ['@kpi-nexus/contracts', '@kpi-nexus/ui']`
  - `experimental: {serverComponentsExternalPackages: []}`
  - Sentry config
- [ ] `apps/web/tailwind.config.ts` — extends `@kpi-nexus/ui/tailwind-preset`
- [ ] `apps/web/src/app/layout.tsx` — root layout with `<ThemeProvider attribute="class" defaultTheme="light">`
- [ ] `apps/web/src/app/page.tsx` — landing page placeholder:
  ```tsx
  export default function HomePage() {
    return (
      <main className="min-h-screen flex items-center justify-center bg-surface-bg">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-content-strong">KPI Nexus</h1>
          <p className="mt-2 text-content-muted">Measure what matters.</p>
        </div>
      </main>
    );
  }
  ```
- [ ] `apps/web/src/app/globals.css` — imports `@kpi-nexus/ui/tokens.css` + Tailwind directives
- [ ] `apps/web/playwright.config.ts` — config with `webServer: {command: 'pnpm dev', port: 3000}` for CI
- [ ] `apps/web/e2e/smoke.spec.ts`:
  ```typescript
  import { test, expect } from '@playwright/test';
  test('landing page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'KPI Nexus' })).toBeVisible();
  });
  ```
- [ ] One unit test: a component renders correctly

**Verify**: `pnpm --filter @kpi-nexus/web dev` starts at :3000; landing visible in browser; `pnpm test:e2e` passes.

### Task 11: Set up `apps/ml` (Python FastAPI)

**Files**: `apps/ml/pyproject.toml`, `apps/ml/requirements.txt`, `apps/ml/app/main.py`, `apps/ml/app/routers/health.py`, `apps/ml/Dockerfile`, `apps/ml/.env.example`

- [ ] `apps/ml/requirements.txt`:
  ```
  fastapi==0.115.0
  uvicorn[standard]==0.32.0
  pydantic==2.9.0
  python-dotenv==1.0.0
  scikit-learn==1.5.0
  prophet==1.1.5
  statsmodels==0.14.0
  numpy==1.26.0
  pandas==2.2.0
  pytest==8.3.0
  httpx==0.27.0
  ```
- [ ] `apps/ml/app/main.py`:
  ```python
  from fastapi import FastAPI
  from app.routers import health

  app = FastAPI(title="KPI Nexus ML Sidecar", version="0.1.0")
  app.include_router(health.router)
  ```
- [ ] `apps/ml/app/routers/health.py`:
  ```python
  from fastapi import APIRouter
  router = APIRouter(prefix="/health", tags=["health"])

  @router.get("")
  def health():
      return {"ok": True}

  @router.post("/echo")
  def echo(payload: dict):
      return {"received": payload}
  ```
- [ ] `apps/ml/Dockerfile`:
  ```dockerfile
  FROM python:3.12-slim
  WORKDIR /app
  COPY requirements.txt .
  RUN pip install --no-cache-dir -r requirements.txt
  COPY app/ ./app/
  EXPOSE 8000
  CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
  ```
- [ ] `apps/ml/.env.example`: `ML_SIDECAR_HMAC_SECRET=dev-ml-shared-secret`, `PORT=8000`
- [ ] `apps/ml/tests/test_health.py` — pytest unit test
- [ ] Add `apps/ml` to `turbo.json` ignored (Python doesn't pipe through Turbo) — use root `package.json` script `pnpm ml:dev` instead:
  ```json
  "ml:dev": "cd apps/ml && uvicorn app.main:app --reload --port 8000",
  "ml:test": "cd apps/ml && pytest"
  ```

**Verify**: `pnpm ml:dev` (after `pip install -r apps/ml/requirements.txt`); `curl localhost:8000/health` returns `{ok: true}`.

### Task 12: Write `scripts/setup-db.mjs`

**Files**: `scripts/setup-db.mjs`

- [ ] Probes Postgres connectivity with retries (10 × 1s)
- [ ] Runs `pnpm --filter @kpi-nexus/db prisma generate`
- [ ] Runs `pnpm --filter @kpi-nexus/db prisma db push --skip-generate`
- [ ] Applies `packages/db/prisma/sql/extensions.sql`
- [ ] Applies `packages/db/prisma/sql/rls-policies.sql` (empty in P0)
- [ ] Verifies TimescaleDB + pgvector extensions are enabled (query `pg_extension`)
- [ ] Exits non-zero on any failure
- [ ] Logs progress with simple ANSI colors

**Verify**: `docker-compose up -d postgres`; then `pnpm db:setup`; output shows all green checks.

### Task 13: docker-compose for local dev

**Files**: `infra/docker/docker-compose.yml`, `infra/docker/postgres-init.sql`

- [ ] `infra/docker/docker-compose.yml`:
  ```yaml
  version: '3.9'
  services:
    postgres:
      image: timescale/timescaledb-ha:pg16-all
      ports: ["5432:5432"]
      environment:
        POSTGRES_DB: kpi_nexus
        POSTGRES_USER: kpi_nexus
        POSTGRES_PASSWORD: dev_password
      volumes:
        - pg_data:/var/lib/postgresql/data
        - ./postgres-init.sql:/docker-entrypoint-initdb.d/init.sql
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U kpi_nexus -d kpi_nexus"]
        interval: 5s
        timeout: 3s
        retries: 10

    redis:
      image: redis:7-alpine
      ports: ["6379:6379"]
      healthcheck:
        test: ["CMD", "redis-cli", "ping"]
        interval: 5s

    minio:
      image: minio/minio:latest
      ports: ["9000:9000", "9001:9001"]
      environment:
        MINIO_ROOT_USER: minioadmin
        MINIO_ROOT_PASSWORD: minioadmin
      command: server /data --console-address ":9001"
      volumes:
        - minio_data:/data

    mailhog:
      image: mailhog/mailhog:latest
      ports: ["1025:1025", "8025:8025"]

    jaeger:
      image: jaegertracing/all-in-one:latest
      ports:
        - "16686:16686"  # web UI
        - "4318:4318"    # OTLP HTTP

  volumes:
    pg_data:
    minio_data:
  ```
- [ ] `infra/docker/postgres-init.sql`:
  ```sql
  CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
- [ ] Root `package.json` adds: `"docker:up": "docker compose -f infra/docker/docker-compose.yml up -d"`, `"docker:down": "docker compose -f infra/docker/docker-compose.yml down"`, `"docker:reset": "docker compose -f infra/docker/docker-compose.yml down -v"`

**Verify**: `pnpm docker:up`; check `docker ps` shows all 5 containers healthy.

### Task 14: GitHub Actions CI matrix

**Files**: `.github/workflows/ci.yml`, `.github/workflows/security.yml`, `.github/dependabot.yml`

- [ ] `.github/workflows/ci.yml`:
  ```yaml
  name: CI
  on:
    push:
      branches: [main]
    pull_request:
      branches: [main]

  jobs:
    ci:
      runs-on: ubuntu-latest
      strategy:
        matrix:
          task: [lint, typecheck, test, build]
      steps:
        - uses: actions/checkout@v4
        - uses: pnpm/action-setup@v4
          with: { version: 9 }
        - uses: actions/setup-node@v4
          with: { node-version: 20, cache: 'pnpm' }
        - run: pnpm install --frozen-lockfile
        - run: pnpm turbo ${{ matrix.task }}
          env:
            TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
            TURBO_TEAM: ${{ vars.TURBO_TEAM }}

    ml-ci:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-python@v5
          with: { python-version: '3.12' }
        - run: pip install -r apps/ml/requirements.txt
        - run: cd apps/ml && pytest
  ```
- [ ] `.github/workflows/security.yml`: gitleaks, CodeQL, npm audit
- [ ] `.github/dependabot.yml`: weekly pnpm + pip + GitHub Actions updates

**Verify**: push to a feature branch; CI matrix runs green.

### Task 15: VSCode settings + recommended extensions

**Files**: `.vscode/settings.json`, `.vscode/extensions.json`

- [ ] `.vscode/settings.json`: format on save, eslint auto-fix, tailwind IntelliSense paths
- [ ] `.vscode/extensions.json`: recommend Prisma, Tailwind CSS IntelliSense, ESLint, Prettier, Vitest Explorer, Playwright Test, Python

### Task 16: Update root .env.example + secrets handling

**Files**: `.env.example` at root

- [ ] Root `.env.example`:
  ```
  # Database
  DATABASE_URL=postgresql://kpi_nexus:dev_password@localhost:5432/kpi_nexus

  # Redis
  REDIS_URL=redis://localhost:6379

  # MinIO (S3-compatible)
  S3_ENDPOINT=http://localhost:9000
  S3_ACCESS_KEY=minioadmin
  S3_SECRET_KEY=minioadmin
  S3_BUCKET=kpi-nexus-local

  # Email (Mailhog catches everything locally)
  SMTP_HOST=localhost
  SMTP_PORT=1025

  # OpenTelemetry
  OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

  # Sentry (leave empty locally)
  SENTRY_DSN=

  # API
  API_PORT=4000
  JWT_SECRET=dev-jwt-secret-change-in-prod
  ML_SIDECAR_HMAC_SECRET=dev-ml-shared-secret

  # ML sidecar
  ML_SIDECAR_URL=http://localhost:8000

  # AI providers (BYO in dev; platform keys in prod)
  GEMINI_API_KEYS=key1,key2,key3
  ANTHROPIC_API_KEY=
  OPENAI_API_KEY=
  OLLAMA_BASE_URL=http://localhost:11434
  BYO_ENCRYPTION_KEY=dev-encryption-key-32-bytes-long-replace
  ```
- [ ] Verify each `.env.example` per app is consistent with the root

### Task 17: First commit + tag

- [ ] `git add .`
- [ ] `git commit -m "chore(p0): foundation — repo scaffold + CI + docker + empty apps boot"`
- [ ] After all exit criteria pass: `git tag p0-complete`

## Acceptance checklist (verify before moving to P1)

Run each in order. Each must succeed.

```bash
# 1. Install dependencies
pnpm install

# 2. Bring up infra
pnpm docker:up
docker ps   # 5 containers healthy

# 3. Set up DB
pnpm db:setup
# expect green checks for postgres reachable, extensions installed, schema pushed

# 4. Start all apps (in separate terminals or via turbo)
pnpm dev
# expect web on :3000, api on :4000, worker connected to redis, ml on :8000

# 5. Hit health endpoints
curl http://localhost:4000/health   # {db: "ok", redis: "ok"}
curl http://localhost:8000/health   # {ok: true}
open http://localhost:3000          # landing page visible

# 6. Run tests
pnpm test                            # all unit tests green
pnpm --filter @kpi-nexus/web test:e2e  # smoke spec passes

# 7. Run CI tasks locally
pnpm lint                            # 0 errors
pnpm typecheck                       # 0 errors
pnpm build                           # all artifacts in dist/.next/

# 8. CI gate (push to branch + open PR)
# expect all matrix jobs green
```

If all 8 steps pass, tag `git tag p0-complete` and proceed to P1.

## Gotchas + notes

- **TimescaleDB image**: use `timescale/timescaledb-ha:pg16-all` — it includes pgvector + other extensions out of the box and matches Fly.io's recommended image for production
- **Prisma 6 + TimescaleDB**: Prisma 6 added `extensions` support in the datasource block; older versions used a separate driver
- **Turbo remote cache**: free Vercel tier; set `TURBO_TOKEN` + `TURBO_TEAM` in GitHub secrets/vars
- **Windows path separators**: use forward slashes in scripts (`/`) for cross-platform; PowerShell handles both but bash in CI doesn't
- **`pnpm install --frozen-lockfile` in CI**: ensures reproducible installs; commit `pnpm-lock.yaml`
- **Worker scaling**: in prod, run worker as a separate Fly.io app (different `fly.toml`) so it can scale independently from api
- **Sentry init order**: must be the very first thing in `main.ts` so it catches early errors
- **OTel init**: similarly, `import` it before anything else
- **Hot reload tip**: `nest start --watch` watches via tsc-watch; sometimes loses changes — `pnpm dev` from root will restart cleanly

## Out of scope for P0 (do NOT add)

- Any Prisma models beyond extensions (lands in P1)
- Any modules beyond Health (lands in P1+)
- Auth, RBAC, multi-tenancy (P1)
- Frontend UI beyond landing page (P1+)
- BullMQ queues beyond echo test (used in P1+)
- AI integration (P5)
- ML endpoints beyond /health and /echo (P5)
- Terraform infra (P9 if needed; Fly.io fly.toml is sufficient for now)

## What comes next

Once P0 is tagged complete, open `docs/superpowers/plans/P1-identity-tenancy-rbac.md` and follow the same execution pattern. P1 is significantly larger (~4 weeks) because it builds the entire auth + tenancy + RBAC foundation that everything else depends on.
