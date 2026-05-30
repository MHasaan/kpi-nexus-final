# Handoff

## State
Branch `phase/p7-collaboration` (off p6-complete). **P0–P7 done+tagged.** ✅ **P7 COMPLETE** (tagged `p7-complete`).

### P7 recap (complete) — Collaboration & Workflow
- Migration `20260530030000_p7_collaboration` (Task, Comment, Mention, Objective, KeyResult, ApprovalWorkflow, ApprovalRequest, Workflow + 5 enums).
- **TasksModule** (14) — CRUD + entity-bound visibility + mutate gate.
- **Comments+Mentions** (24) — `@mention` → Mention rows in same `$transaction`; `/me/mentions` inbox.
- **OkrsModule** (29) — pure `progress-math.ts`; recompute + parent rollup + depth-10 cycle guard; `syncFromLinkedKpis`.
- **ApprovalsModule** (39) — **ApprovalGateService** seam (standalone module → no cycle) throws **202 + requestId**; wired into KpisService.update / KpiTargetsService / RolesService via `@Optional()`; ApprovalApplyService replays with bypassApproval; decide/cancel guards.
- **WorkflowsModule** (21) — pure `evaluateRule` (6 ops) + ActionDispatcher; `kpi_changed` wired fire-and-forget into data-point write path.
- **Frontend** — `/tasks` kanban, `/okrs` + `/okrs/[id]`, CommentsDrawer (on `/kpis/[id]`), `/me/mentions`, `/approvals`, `/workflows`; `lib/collab-client.ts`.
- **Tests**: API unit **813/813** (+116); e2e `p7-collaboration.spec.ts` 5/5 (incl. approval 202→approve→apply, kpi_changed→auto task) + `tasks-okrs-ui.spec.ts` 2/2 browser.

Architecture note: ApprovalGateModule (Prisma-only) is imported by domain modules; ApprovalsModule imports the domain modules for the apply side → no circular dep. Gate skips status-only KPI patches; bypassApproval flag is internal-only.

Servers during dev: api :4000 (LIVE Gemini), ML :8000. Background api started from `apps/api/dist/main.js` for e2e (log `.api-p7.log`).

### Deferred (documented, non-blocking)
Workflow `schedule` (BullMQ repeatable) + `alert` triggers not yet wired (only kpi_changed + manual); rule engine is trigger-agnostic so it's wiring-only. `send_notification` emails EMAIL channels; other kinds log. Real-time comment SSE is P9.

## NEXT — P8 Integrations
Execute `docs/superpowers/plans/P8-integrations.md`: Slack/Teams/Jira + pull connectors + inbound email + webhooks + API keys + plugins. Create branch `phase/p8-integrations` off p7-complete.
