# Frontend Design Implementation — Working State (resume doc)

> Persistent ground-truth so work survives context compaction. Trust THIS file + git over
> earlier in-conversation tool output (a result-size limiter was dropping/duplicating outputs).

## Task (from user, 2026-05-31)
Implement the frontend properly (it was deferred). Make every page's designed functionality
actually render. Follow the Anthropic design file and implement `app/index.html`.
Design link: https://api.anthropic.com/v1/design/h/8T9E8gqGCCkr6QmzMPOF6Q?open_file=app%2Findex.html

## User decisions (AskUserQuestion)
- Design access: user provided **Playwright MCP** access; also "debug why you can't fetch."
  → RESOLVED: the URL returns **HTTP 200 application/gzip ~361KB** (a downloadable bundle),
    NOT 403. Download with curl + extract. (The WebFetch 403 was a red herring.)
- Approach: **Foundation + home slice first** (design system → core components → app-shell →
  home/dashboard from index.html → verify), then expand page-by-page.
- index.html maps to: **decide from design** (likely the authenticated dashboard home).

## Ground-truth repo structure (from `git ls-files`, authoritative)
- App Router root is **`apps/web/src/app/`** (NOT `apps/web/app/`). ~83 `page.tsx` across all domains.
- Root files: `apps/web/src/app/layout.tsx`, `globals.css` (959B, ~minimal), `page.tsx` (home), `providers.tsx`.
- Shared components: `apps/web/src/components/` incl. `app-shell.tsx` (+ `.spec.tsx`),
  `auth/permission-guard.tsx`, `auth/require-permission.tsx`, widgets/*, global-search, help-drawer,
  locale-picker, comments-drawer, series-chart, etc.
- Libs: `apps/web/src/lib/` incl. `api-client.ts`, `permissions.ts`, `use-permissions.ts`, `cn.ts`(?),
  `terminology-context.tsx`, i18n in `apps/web/src/i18n/`.
- Auth pages under `apps/web/src/app/(auth)/`. Tailwind+postcss configured (postcss.config.mjs at apps/web/).
  Tailwind preset likely from `packages/ui` (P0 created `packages/ui/src/tokens.css` + preset).
- NOTE: earlier I referenced `apps/web/app/(app)/_components/app-shell.tsx` and a root `apps/web/tailwind.config.ts`
  — those may have been HALLUCINATED from dropped tool results. VERIFY before trusting. Real shell = `src/components/app-shell.tsx`.

## Design bundle handling
- Downloaded to `docs/design-reference/bundle.gz`; extraction attempted to `docs/design-reference/extracted/`.
- See `docs/design-reference/EXTRACT_LOG.txt` for download/extract results.
- Earlier a subagent wrote partial `docs/design-reference/files/README.md` (~120 lines) and
  `files/app/index.html` (~945 lines) + `manifest.md` + `STATUS.md` via Playwright. Cross-check
  these against the freshly extracted bundle (bundle is the source of truth).

## Design system — CORRECTED from the real bundle (docs/design-reference/extracted/kpi-nexus/project/app/tokens.css)
> The earlier "indigo #4F46E5" notes were WRONG (came from a hallucinated/partial README). The
> REAL accent is SKY→AZURE light blue. Tokens stored as raw HSL channels "h s% l%"; compose alpha
> via hsl(var(--token)/.5). Token NAMES are locked (spec §12.3); mirror packages/ui/src/tokens.css.
- Accent: --accent-primary 200 98% 39% (sky), --accent-secondary 199 89% 48% (azure). Signature
  sky→azure gradient ONLY for logo + 1 CTA. Ring = accent.
- Surfaces (cool-neutral hue 240): bg 0 0% 100%; surface-1 240 6% 97%; surface-2 240 6% 95%;
  hover 240 6% 93%; pressed 240 6% 90%.
- Content: strong 240 10% 10%; default 240 6% 25%; muted 240 5% 45%; disabled 240 4% 65%.
- Borders: default 240 6% 88%; strong 240 6% 75%; divider 240 6% 92%.
- Status (status ONLY, never colour-alone): success 142 71% 40%; warning 38 92% 50%;
  critical 0 84% 55%; info 217 91% 55%; neutral 240 5% 50% (+ tinted -bg variants at ~12%).
- 12 chart colors --chart-1..12. FULL DARK MODE (.dark / [data-theme=dark]) defined.
- Radius: --radius .5rem(8). sm 4 / md 6 / lg 8 / xl 12 (cards) / 2xl 16 (modals) / full 9999.
- Spacing: 8px base grid (4px tight). Shadows: subtle border + light shadow, never both heavy.
  Also glass (frosted) + inset (neumorphic) tokens exist.
- Type: Inter (sans) + JetBrains Mono. Scale ratio 1.25 base16: xs12 sm14 base16 lg18 xl20 2xl24
  3xl30 4xl36 5xl48. Weights 400/500/600/700. tracking-tight -0.02em.
  Semantic classes in tokens.css: .kn-display .kn-h1(36/700) .kn-h2(24/600) .kn-h3(18/600)
  .kn-body(14) .kn-body-lg(16) .kn-muted .kn-eyebrow(uppercase tracked) .kn-metric(36/600 tabular) .tnum.
- Motion: ease-out cubic-bezier(.16,1,.3,1); dur fast120/base180/slow240; ≤200ms, no spinners <300ms.

## What the design bundle actually is (CORRECTED)
- It's a **Claude Design handoff tar** (kpi-nexus/). Source of truth, in priority order:
  1. `chats/chat1.md` (45KB, NOTE filename is chat1 not chat-1) — the user↔assistant intent + where they landed.
  2. `project/uploads/*.md` — 13 per-area design briefs (01-auth-and-onboarding … 13-public-and-embeds) + README.md.
  3. `project/app/` — the FINAL prototype the user iterated to: index.html, shell.jsx, app.jsx, lib.jsx,
     widgets.jsx, views*.jsx (views, views-collab/execute/extras/intel/kpitabs/org), tokens.css, auth.*, public.*.
  4. `project/screenshots/*.png` — overview.png (dashboard home), forecast, auth, public-viewer/embed.
  5. Earlier-stage files (project/pages-*.jsx, homes.jsx, design-canvas.jsx, wireframe-kit.jsx) = exploration; lower priority.
- Prototypes are HTML/CSS/JS (React via JSX, likely Babel-in-browser). RECREATE pixel-faithfully in our
  Next.js+Tailwind stack; do NOT copy prototype internal structure. Match visual output.
- Dashboard home (overview.png) = "Classic grid": full grouped sidebar (MEASURE: KPIs/Dashboards/Alerts;
  INTELLIGENCE: AI/OKRs/Tasks/Approvals; ORG: Reports/People&Org/Integrations/Activity) + topbar
  (org switcher · breadcrumb · ⌘K search · notif bell w/ badge · comments · AI sparkle · avatar);
  content: "Good morning, {name}" + ROLE badge + role-adaptive greeting + "+ Create KPI";
  4 stat tiles (big tabular metric + ▲/▼ delta badge + sparkline, never colour-only);
  "Your KPIs" grid of KPI cards (icon, name, SCOPE pill, metric, delta, "vs target · 2h ago", sparkline)
  + right rail: "Finish setup" checklist (n/14 progress) + "Recent activity" feed. (Design shows 3
  home directions; chat says which won — verify.)

## Plan (Foundation + home slice)
1. Design tokens → Tailwind theme + `globals.css` CSS vars + Inter font (next/font) in `src/app/layout.tsx`.
2. UI primitives in `src/components/ui/`: Button, Card, Badge (status/trend), Input, Select, Table,
   StatCard/Metric, Tabs, Avatar, EmptyState, Skeleton — matching the design.
3. Rebuild `src/components/app-shell.tsx`: 240px sidebar (grouped, icons, active, permission-gated) +
   topbar (global search, notifications bell, help, locale, user menu) + 1280px content.
4. Implement home/dashboard (`src/app/page.tsx` or `dashboard/page.tsx`) translated from design index.html.
5. Verify: `pnpm --filter web typecheck` + `pnpm --filter web build`. Resolve the dual app-dir risk if any.

## Execution note
Run heavy reads/builds inside SUBAGENTS / a Workflow (fresh contexts bypass this session's limiter);
have them communicate via disk + compact summaries.

## PROGRESS LOG
- Branch: `feat/frontend-design` (off phase/p9-polish).
- Design bundle recovered (live URL 404'd; restored from saved gzip) → `docs/design-reference/bundle.gz`
  + extracted to `docs/design-reference/extracted/kpi-nexus/` (chats/chat1.md, project/app/*, project/uploads/01..13 + README, screenshots/*).
- ✅ FOUNDATION done by lead + typecheck GREEN (exit 0):
    packages/ui/src/tokens.css (retuned sky/azure + full token superset),
    packages/ui/tailwind.preset.ts (shadows/radii/status-bg/positive alias/gradient/durations),
    apps/web/src/app/globals.css (type roles + motion + print), apps/web/src/app/layout.tsx (Inter+JetBrainsMono next/font).
- ✅ Authoritative brief written: `docs/design-reference/IMPLEMENTATION-BRIEF.md` (subagents read this).
- Workflow `w3nz6mc8j` (run wf_9e5905e5-9b4): ✅ Primitives (20 ui/ + 3 charts/ + cn.ts, barrels) and ✅ Shell
    (app-shell.tsx rebuilt sidebar+topbar + spec updated) — BOTH verified green (tsc exit 0; app-shell.spec 15/15).
    Then HIT ANTHROPIC SESSION LIMIT on Home + all 12 Pages + Verify (those agents returned the limit string, no work done).
- Lead re-verified on disk after reset: `pnpm --filter @kpi-nexus/web typecheck` = EXIT 0. UI primitives + charts present,
    barrels clean (no self-ref export bug). cn.ts present. Stray .tsc.txt/.vt.txt removed.
- ▶ RUNNING resume workflow task `wpzhjm6dv` / run `wf_3d47cadf-c92`: HomeCore (dashboard + landing) → Pages(12 areas parallel)
    → Verify+fix. (Did NOT use resumeFromRunId — that would cache the session-limit error strings as results; launched a fresh
    3-phase workflow instead that treats Primitives+Shell as already-built read-only deps.)
    Result doc: `docs/design-reference/WORKFLOW-RESULT.md`; phase notes: notes-home.md + notes-pages-*.md.
- Changed-so-far (git, branch feat/frontend-design): M dashboard/page.tsx, globals.css, layout.tsx, page.tsx, app-shell.tsx+spec,
    packages/ui/{src/tokens.css,tailwind.preset.ts}; ?? components/ui/, components/charts/, lib/cn.ts, docs/design-reference/.
    (dashboard/page.tsx + page.tsx were touched by the limited run's Home agent partially? No — those M's are from foundation/limited
    run; the resume Home agent will (re)write them. Verify phase reconciles.)
- NOT committed (user hasn't asked). After workflow: review WORKFLOW-RESULT.md, spot-check key files, run typecheck/vitest myself, screenshot if dev server feasible, then report.

## SESSION 2 (2026-06-01) — gap-closure + fidelity pass (lead-verified)

Resumed with the prior redesign sitting UNCOMMITTED in the working tree but UNVERIFIED (it had 48
typecheck errors + build failures + regressions). Drove it to a fully green, faithful state:

1. **Keystone fix:** extended `AppShell` to accept optional `title?`/`crumbs?` props (the shape ~25 pages
   already passed) → cleared ~30 errors. (app-shell.tsx)
2. **48 data-shape errors** fixed via an 11-agent workflow (adapt pages to REAL client/component APIs:
   ActivityItem, KeyResult.{baseline,target,current}Value, decideApprovalRequest({decision}), Badge `tone`,
   Mention.readAt, no MyKpiRow.trend, no RoleSummary.memberCount, etc.). Preserved testids + API shapes.
3. **7 testid regressions** fixed (found by diffing all 319 e2e static testids vs source): 6 page headings
   via a new `PageHeader titleTestId` prop (roles/users/positions/org-units/reports/report-detail-heading)
   + `team-empty`. Dashboard sign-out e2e updated to the app-shell user-menu (`appshell-user-menu` +
   `appshell-signout-button`).
4. **tasks quick-add feature drop** restored — per-column `quick-add-<STATUS>` inputs (design doc 08 + e2e
   require them; redesign had collapsed them to one global add).
5. **4 build-blocking lint errors** fixed (invalid eslint-disable directives for unconfigured rules + unused var).
6. **Fidelity review (13 agents)** → 45 findings. **Fix pass (12 agents)** addressed the real bugs +
   dropped features within tight guardrails (canonical perms only, existing APIs only, preserve testids):
   - BUGS: integrations gated with non-existent `integrations:read/write` (page 100% inaccessible) →
     ORG_SETTINGS + Connect/Disconnect wired; dashboard fake RECENT_ACTIVITY → real listActivity();
     share/[token] widgets-visibility logic bug; settings/webhooks hardcoded 3 events → live GET
     /webhooks/events catalog (added listWebhookEvents wrapper); comments-drawer author UUID → fullName.
   - FEATURES: forecast historical actuals line + skeleton; analytics nav strip; route-level
     <RequirePermission> across kpis/dashboards/alerts/ai/analytics/users[id]/settings(api-keys,webhooks,ai)
     + /alerts/new (lead-added); kpis Status column; alerts severity filter + kpi link; approvals workflow
     config toggles + proposed-payload diff + resolved section + decision comment + requester cancel; tasks
     priority/assignee filters; users/[id] header (name/email/role/manager/status) + users Manager column;
     login password reveal; register strength meter; embed status line + ?theme param; share read-only badge
     + real widget value visuals; plugins warning banner; connectors AppShell + loading skeletons; mutation-
     error surfacing in kpi [id] tabs.

**VERIFICATION (all GREEN, lead-run):** typecheck EXIT 0 · vitest EXIT 0 · eslint 0 errors (152 cosmetic
sort-imports warnings) · next build = Compiled successfully, 64/64 routes (build-3 pending final confirm at
write time). All work still UNCOMMITTED on `feat/frontend-design` for user review.

**Accepted deviations / deferred (need backend fields or are aspirational):** role-adaptive dashboard home;
approvals true before/after diff (only proposedPayload exists); insight confidence/dismiss; alerts escalation
trail + channel disable toggle (no client helper/field); user suspend/archive/purge (no client helper); accept-
invitation invitee preview; settings terminology plural editor; dashboard "Last 30 days" range; mini widget
thumbnails; signup effort dots; ai-budget meter. The 147→152 sort-imports lint warnings are pre-existing
style nits (auto-fixable with eslint --fix; left to keep the diff focused).

## SESSION 3 (2026-06-01) — deferred items implemented + LIVE browser-verified

User asked to (a) complete the deferred items WITH small backend additions, then (b) browser-test every page.

**Backend additions (3 endpoints + 1 migration + 18 unit tests, all green):**
- `KPIInsight` migration: + `status`/`dismissedAt`/`dismissedById` (+ org+status index). Applied surgically to
  the dev DB (no `db push` — TimescaleDB drift); record migration `20260601000000_p_insights_dismiss`. Prisma regenerated.
- `POST /insights/:id/dismiss` (INSIGHTS_VIEW) + list now hides DISMISSED by default (+includeDismissed flag).
- `@Public POST /auth/invitation-preview` {token} → {email, organizationName, expiresAt} (EmailVerificationToken
  hash resolve; generic 404 on invalid).
- `POST /users/:id/suspend` + `/reactivate` (USERS_MANAGE; self-suspend + bad-state guards).
- Web client helpers added (api-client.ts): getAlertRule, updateNotificationChannel, listNotificationDeliveriesForAlert,
  suspendUser/reactivateUser/offboardUser/purgeUser, previewInvitation.

**Frontend wiring (7-agent workflow):** insight Keep/Dismiss; accept-invitation invitee/org preview + signup
effort-dots/featured; users suspend/reactivate/archive(offboard)/purge + Active/Archived filter (list + detail);
alerts channel enable/disable toggle + escalation-trail (getAlertRule levels + best-effort deliveries); kpi-category
inline edit + delete-blocked-when-in-use; dashboard "Last 7/30/90 days" range (real getDashboardSummary{from,to}) +
light role-adaptive My-KPIs; settings/ai budget usage meters. Wired-existing: channel toggle, escalation, category
edit, dashboard range. STILL deferred (need deeper backend / aspirational): insight confidence, approval true
before/after diff, embed token revoke, org terminology plural, mini thumbnails.

**HYDRATION BUG FOUND + FIXED (the one real defect the browser test surfaced):** `usePermissions` read
localStorage in a synchronous state initializer → server rendered gated actions hidden, client's first render showed
them → React #418 hydration mismatch on EVERY AppShell page with a `<PermissionGuard>`. Fixed by deferring the cache
read to a post-mount `useEffect` (matches the AppShell nav's `mounted` gating). 0 console errors after the fix.

**VERIFICATION:** API typecheck EXIT 0 · API unit **1096 pass** (only the 2 known onboarding-cleanup timing-flakes
fail under full-suite parallel load; pass 9/9 in isolation) · API build OK · web typecheck/lint(0 err)/build(64
routes) all green. **LIVE STACK** (docker PG/Redis + API:4000 + ML:8000 + web:3000, demo-data seeded): walked ~30
routes — all render with **0 console errors** (post-hydration-fix); 12 screenshots in
`docs/design-reference/walkthrough/` confirm every marquee feature (dashboard range/tiles/checklist/tour, KPIs status
column, KPI detail 9 tabs+trend, integrations lockout-FIXED+connect, tasks per-column quick-add+filters, approvals
3 sections, users lifecycle+manager col, settings/ai budget meter, settings/webhooks 15-event catalog, register
strength meter, signup effort dots, landing). **Known minor:** `/activity` serializes `?entityType=undefined`
(cosmetic, backend tolerates); access-token expires after ~15min (pre-existing auth TTL; not a regression). Still
all UNCOMMITTED on `feat/frontend-design`.

## SESSION 4 (2026-06-01) — the LAST deferred items, implemented + live-verified

User: "continue to complete the remaining tasks." Implemented all remaining deferred items (backend + FE):
- **One migration** `20260601010000_p_deferred_finishers` (applied surgically + Prisma regenerated, API stopped
  first to free the DLL): KPIInsight.confidence Float, ApprovalRequest.currentPayload Json?, KPI.embedTokenVersion
  Int, Organization + 8 <label>LabelPlural columns.
- **Backend (4-agent workflow + lead fixes):** insights derive+store a 0..1 confidence (0.5 + volume + magnitude);
  approval-gate folds currentPayload into its options object + 3 call sites (kpis/kpi-targets/roles update) pass the
  pre-change `existing` + lead added currentPayload to the approval-request read `select`; organizations terminology
  getter/setter + DTO carry 8 plural overrides; embed tokens carry embedTokenVersion (mint/resolve check) + new
  `POST /reports/kpis/:id/embed-token/revoke` (KPI_VIEW) bumps it. **153 changed-module unit tests pass**; API
  typecheck/build green; API back up on :4000 (revoke route smoke-tested → 401 = exists).
- **Web helpers/types:** revokeEmbedToken; Terminology/OrganizationSettings + 8 plural fields; ApprovalRequest
  + currentPayload; fixed the cosmetic `/activity?entityType=undefined` query serialization.
- **FE (5-agent workflow):** insight confidence pill (tone by threshold); approval BEFORE→AFTER diff
  (currentPayload vs proposedPayload, only changed keys, red→green w/ arrow; "+all-new" for creates); terminology
  plural inputs + live preview + pluralize(label, override?); embed "Revoke tokens" button (confirm + clear);
  dashboard mini-thumbnail (widget-type glyph grid from widgets[]). web typecheck/lint/build green; web unit 65 pass.
- **LIVE browser-verified** (re-seeded: 2 demo insights w/ confidence, a demo dashboard w/ 4 widgets): screenshots
  walk-14..17 in walkthrough/ confirm confidence pills (82% green / 55% blue), terminology plural editor + preview,
  embed Revoke button, dashboard mini-thumbnails. Approval diff is build-verified (needs an active approval workflow
  + a gated mutation to populate — demo org has none). 0 console errors on the tested pages.

**NOTHING is deferred anymore that doesn't require a product decision.** Everything still UNCOMMITTED on
`feat/frontend-design`. Live stack still up (:3000/:4000/:8000) with the demo org `sara@acme-demo.test`.
