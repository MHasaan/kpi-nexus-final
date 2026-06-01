# Notes — AI pages restyle (area: ai)

Restyled the 4 real AI pages to the design system using `components/ui` primitives + `AppShell`.
tsc: the only remaining errors are in `src/app/alerts/page.tsx` (unrelated in-flight area); my 4 files are clean.

## Actual file locations (NOTE: no `(app)` route group; pages roll their own header pre-restyle)

1. `apps/web/src/app/insights/page.tsx`
2. `apps/web/src/app/recommendations/page.tsx`
3. `apps/web/src/app/ask/page.tsx`
4. `apps/web/src/app/settings/ai/page.tsx`

## What changed per page

All four: replaced the bespoke `<main>` + `<header>KPI Nexus</header>` chrome with `<AppShell>` + `<PageHeader eyebrow/title/subtitle/actions>`. Kept `'use client'`, the `getAccessToken()`→`/login` redirect, every `api(...)` call + payload, and every interface/state. Token classes only; numbers `tabular-nums`; status via Badge tone + text label (never colour-only).

- **insights**: Generate action → `Button isLoading` with Sparkles icon (testid `insights-generate`). Rows → `Card`+`CardContent` (testid `insight-row-${id}`); model→`Badge tone=info`, tokens `tabular-nums`. Added Skeleton loading (`insights-loading`). Empty → `EmptyState` in a Card (testid wrapper `insights-empty`) with a Generate CTA. Error → `role=alert` banner `text-status-critical` (`insights-error`). `insights-list` preserved.
- **recommendations**: Cards with `Card/CardContent/CardFooter`. Status → `Badge` tone map PENDING=warning/ACTIONED=success/DISMISSED=neutral (testid `rec-status-${id}`). Priority → `Badge` P1=error/P2=warning/P3=info. Actioned/Dismiss → `Button` (testids `rec-action-${id}`,`rec-dismiss-${id}`). Confidence `tabular-nums`. Added `recs-loading`. Empty `EmptyState` (`recs-empty`), error banner `recs-error`. `recs-list`, `rec-row-${id}` preserved.
- **ask** (NLQ chat): centered `max-w-3xl`, chat thread kept (`ask-messages`, `ask-question`/`ask-answer`). Source chips → `Badge tone=info` wrapped in KPI `Link` (`ask-sources`). Model/cost line: provider · `font-mono` model · `tabular-nums` $cost. Added a "Thinking…" typing indicator (`ask-typing`) while busy. Empty → `EmptyState` Card (`ask-empty`). Input kept as native `<input>` (testid `ask-input`) restyled with tokens; submit → `Button isLoading` (`ask-submit`). Error banner `role=alert` (`ask-error`).
- **settings/ai**: Budget tiles use `Metric` in Cards; circuit breaker + override/source + BYO state → `Badge` (tone, with label). Feature routing → `Table/TableHeader/TableBody/TableRow/TableHead/TableCell` (testid `ai-config-${feature}`). Daily cap → `Input`+`Label`+`Button` (`ai-daily-cap-input`,`ai-save-cap`). BYO rows → `Input`/`Button`/`Badge` (testids `ai-byo-${key}`,`-configured`,`-clear`,`-input`,`-save`). Sections `ai-budget-section`/`ai-configs-section`/`ai-byo-section` + `ai-settings-error` preserved.

## Testids preserved (all originals kept; equivalents carry the same id)
insights-generate, insights-error, insights-list, insight-row-${id}, insights-empty •
recs-error, recs-list, rec-row-${id}, rec-status-${id}, rec-action-${id}, rec-dismiss-${id}, recs-empty •
ask-messages, ask-question, ask-answer, ask-sources, ask-error, ask-input, ask-submit, ask-empty •
ai-settings-error, ai-budget-section, ai-daily-cap-input, ai-save-cap, ai-configs-section, ai-config-${feature},
ai-byo-section, ai-byo-${key}(+ -configured/-clear/-input/-save).
Added (new, non-conflicting): insights-loading, recs-loading, ask-typing.

## Decisions / TODO
- **Permission gating**: these pages had NO `RequirePermission`/`PermissionGuard` originally and there is no AI-specific permission key in `packages/contracts/src/permissions.ts`. I preserved the existing `getAccessToken()` auth gate rather than invent a key. TODO: if/when an `ai.*` permission key lands, wrap the page in `RequirePermission` and gate the Generate/Save/Ask actions with `PermissionGuard` (the actions are isolated for easy wrapping).
- There is also a separate `src/app/ai-client.ts`? No — these pages use the generic `api()` from `lib/api-client.ts`; left untouched.
- AppShell takes only `children` (it derives title/crumbs from the path); PageHeader supplies the visible heading. `insights`/`recommendations`/`ask` already map to the "Intelligence" nav group in app-shell TITLES.
- The design-reference jsx/screenshots referenced in the brief exist on disk (pages-ai.jsx, views-intel.jsx, etc.); restyle followed the documented primitive/token contract + 07-ai.md trust-signal guidance.
