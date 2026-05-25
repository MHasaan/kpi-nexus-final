# P9 — Polish Implementation Plan

| | |
|---|---|
| **Phase** | P9 — Polish |
| **Goal** | Enterprise-grade — SSO, SCIM, custom domains, i18n, soft-delete UI, global search, activity feed, plugin sandbox hardening, a11y compliance, performance budgets enforced, OpenAPI clean |
| **Effort** | ≈3 weeks solo |
| **Depends on** | P0–P8 |
| **Blocks** | None — last phase before v1.0 |
| **Spec reference** | §3.8 rest (SsoConfig/ScimToken), §4.10 rest (Search/Activity), §10 (perf), §12 (a11y) |

## Why this phase matters

P0–P8 ship a working SaaS. P9 makes it enterprise-shippable — SSO for IT departments, SCIM for HRIS auto-provisioning, custom domains for branding, i18n for global users, a11y for compliance, perf budgets so it doesn't slow down at scale. P9 is fully cuttable except a11y if you need to ship earlier.

## Exit criteria

- [ ] SAML round-trip with Okta dev tenant green
- [ ] SCIM: Okta provisions user → User row appears with status=INVITED → admin completes → status=ACTIVE; PATCH active=false → SUSPENDED; DELETE → ARCHIVED
- [ ] axe-core: 0 violations on top 10 pages (CI gate)
- [ ] k6 load test: 100 RPS sustained, p95 < 800ms
- [ ] Lighthouse Performance ≥ 90 on all top routes
- [ ] GDPR export < 30s
- [ ] OpenAPI Spectral lint passes; TypeScript SDK regenerates cleanly
- [ ] i18n: switch to ur-PK → layout flips to RTL → translated strings render
- [ ] Soft-delete UI: archived KPI/Dashboard/User restorable within 30 days
- [ ] Tag `git tag p9-complete` + `git tag v1.0.0`

## Schema additions

### Migration: `019_sso_scim_polish`

```prisma
enum SsoProtocol { SAML OIDC }

model SsoConfig {
  id                          String       @id @default(cuid())
  organizationId              String       @unique
  protocol                    SsoProtocol
  idpEntityId                 String?      // SAML
  idpSsoUrl                   String?      // SAML
  idpMetadataUrl              String?      // OIDC discovery
  encryptedCertificate        String?      // SAML X.509 cert
  allowJitProvisioning        Boolean      @default(true)
  defaultRoleId               String?
  isActive                    Boolean      @default(false)
  createdAt                   DateTime     @default(now())
  updatedAt                   DateTime     @updatedAt
}

model ScimToken {
  id              String   @id @default(cuid())
  organizationId  String
  label           String
  hashedToken     String   @unique
  expiresAt       DateTime?
  lastUsedAt      DateTime?
  revokedAt       DateTime?
  createdAt       DateTime @default(now())
  createdById     String
  @@index([organizationId, revokedAt])
}
```

## Backend modules

### Module 1: SsoModule

**Files**: `sso.module.ts`, `sso.controller.ts`, `services/saml.service.ts`, `services/oidc.service.ts`, `services/jit-provisioning.service.ts`

- [ ] WorkOS provider integration (managed SAML/OIDC) — simpler than rolling our own
- [ ] `SsoService.initiateLogin(orgSlug)` — redirects to IdP SSO URL
- [ ] `SsoService.handleCallback(samlAssertion | oidcCode)`:
  - Validates assertion/code against `SsoConfig`
  - Extracts user attributes (email, name, role hints)
  - JIT provisions User if not exists (status=ACTIVE, role=defaultRoleId)
  - Issues JWT pair
- [ ] Endpoints:
  - `GET /sso/login?orgSlug=` — initiates flow
  - `POST /sso/saml/callback` — SAML assertion
  - `GET /sso/oidc/callback` — OIDC code
  - `GET/PUT /sso/config` (ORG_SETTINGS) — admin config

### Module 2: ScimModule

**Files**: `scim.module.ts`, `scim.controller.ts`, `scim-users.service.ts`, `scim-groups.service.ts`, `*.spec.ts`

- [ ] RFC 7644 endpoints under `/scim/v2/*`:
  - `ServiceProviderConfig` (discovery)
  - `ResourceTypes` (Users + Groups)
  - `GET /Users?filter=` — list with `userName eq "..."` filter
  - `POST /Users` — create (provision)
  - `GET /Users/:id` — single
  - `PATCH /Users/:id` — accepts both flat (`{active: false}`) and canonical PatchOp envelope (`{Operations: [{op, path?, value}]}`)
  - `PUT /Users/:id` — replace
  - `DELETE /Users/:id` — archive
  - `GET /Groups?filter=` — list (backed by RoleDefinition)
  - `GET /Groups/:id`
  - `PATCH /Groups/:id` — add/remove members (Okta-style `members[value eq "<id>"]` filter)
- [ ] Auth: ApiKey + `scim:provision` scope via `ScimScopeGuard`
- [ ] `flattenScimUserPatch()` — accepts flat or PatchOp; ignores unsupported `remove` on user attrs
- [ ] PATCH `active=false` → `UsersService.suspend(id)` (status=SUSPENDED + revoke refresh tokens + invalidate permission cache; **reversible** via `active=true`)
- [ ] DELETE → `UsersService.archive(id)`
- [ ] Group membership maps to `User.roleId`; cross-tenant IDs silently dropped
- [ ] 20 unit tests (extends Round 24 stub from spec)

### Module 3: SearchModule

- [ ] `SearchService.search(q, {types?, limit?})`:
  - Runs 4 parallel `findMany`s (KPI, Dashboard, User, OrgUnit) with `contains/insensitive` ILIKE matching
  - KPI also matches `tags` exact
  - Per-row scoring: exact 1.0 / prefix 0.8 / substring 0.5
  - Merge sort-desc by score
  - Per-type cap 12, overall cap 50
  - Soft-deleted KPI/Dashboard and PURGED users filtered out
- [ ] `GET /search?q=&types=&limit=` (auth)
- [ ] 5 unit tests
- [ ] **Future**: PG FTS swap (`to_tsvector` + GIN); current substring is sufficient for FYP scale

### Module 4: ActivityModule

- [ ] `ActivityService.list({userId?, entityType?, action?, from?, to?, cursor?, limit?})` — returns AuditLog rows with side-loaded user names; cursor pagination via `nextCursor` (peek-ahead pattern)
- [ ] `GET /activity?userId=&entityType=&action=&from=&to=&limit=&cursor=` (auth; admins see all, others see own)
- [ ] 4 unit tests

### Module 5: GdprModule extended

- [ ] `GdprService.deleteUser(userId, {hardDelete?})`:
  - Cascade per offboarding (transfer KPIs, reparent reports, etc.)
  - If `hardDelete`: PURGE per existing `UsersService.purge` (PII redaction)
  - Returns audit summary
- [ ] `POST /users/:id/delete?hardDelete=true` (ORG_SETTINGS)

### Module 6: Custom domain ACM cert provisioning (extension)

- [ ] Lambda or scheduled worker that, for each `CustomDomain.verifiedAt IS NOT NULL`, calls AWS ACM `RequestCertificate` then `DescribeCertificate` to track validation
- [ ] OR document a manual workflow for FYP scope (cert per domain via Cloudflare or Let's Encrypt manually)

### Module 7: Retention tier presets (extension)

- [ ] `RETENTION_TIERS` constant: FREE (90d) / PRO (1yr) / ENTERPRISE (7yr)
- [ ] `POST /retention-policies/apply-tier {tier}` — one-click apply to all entity types
- [ ] Endpoint: `GET /retention-policies/tiers/list`

### Module 8: Plugin sandbox hardening

- [ ] `Plugin.type=FORMULA_FN` execution: load entryUrl as JS module → run in isolated-vm with 100ms/32MB limits (per-tenant)
- [ ] `Plugin.type=WIDGET` rendering: iframe sandbox with `sandbox="allow-scripts"` attribute; message-passing API for KPI data + theme tokens
- [ ] No network, no DOM access outside iframe, no parent-window scripting

### Module 9: OpenAPI + SDK generation

- [ ] `nestjs-zod` decorator integration — auto-generate OpenAPI from Zod schemas + Nest controllers
- [ ] Spec served at `/api/v1/openapi.json`
- [ ] Spectral lint config (`.spectral.yaml`) enforcing best practices
- [ ] TypeScript SDK auto-gen into `packages/sdk/` via `openapi-typescript-codegen`
- [ ] CI regenerates SDK on schema change; commit diff = surface area of API change

## Frontend

### Soft-delete restore UIs

- [ ] `/kpis/archive` — soft-deleted KPI list with:
  - Per-row: name + deletedAt + countdown to purge (30d default)
  - Actions: Restore (clears deletedAt) + Purge now (hard delete)
- [ ] `/dashboards/archive` — same for dashboards
- [ ] User trash list under `/users` (filter "Archived"): restore + hard purge actions

### i18n scaffolding

- [ ] `apps/web/src/i18n/dictionaries/` — JSON files per locale:
  - `en-US.json`, `es.json`, `fr.json`, `ur-PK.json`
- [ ] `apps/web/src/i18n/get-dictionary.ts` — `getDictionary(locale)` server-side helper
- [ ] `apps/web/src/i18n/t.ts` — `t(key, locale)` helper with fallback
- [ ] `<LocaleProvider>` Context provider
- [ ] `useTranslations()` client hook
- [ ] Layout resolves locale: `locale` cookie → `User.language` → `en-US`
- [ ] Sets `dir="rtl"` on body when locale is ur-PK
- [ ] Locale picker on `/me` writes both `User.language` (cross-device) and the `locale` cookie (next-render)
- [ ] Initial translation: only `/me` page fully translated (PoC); other pages translated incrementally
- [ ] KPI/role names per-locale deferred (data-side translations)

### Global search

- [ ] Global search bar in AppHeader (also ⌘K command palette)
- [ ] Type to search → debounced 300ms → grouped results (KPIs / Dashboards / Users / Units)
- [ ] Keyboard navigation through results
- [ ] Recent searches saved to localStorage

### Activity feed

- [ ] `/activity` page — server-rendered timeline with cursor pagination
- [ ] Filters: user, entity type, action, date range
- [ ] Click row → drill to entity

### In-app help drawer (full)

- [ ] `<HelpDrawer>` — slide-in right drawer with:
  - `CONTEXTUAL_HELP` registry maps pathname patterns to per-route tip cards
  - Tip cards for: KPIs, KPI import, strategy map, dashboards, org units, notifications, alerts, status
  - "General" section at bottom always visible
- [ ] First open writes `helpDrawerSeen` flag

### Sample-data toggle

- [ ] In `/settings/admin` (or similar): "Fill with demo data" button → POSTs `/organizations/seed-demo-data`
- [ ] Instantiates 5 curated KPIs (MRR/NPS/Churn/Deployment Frequency/Engagement Score) + 30 days deterministic-pseudorandom data points
- [ ] Idempotent (skips already-seeded)

### Status page

- [ ] `/status` page reads `/health/details`:
  - Status badge (green/amber/red)
  - Per-component dots + latency + version
  - Process stats (uptime, RSS, heap, node version)
- [ ] Also available at `status.kpinexus.app` via custom domain (if configured)

### Accessibility hardening

- [ ] axe-core via `@axe-core/playwright` — CI gate: 0 violations on top 10 pages
- [ ] Color-contrast token audit — verify 4.5:1 body / 3:1 UI components
- [ ] Add ARIA labels to all remaining charts (the SeriesChart pattern from earlier — `role="img"` + summary aria-label generated by `summariseAria()`)
- [ ] Keyboard navigation pass: every interactive element reachable with Tab; visible focus ring; ESC closes panels
- [ ] Skip-to-content link on every page
- [ ] `lang` attribute matches user locale

### Performance hardening

- [ ] Bundle budget enforcement — track JS size per route via `next-bundle-analyzer`; fail CI on regression
- [ ] RSC streaming on dashboard route (already Server Components; ensure streaming boundary placement)
- [ ] Route-level prefetch (`next/link` `prefetch` for nav items)
- [ ] Lighthouse CI on every PR; fail if Performance < 90 on top 10 routes
- [ ] k6 load test script: 100 RPS sustained, p95 < 800ms; run in CI on schedule (weekly)

### SSO config UI

- [ ] `/settings/sso` — form: protocol (SAML/OIDC) + IdP URLs + cert upload + JIT provisioning toggle + default role + test login button

### SCIM token management

- [ ] `/settings/scim` — list with label + lastUsedAt + revoke; mint form (label) returns plaintext bearer ONCE

### Retention UI

- [ ] `/settings/retention` — per-entity policies + tier preset cards (FREE/PRO/ENTERPRISE) one-click apply + run-now + schedule-daily buttons

### Custom domain UI (already in P1; extended here)

- [ ] `/settings/custom-domain` — DNS TXT verification flow with last-checked-at + last-check-error diagnostics; once verified, automatic ACM cert request (or document manual flow)

## Tests

### Unit tests
- [ ] SsoService: 5+ cases (SAML happy, OIDC happy, JIT provisioning, invalid assertion, expired)
- [ ] ScimUsersService: 20+ cases (CRUD + PATCH flat + PATCH PatchOp + active flip + filter)
- [ ] ScimGroupsService: 10+ cases (members add/remove + cross-tenant filter)
- [ ] SearchService: 5 cases
- [ ] ActivityService: 4 cases (cursor pagination, filters)

### Integration tests
- [ ] SSO end-to-end with mocked IdP
- [ ] SCIM provisioning round-trip with simulated Okta calls

### e2e tests
- [ ] `apps/web/e2e/i18n-rtl.spec.ts` — switch to ur-PK → body has `dir="rtl"` + translated string visible
- [ ] `apps/web/e2e/soft-delete-restore.spec.ts` — create KPI → soft-delete → /kpis/archive → restore → visible again
- [ ] `apps/web/e2e/help-drawer.spec.ts` — open from header → tip cards visible per route
- [ ] `apps/web/e2e/global-search.spec.ts` — search via ⌘K → grouped results

### Performance + a11y tests
- [ ] Lighthouse CI on PR preview: Performance ≥ 90 + Accessibility = 100 on top 10 routes
- [ ] axe-core via Playwright: 0 violations on top 10 pages (CI gate)
- [ ] k6: `k6 run scripts/load-test.js` — 100 RPS sustained, p95 < 800ms
- [ ] GDPR export <30s manual test

### SDK regeneration test
- [ ] `pnpm sdk:regenerate` — check that `packages/sdk/` regenerates cleanly with no diff if API hasn't changed
- [ ] Spectral lint on OpenAPI spec passes

## Acceptance checklist

```bash
# 1. Tests
pnpm test && pnpm test:int
pnpm --filter @kpi-nexus/web test:e2e

# 2. SAML round trip
# a. Configure SsoConfig with Okta dev tenant SAML
# b. Open /sso/login?orgSlug=myorg → redirects to Okta
# c. Authenticate at Okta → redirects to /sso/saml/callback
# d. Land in app as User (auto-provisioned if JIT enabled)

# 3. SCIM provisioning
# a. Mint SCIM ApiKey with scope=scim:provision
# b. Configure Okta SCIM app to point at /scim/v2 with bearer token
# c. Assign user in Okta → POST /Users called → User row appears with status=INVITED
# d. Admin completes invitation → status=ACTIVE
# e. In Okta, deactivate user → PATCH active=false → User.status=SUSPENDED
# f. In Okta, delete assignment → DELETE → User.status=ARCHIVED

# 4. axe-core
pnpm --filter @kpi-nexus/web exec playwright test --config=playwright.a11y.config.ts
# Expect: 0 violations on /login, /, /kpis, /kpis/[id], /dashboards, /alerts, /users, /roles, /settings, /audit

# 5. k6
k6 run scripts/load-test.js --duration 5m
# Expect: p95 < 800ms at 100 RPS sustained

# 6. Lighthouse
pnpm --filter @kpi-nexus/web exec lhci autorun
# Expect: Performance ≥ 90 on all configured routes

# 7. GDPR export
# a. POST /users/:id/export
# b. Time the response
# c. Verify < 30s for an org with reasonable data

# 8. i18n RTL
# a. Switch locale to ur-PK on /me
# b. Reload → body has dir="rtl" + translated /me page
# c. Other pages still en-US (PoC scope)

# 9. OpenAPI clean
pnpm spectral lint apps/api/openapi.json
pnpm sdk:regenerate && git diff packages/sdk/  # expect: no diff if API unchanged

# 10. CI green
```

Tag `git tag p9-complete` + `git tag v1.0.0`.

## Gotchas + notes

- **WorkOS vs roll-your-own SSO**: WorkOS handles SAML/OIDC heterogeneity (multiple IdPs); ~$0 for FYP scale
- **SCIM 7644 is finicky**: PatchOp envelope vs flat differs by IdP (Okta uses both); be lenient on parsing
- **i18n: don't deep-translate yet**: PoC only. Full coverage requires extracting every string in the codebase (massive); incremental ok
- **a11y**: charts are the hard part; SVG with `role="img"` + summary aria-label is the standard pattern
- **k6 load test**: don't run against prod; use a staging env with realistic seed data
- **Bundle budget**: focus on the routes users hit most — /, /kpis, /dashboards; allow others to grow
- **Custom domain ACM**: requires AWS account; for FYP, document manual cert workflow as fallback
- **Plugin sandbox**: iframe with restricted `sandbox` attribute is the simplest secure boundary; verify CSP allows it
- **SDK regen**: lock to a specific openapi-typescript-codegen version; tools change often

## Out of scope for P9

- Marketing landing page (post-launch concern)
- Stripe billing (locked decision: schema-ready, wiring deferred)
- Multi-region (locked decision: single region for FYP)
- Native mobile apps (web only)
- Real-time collaborative editing (out of scope)

## What comes next

Once P9 is tagged complete + v1.0.0 tagged, the rebuild is **shippable**. Next chapters (not part of this rebuild plan):

1. **Frontend Claude Design session** — produce final visual design per spec §12 brief
2. **Beta program** — recruit 3-5 design-partner orgs
3. **Stripe billing wiring** — when first paying customer signs up
4. **Mobile app** — if validated by users
5. **Real-time collaborative editing** — if validated

But for the FYP submission: tagging v1.0.0 with all 10 phase plans complete is the end.
