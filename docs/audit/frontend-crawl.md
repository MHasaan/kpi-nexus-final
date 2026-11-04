# Frontend page crawl

Generated 2026-10-03T06:21:07.668Z by `apps/web/e2e/audit/page-crawl.spec.ts` — 80 routes × 4 passes. Details per page in [frontend-crawl.json](./frontend-crawl.json).

| Route | Admin | Contributor (tom.becker) | Logged out | Admin @ 375 px |
|---|---|---|---|---|
| `/` | ✅ → /dashboard (3.6s) | ⚠️ empty (3.4s) | ✅ (4.0s) | ⚠️ empty (13.6s) |
| `/accept-invitation` | ✅ (13.3s) | ✅ (10.8s) | ✅ (4.0s) | ✅ (9.8s) |
| `/activity` | ✅ (12.2s) | ✅ (7.3s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.2s) | ✅ (5.5s) |
| `/alerts` | ✅ (11.6s) | ✅ (8.9s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.2s) | ✅ (7.3s) |
| `/alerts/[id]` | ✅ (11.6s) | ⚠️ 1×4xx, ⚠️ 1 console (7.7s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.4s) | ✅ (12.1s) |
| `/alerts/channels` | ✅ (9.1s) | ⚠️ 1×4xx, ⚠️ 1 console, ⚠️ empty (6.3s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.2s) | ✅ (7.5s) |
| `/alerts/new` | ✅ (6.6s) | ⚠️ 1×4xx, ⚠️ 1 console (7.8s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.1s) | ✅ (7.3s) |
| `/approvals` | ✅ (10.1s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (13.6s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.2s) | ✅ (5.7s) |
| `/ask` | ✅ (9.9s) | ✅ (10.3s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.2s) | ✅ (7.0s) |
| `/billing` | ✅ (7.3s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (6.2s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.1s) | ✅ (5.5s) |
| `/connectors` | ✅ (5.7s) | ⚠️ 1×4xx, ⚠️ 1 console (9.8s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.1s) | ✅ (4.0s) |
| `/connectors/[id]` | ✅ (8.5s) | ⚠️ 2×4xx, ⚠️ 1 console (11.6s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.3s) | ✅ (4.3s) |
| `/dashboard` | ✅ (3.3s) | ✅ (4.5s) | ⚠️ 2×4xx, ⚠️ 1 console → /login (4.9s) | ✅ (3.2s) |
| `/dashboards` | ✅ (18.9s) | ✅ (10.0s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (5.5s) | ✅ (7.1s) |
| `/dashboards/[id]` | ⚠️ 2 console (13.4s) | ⚠️ 2 console (14.0s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (5.5s) | ⚠️ 2 console (10.5s) |
| `/dashboards/[id]/share` | ⚠️ 2 console (6.3s) | ⚠️ 2 console (10.6s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.5s) | ⚠️ 2 console (5.3s) |
| `/dashboards/[id]/snapshots` | ✅ (13.2s) | ✅ (9.2s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.4s) | ✅ (6.1s) |
| `/dashboards/[id]/widgets/[wid]` | ✅ (11.1s) | ✅ (7.1s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.4s) | ⚠️ overflow 93px (4.8s) |
| `/dashboards/archive` | ✅ (17.1s) | ✅ (8.0s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.3s) | ✅ (6.6s) |
| `/dashboards/new` | ✅ (10.2s) | ✅ (5.4s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.3s) | ✅ (18.1s) |
| `/embed/kpi/[token]` | ✅ → /embed/kpi/<token> (8.4s) | ✅ → /embed/kpi/<token> (6.5s) | ✅ → /embed/kpi/<token> (4.4s) | ✅ → /embed/kpi/<token> (20.1s) |
| `/insights` | ✅ (7.3s) | ✅ (6.3s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.4s) | ✅ (13.9s) |
| `/integrations` | ✅ (7.0s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (5.2s) | ⚠️ 2×4xx, ⚠️ 1 console → /unauthorized (5.3s) | ✅ (6.9s) |
| `/kpis` | ✅ (5.3s) | ✅ (8.3s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.4s) | ✅ (4.4s) |
| `/kpis/[id]` | ✅ (6.7s) | ✅ (10.3s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.7s) | ✅ (10.3s) |
| `/kpis/[id]/anomalies` | ✅ (6.5s) | ✅ (11.1s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (5.1s) | ✅ (10.8s) |
| `/kpis/[id]/edit` | ✅ (7.0s) | ✅ (7.2s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.7s) | ✅ (7.4s) |
| `/kpis/[id]/embed` | ✅ (9.4s) | ✅ (9.3s) | ⚠️ 1×4xx, ⚠️ 1 console, ⚠️ empty (10.0s) | ✅ (5.1s) |
| `/kpis/[id]/forecast` | ✅ (5.6s) | ✅ (9.8s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (18.8s) | ✅ (5.1s) |
| `/kpis/[id]/whatif` | ✅ (4.4s) | ✅ (10.5s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (5.2s) | ✅ (6.9s) |
| `/kpis/archive` | ✅ (4.5s) | ✅ (7.8s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.2s) | ✅ (4.8s) |
| `/kpis/categories` | ✅ (6.2s) | ✅ (4.4s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.0s) | ✅ (5.0s) |
| `/kpis/import` | ✅ (4.8s) | ✅ (3.9s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.1s) | ✅ (4.6s) |
| `/kpis/new` | ✅ (5.9s) | ✅ (3.8s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.0s) | ✅ (4.7s) |
| `/kpis/scorecard` | ✅ (7.7s) | ✅ (3.8s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.1s) | ✅ (4.7s) |
| `/kpis/templates` | ✅ (4.5s) | ✅ (3.8s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.1s) | ✅ (4.8s) |
| `/kpis/tree` | ✅ (4.5s) | ✅ (3.8s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.3s) | ✅ (6.0s) |
| `/login` | ✅ (3.2s) | ✅ (5.8s) | ✅ (3.1s) | ✅ (7.6s) |
| `/me/mentions` | ✅ (21.8s) | ✅ (5.4s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (7.1s) | ✅ (7.5s) |
| `/me/sessions` | ✅ (4.8s) | ✅ (3.9s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (5.1s) | ✅ (4.9s) |
| `/my-kpis` | ✅ (6.7s) | ✅ (6.2s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (3.3s) | ✅ (9.4s) |
| `/okrs` | ✅ (7.3s) | ✅ (4.2s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.3s) | ✅ (4.7s) |
| `/okrs/[id]` | ✅ (3.5s) | ✅ (5.3s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.6s) | ✅ (7.8s) |
| `/org-units` | ✅ (3.5s) | ✅ (6.7s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.3s) | ✅ (7.5s) |
| `/plugins` | ✅ (6.8s) | ⚠️ 1×4xx, ⚠️ 1 console (4.8s) | ✅ → /login (4.2s) | ✅ (7.6s) |
| `/positions` | ✅ (4.0s) | ✅ (4.1s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.4s) | ✅ (4.9s) |
| `/profile` | ✅ (4.3s) | ✅ (5.4s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.3s) | ✅ (10.6s) |
| `/recommendations` | ✅ (4.1s) | ✅ (5.1s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.2s) | ✅ (7.4s) |
| `/register` | ✅ (3.9s) | ✅ (5.8s) | ✅ (4.1s) | ✅ (4.5s) |
| `/reports` | ✅ (4.7s) | ✅ (5.3s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.2s) | ✅ (8.1s) |
| `/reports/[id]` | ✅ (7.3s) | ✅ (5.3s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.4s) | ✅ (6.8s) |
| `/reports/board-pack` | ❌ Application error, ❌ 1 page error(s) (13.3s) | ❌ Application error, ❌ 1 page error(s) (4.1s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (5.3s) | ❌ Application error, ❌ 1 page error(s) (4.8s) |
| `/reports/new` | ✅ (4.4s) | ✅ (4.1s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (5.2s) | ✅ (5.8s) |
| `/roles` | ✅ (4.1s) | ⚠️ 1×4xx, ⚠️ 1 console, ⚠️ empty (4.0s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.2s) | ✅ (4.8s) |
| `/settings` | ✅ (11.7s) | ✅ → /unauthorized (6.2s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.3s) | ✅ (7.7s) |
| `/settings/access` | ✅ (9.1s) | ✅ → /unauthorized (4.4s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (5.1s) | ✅ (5.1s) |
| `/settings/ai` | ✅ (6.1s) | ⚠️ 3×4xx, ⚠️ 1 console → /unauthorized (5.2s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.9s) | ✅ (4.6s) |
| `/settings/api-keys` | ✅ (4.8s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (5.2s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.6s) | ✅ (7.7s) |
| `/settings/audit` | ✅ (6.6s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (5.0s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.3s) | ✅ (4.7s) |
| `/settings/branding` | ✅ (4.8s) | ✅ → /unauthorized (5.1s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.2s) | ✅ (5.5s) |
| `/settings/custom-domain` | ✅ (6.5s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (6.8s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.2s) | ✅ (8.4s) |
| `/settings/fiscal` | ✅ (4.0s) | ⚠️ empty (5.0s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.6s) | ✅ (4.8s) |
| `/settings/notifications` | ✅ (6.8s) | ✅ (22.3s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (5.1s) | ✅ (8.0s) |
| `/settings/notifications/dlq` | ✅ (4.4s) | ⚠️ 1×4xx, ⚠️ 1 console (19.9s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.4s) | ✅ (4.8s) |
| `/settings/organization` | ✅ (4.1s) | ✅ → /unauthorized (6.0s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.7s) | ✅ (5.3s) |
| `/settings/password-policy` | ✅ (4.0s) | ✅ → /unauthorized (4.2s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.2s) | ✅ (5.6s) |
| `/settings/retention` | ✅ (6.2s) | ⚠️ 2×4xx, ⚠️ 1 console (5.6s) | ✅ → /login (4.1s) | ✅ (8.3s) |
| `/settings/scim` | ✅ (5.0s) | ⚠️ 1×4xx, ⚠️ 1 console (4.1s) | ✅ → /login (4.1s) | ✅ (4.7s) |
| `/settings/sso` | ✅ (5.6s) | ⚠️ 1×4xx, ⚠️ 1 console (5.5s) | ✅ → /login (4.1s) | ✅ (4.5s) |
| `/settings/webhooks` | ✅ (4.2s) | ⚠️ 2×4xx, ⚠️ 1 console → /unauthorized (5.5s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.2s) | ✅ (4.8s) |
| `/share/[token]` | ✅ → /share/<token> (4.2s) | ✅ → /share/<token> (10.0s) | ✅ → /share/<token> (4.8s) | ✅ → /share/<token> (4.6s) |
| `/signup` | ✅ (5.8s) | ✅ (9.0s) | ✅ (5.5s) | ✅ (8.2s) |
| `/signup/wizard` | ✅ → /signup (3.9s) | ✅ → /signup (6.7s) | ✅ → /signup (4.2s) | ✅ → /signup (4.7s) |
| `/status` | ✅ (3.9s) | ✅ (6.3s) | ✅ → /login (4.1s) | ✅ (4.5s) |
| `/tasks` | ✅ (4.1s) | ✅ (7.5s) | ⚠️ 3×4xx, ⚠️ 1 console → /login (4.4s) | ✅ (4.8s) |
| `/team` | ✅ (5.1s) | ✅ (6.8s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.3s) | ✅ (7.7s) |
| `/unauthorized` | ✅ (6.5s) | ✅ (3.1s) | ✅ (4.2s) | ✅ (9.1s) |
| `/users` | ✅ (4.3s) | ✅ (7.3s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (4.6s) | ✅ (4.9s) |
| `/users/[id]` | ✅ (10.5s) | ✅ (12.0s) | ⚠️ 1×4xx, ⚠️ 1 console → /unauthorized (5.1s) | ✅ (7.8s) |
| `/workflows` | ✅ (7.2s) | ⚠️ 1×4xx, ⚠️ 1 console (5.3s) | ⚠️ 1×4xx, ⚠️ 1 console → /login (4.9s) | ✅ (5.4s) |
