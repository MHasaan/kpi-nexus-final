# AI Pages + NLQ Data-Access Overhaul — Implementation Plan

> Execute with superpowers:subagent-driven-development. Mix of backend (grounding) + frontend (pages).

**User problem:** "when I ask a question, the AI does not have access to data" + "improve all AI pages,
give AI more access."

**Diagnosis (verified):**
- NLQ (`apps/api/src/nlq/nlq.service.ts`) caps context at **8 KPIs** (`MAX_CONTEXT_KPIS=8`) of ~35, with
  only 6 raw values each, **no targets/thresholds/status/trend/category**. When the pgvector catalog isn't
  embedded (the seed doesn't build it), `cosineSearch` returns empty → fallback = "first 8 visible KPIs"
  (alphabetical). So most questions hit KPIs the model never received, and the system prompt then makes it
  answer *"I don't have access to that information."* THIS is the root cause.
- Env: no `AI_MOCK` (live AI on), Gemini keys present (works), no Anthropic/OpenAI (no fallback).
- Insights + Recommendations ARE grounded (real data points) but thin (no targets/thresholds/direction).
- AI router SUPPORTS tool-calling (`completeWithTools`, `tools`, `toolCalls`) — deferred; rich grounding is
  the lower-risk, high-impact fix that fully solves "no data access".
- FE: `/ask` POOR (no markdown/copy/follow-ups); `/insights` + `/recommendations` GOOD-ish (minor gaps);
  `/settings/ai` POOR (routing read-only, circuit-breaker unexplained).

Helios seed: `admin@helios.io`/`Password123!`; ~35 KPIs across 3 scopes with 12 months of data.

---

## Task A — NLQ rich grounding (THE FIX, backend)
**Files:** `apps/api/src/nlq/nlq.service.ts` (+ spec); `apps/web/src/lib/api-client.ts` (add `askNlq`).
- Rewrite the context to feed the model the **entire visible KPI catalog** (cap at e.g. 60; Helios has 35),
  each KPI as a rich line: `name (unit) [category] scope/direction — latest: <value> @<date>; target <t>
  (status: on/under/over target); warn <w>/crit <c>; recent: [v1..v8] (Δ <change%>)`. Pull metadata from
  `kpis.list()` (PublicKpi has targetValue/warning/criticalThreshold/direction/categoryId/scope) + the
  latest value via `KpiDataService.dashboardSummary()` (one call, per-KPI latest+aggregate) + a short recent
  series per KPI (batch where practical; respect `dataLimits` clamp via `clampHistoryFrom`). Resolve category
  names (fetch categories once). Compute on/under/over-target from value vs target + direction.
- Keep RAG (`cosineSearch`) ONLY to ORDER which KPIs get the deepest recent series when the catalog exceeds
  the cap — but include ALL visible KPIs at least at summary level. If embeddings are empty, best-effort
  trigger `embeddings.reembedAllForOrg()` once (non-blocking / catch) so future queries improve; do NOT block
  the answer on it.
- Rewrite `SYSTEM_PROMPT`: "You are the org's KPI analyst. You have the full current state of every KPI the
  user can see (values, targets, thresholds, trends) in the context. Answer using it — compute trends, compare
  to targets, rank KPIs. Cite specific numbers. Only say you lack data if the relevant KPI truly isn't in the
  list." Raise `maxTokens` to ~900.
- `sources`: return the KPIs actually referenced (the RAG-top set, or all when small).
- Tests (mirror the nlq spec harness): context includes ALL visible KPIs (not capped at 8) with target/latest/
  trend; off-target status computed correctly; visibility still scopes the candidate set (only `kpis.list()`
  KPIs); empty-catalog still produces a useful catalog (no "(no KPIs available)" when KPIs exist).
- api-client: `askNlq(question): Promise<{ answer, sources: {kpiId,name}[], costUsd, provider, model }>`.
- Commit `feat(nlq): ground answers in the full visible KPI catalog (values/targets/status/trend)`.

## Task B — /ask page polish (FE)
**Files:** `apps/web/src/app/ask/page.tsx`.
- Use the new `askNlq` client. Render answers as **markdown** (use the markdown renderer already in the repo
  if one exists — check the comments/insights area; else a lightweight one) so lists/bold/numbers read well.
- **Copy answer** button per assistant message; **suggested follow-ups** (a few static smart prompts after an
  answer, e.g. "Which KPIs are off target?", "Summarize this month"); a **Clear conversation** action; keep
  the multi-turn flow + cited-KPI source chips (link to `/kpis/<id>`) + provider/cost footer. Better empty
  state with example questions grounded in real KPIs (generic is fine). Loading "Thinking…" + error states.
- Keep it a polished chat. data-testids preserved/added (`ask-input`, `ask-send`, `ask-answer`, `ask-copy`,
  `ask-clear`, `ask-suggestion-*`, `ask-source-*`).
- Commit `feat(web): Ask page — markdown answers, copy, follow-ups, clear, source links`.

## Task C — insights + recommendations grounding + pages
**Files:** `apps/api/src/insights/insights.service.ts`, `apps/api/src/recommendations/recommendations.service.ts`
(+ specs); `apps/web/src/app/insights/page.tsx`, `apps/web/src/app/recommendations/page.tsx`;
`apps/web/src/lib/api-client.ts` (wrappers).
- **Backend grounding**: enrich each prompt with the KPI's `target`, `warning/criticalThreshold`, `direction`,
  `unit`, and on/off-target status (so narratives/recs reason about targets, not just raw values). Bump the
  insights window context a bit if cheap. Keep visibility + structured parsing. Update specs.
- **FE insights**: add per-insight **Regenerate** (calls generate for that kpiId) + a sort/filter (by
  confidence / recency). Keep dismiss + states.
- **FE recommendations**: link to the originating alert when `alertId` present; sort by priority/confidence;
  keep status actions.
- api-client wrappers: `listInsights`, `generateInsightsBatch`, `generateInsight(kpiId)`, `dismissInsight`,
  `listRecommendations`, `setRecommendationStatus`.
- Commit `feat(ai): richer insight/recommendation grounding + page polish`.

## Task D — /settings/ai improvements
**Files:** `apps/web/src/app/settings/ai/page.tsx` (+ small backend if an update endpoint is missing —
check `ai-configs.controller.ts` for a PATCH/PUT to set a feature's provider/model).
- Make the **feature-routing table editable** (per feature, choose provider + model) IF the backend exposes an
  update endpoint (`PATCH /ai/configs/:feature` or similar). If no such endpoint exists, leave routing read-only
  but add a clear "defaults" explanation — do NOT add a big new backend surface this round; a tiny update
  endpoint is acceptable if trivial.
- Explain the **circuit-breaker** modes (FAIL_CLOSED vs FALLBACK) in plain language; add BYO-key save success
  feedback; show a daily-reset note. Keep the budget meter.
- Commit `feat(web): AI settings — editable routing (if supported), circuit-breaker help, BYO feedback`.

## Task E — verify + live (ASK THE AI)
- typecheck/lint/build clean; web tests green; full API suite green.
- Run the stack (Helios, `admin@helios.io`). **LIVE-ask real questions** via `/ask` and confirm the AI now
  answers WITH actual numbers from the data: e.g. "What's our MRR and how has it trended?", "Which KPIs are off
  target?", "How is churn doing vs target?", "Summarize company performance." Confirm it cites real values (not
  "I don't have access"). Generate insights (batch) + a recommendation and confirm they're grounded. Check
  /settings/ai. Capture console errors. (If Gemini keys are rate-limited, note it — the grounding fix is still
  correct; try a couple times.)
- Update memory; final commit.

## Out of scope (note)
- Full agentic tool-use NLQ loop (router supports it; deferred — rich grounding solves the ask). Conversation
  persistence to server. Per-feature spend history graphs. ML-model upgrades.
