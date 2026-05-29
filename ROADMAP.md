# Roadmap — KPI Nexus Final

Master index for the 10-phase delivery plan. Each phase is shippable on its own. Each phase has a detailed plan in `docs/superpowers/plans/`.

**Status legend**:
- ⬜ Not started
- 🟨 In progress
- ✅ Complete
- ⏸️ Blocked

| Phase | Goal | Effort | Status | Plan |
|---|---|---|---|---|
| P0 | Foundation — repo scaffold + CI + docker-compose + empty apps boot | 2 wk | ✅ | [P0-foundation.md](./docs/superpowers/plans/P0-foundation.md) |
| P1 | Identity + Tenancy + 18-permission RBAC + basic onboarding stub | 4 wk | ✅ | [P1-identity-tenancy-rbac.md](./docs/superpowers/plans/P1-identity-tenancy-rbac.md) |
| P2 | KPI engine + formulas + cascades + targets + thresholds + TimescaleDB | 5 wk | ✅ | [P2-kpi-engine.md](./docs/superpowers/plans/P2-kpi-engine.md) |
| P3 | Visualization + reporting + SSE real-time + public share + embeds | 4 wk | ✅ | [P3-visualization.md](./docs/superpowers/plans/P3-visualization.md) |
| P4 | Alerting + escalation + notifications + dedup + digest + DLQ | 3 wk | ✅ | [P4-alerting.md](./docs/superpowers/plans/P4-alerting.md) |
| P5 | AI layer — providers + budget + NLQ + insights + recs + ML sidecar | 5 wk | ⬜ | [P5-ai-layer.md](./docs/superpowers/plans/P5-ai-layer.md) |
| P6 | Onboarding 2.0 + AI co-pilot + drafts + templates + setup checklist | 3 wk | ⬜ | [P6-onboarding-v2.md](./docs/superpowers/plans/P6-onboarding-v2.md) |
| P7 | Collaboration — tasks + comments + mentions + OKRs + approvals | 4 wk | ⬜ | [P7-collaboration.md](./docs/superpowers/plans/P7-collaboration.md) |
| P8 | Integrations + connectors + email-in + webhooks + API keys + plugins | 4 wk | ⬜ | [P8-integrations.md](./docs/superpowers/plans/P8-integrations.md) |
| P9 | Polish — SSO + SCIM + custom domains + i18n + a11y + perf | 3 wk | ⬜ | [P9-polish.md](./docs/superpowers/plans/P9-polish.md) |

**Total: ~37 weeks solo (≈8.5 months full-time).** Achievable in calendar 12 months with normal life happening.

---

## Phase summaries

### P0 — Foundation

**Goal**: `pnpm dev` boots all 4 apps + Postgres + Redis + MinIO + Mailhog locally; CI green from commit #1.

**What ships**: Turborepo with `apps/{web,api,worker,ml}` + `packages/{contracts,db,ai,formula,ui,config}`. NestJS + Next.js + Python FastAPI skeletons. docker-compose. GitHub Actions CI matrix. Prisma schema with extensions only. `pnpm db:setup` script. One smoke test per app + one Playwright landing page test.

**Exit criteria**: All 4 apps boot, `/health` returns 200, CI green, `prisma migrate deploy` works against compose Postgres with TimescaleDB extension verified.

### P1 — Identity, Tenancy, RBAC

**Goal**: Register an org, complete a basic onboarding stub, manage users/roles/positions/units, every API call enforced by 18-permission RBAC.

**What ships**: AuthModule + TenancyModule + UsersModule + MfaModule + PasswordModule + PlatformAdminModule + OrganizationsModule + CustomDomainModule + RbacModule + RolesModule + PositionsModule + PermissionDelegationsModule + ResourcePermissionsModule + OrgUnitDimensionsModule + OrgUnitTypesModule + OrgUnitsModule + AuditModule + BillingModule (schema only) + RateLimitModule + HealthModule. Frontend auth pages + org settings + user/role/position/org-unit management + audit viewer + onboarding wizard stub.

**Exit criteria**: Cross-tenant fuzz green; e2e UC-01/02/11 pass; happy-path register→wizard→invite→gating→audit visible; MFA TOTP works; refresh-token reuse-detection works; Postgres RLS enforced.

### P2 — KPI Engine + Data Layer

**Goal**: KPIs versioned, formulas sandboxed, dependency DAG, hierarchical cascade, time-series in TimescaleDB hypertable with sub-100ms aggregate queries.

**What ships**: KpiCategoriesModule + KpisModule + KpiTemplatesModule + FormulaModule (+ `packages/formula`) + CalculationEngineModule + DataPointsModule + KpiTargetsModule + KpiThresholdBandsModule + KpiBenchmarksModule + KpiCascadesModule + LineageModule + UserKpisModule + OrgUnitKpisModule. TimescaleDB hypertable + 5 CAGGs. Frontend KPI builder + detail + formula editor + cascade tree + target editor + threshold bands + benchmarks + bulk CSV import + lineage SVG + archive.

**Exit criteria**: Dashboard summary <100ms p95 at 1000 KPIs × 365 days; formula evaluator passes 50+ tests inc. sandbox escapes; cascade rollup correct; e2e UC-03/04 pass; **scope isolation: PER_USER posted via wrong endpoint returns 422**; **cross-user isolation test passes**.

### P3 — Visualization & Reporting

**Goal**: Drag-drop dashboard builder, real-time updates, scheduled exports, drill-down, cross-filtering, public share.

**What ships**: DashboardsModule + DashboardSnapshotsModule + DashboardShareLinksModule + RealtimeModule + ReportsModule. Frontend dashboard list/create/detail + drag-drop builder + 10+ widget types + SSE real-time refresh + drill-down + scheduled report UI + public share viewer + embed generator + board-pack composer + print stylesheets.

**Exit criteria**: 12-widget dashboard renders <3s p95; SSE <500ms across 2 tabs; scheduled report cron triggers + emails within 30s; Lighthouse Performance ≥90 on dashboard.

### P4 — Alerting

**Goal**: Alert rules evaluated post-data-point, escalations fan out, multi-channel delivery with retry+DLQ, alert fatigue control via dedup+digest.

**What ships**: AlertRulesModule + AlertEngineModule + EscalationsModule + NotificationChannelsModule + NotificationsModule. Frontend alert rule builder + escalation editor + channel CRUD + alert inbox + DLQ admin view + per-user notification prefs.

**Exit criteria**: Alert latency <10s p95; escalation level fires after delay; retry survives provider 5xx (eventual delivery within 30 min); digest mode collates 5 alerts in 60s.

### P5 — AI Layer

**Goal**: Multi-provider AI working end-to-end with budget caps, NLQ chat answering real questions, recommendations triggering on alerts, insights generating daily, anomaly+forecasting via ML sidecar.

**What ships**: AiModule (core) + AnomalyDetectionModule + ForecastsModule + WhatIfModule + KpiSuggestionsModule + InsightsModule + RecommendationsModule + NlqModule. ML sidecar implementing `/anomaly/detect` `/forecast` `/whatif` `/correlation` `/seasonality`. Frontend AI settings + NLQ chat + insights feed + recommendations panel + anomaly viz + forecast viz + what-if simulator.

**Exit criteria**: Per-org Claude spend <$1/day with default settings; provider failover works; NLQ 18/20 golden questions correct; anomaly F1 ≥0.7; forecast MAPE ≤15% at 90-day; e2e UC-06/07/08 pass.

### P6 — Onboarding 2.0 + AI Co-pilot

**Goal**: Replace the P1 wizard stub with the full sidebar-primary 3-pane experience: AI co-pilot, drafts, templates, can express full org depth.

**What ships**: OnboardingModule (extended with auto-save + resume + sample data) + OnboardingAiModule (4 modes: generator/assistant/suggest/explain) + OrgTemplatesModule (tiered) + SetupChecklistModule (14 default tasks). Frontend 3-pane wizard shell + entry splash + 5 step routes + AI co-pilot rail + DraftSyncProvider + post-onboarding setup checklist page.

**Exit criteria**: A new admin can reproduce the full original-app seed.ts demo org (10 roles, 14 positions, 11 units, 20 KPIs, 5 categories) in a single onboarding session; AI generator returns reasonable JSON in <30s; draft survives browser crash.

### P7 — Collaboration & Workflow

**Goal**: Tasks, comments, mentions, approvals, OKRs working end-to-end.

**What ships**: TasksModule + CommentsModule + MentionsModule + OkrsModule + ApprovalsModule + WorkflowsModule (generic rule engine). Frontend kanban + comment drawers + mentions inbox + OKR pages + approval inbox + workflow editor.

**Exit criteria**: OKR objective with mixed KR types aggregates correctly; KPI update with approval workflow → 202 → approver approves → patch replays; comment with @mention creates Mention row in same transaction; workflow rule engine triggers tasks on KPI change.

### P8 — Integrations & Extensibility

**Goal**: Pull connectors live (REST + GraphQL + Postgres), Slack/Teams/Jira integrations functional, inbound email, outbound webhooks, plugins, API keys.

**What ships**: IntegrationsModule + SlackModule + TeamsModule + JiraModule + InboundEmailModule + ConnectorsModule + IngestModule + WebhooksModule + ApiKeysModule + PluginsModule. Frontend integrations marketplace + connector wizard + API key management + webhook management + plugin gallery.

**Exit criteria**: Slack alert action button → ack syncs back; Jira issue lifecycle round-trip; REST connector pulls daily for a week; inbound email → comment on KPI; API key with `kpi:data_entry` scope can `POST /ingest` but not `POST /kpis`.

### P9 — Polish

**Goal**: Enterprise-grade — SSO, SCIM, custom domains, i18n, soft-delete UI, global search, activity feed, plugin sandbox hardening, a11y compliance, performance budgets, OpenAPI clean.

**What ships**: SsoModule + ScimModule + SearchModule + ActivityModule + GdprModule (full delete) + KMS data key wiring. Frontend soft-delete UIs + onboarding tour + help drawer + sample-data toggle + global search bar + activity feed + i18n (4 locales) + status page. axe-core enforcement + bundle budget enforcement + RSC streaming + OpenAPI/SDK regeneration.

**Exit criteria**: SAML round-trip with Okta dev tenant; SCIM Okta provisions user → INVITED → admin completes → ACTIVE; axe-core 0 violations on top 10 pages; k6 100 RPS p95 <800ms; Lighthouse ≥90 all top routes; GDPR export <30s; OpenAPI Spectral clean.

---

## Cross-cutting always-on

Throughout every phase:

- CI green on every commit (lint, typecheck, unit, integration, cross-tenant fuzz, security scans)
- Cross-tenant fuzz extended with each new endpoint
- Per-phase exit criteria block phase advancement
- Architectural decision changes update the spec; breaking deviations add an ADR in `docs/adrs/`
- Tag at phase completion: `git tag p0-complete`, `p1-complete`, etc.

---

## MVP cut points

If you need to ship earlier than 37 weeks:

- **After P5 + P6** (26 wk): full functional product with AI, dashboards, alerts, onboarding. Defer P7-P9.
- **After P3 + P4** (18 wk): solid SaaS without AI. Defer P5+.
- **P9 fully cuttable** except a11y enforcement.

---

## Re-baselining

If a phase takes meaningfully longer than estimated, update the status in this table and add a note to the affected phase plan explaining what blocked. Don't silently slip — surface delays so we can decide whether to cut scope or push downstream phases.
