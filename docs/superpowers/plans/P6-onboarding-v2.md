# P6 — Onboarding 2.0 + AI Co-pilot Implementation Plan

| | |
|---|---|
| **Phase** | P6 — Onboarding 2.0 with AI Co-pilot |
| **Goal** | Replace the P1 wizard stub with the full sidebar-primary 3-pane experience: AI co-pilot, drafts, templates, can express full original-app seed.ts depth in a single session |
| **Effort** | ≈3 weeks solo |
| **Depends on** | P0–P5 (especially P5 AI layer for co-pilot, P2 KPI engine for what gets created) |
| **Blocks** | Nothing strictly, but a polished onboarding is critical for FYP demo |
| **Spec reference** | §3.9 (onboarding schema), §4.9 (onboarding modules), §7.12 (onboarding AI), §11 (P6 phase summary) |

## Why this phase matters

The original app's onboarding wizard is one of its strongest features (9 steps, AI co-pilot, AI generator). Reproducing it at quality + adding the "express full seed.ts depth" capability is what makes the rebuild's demo land. The setup checklist + draft persistence are what bridge "I just signed up" to "I'm using this productively daily."

## Exit criteria

- [ ] A new admin can reproduce the full original-app seed.ts demo org (10 roles, 14 positions, 11 units, 20 KPIs, 5 categories) in a **single onboarding session** (any combo of: AI generator + templates + manual edits)
- [ ] AI generator returns reasonable org JSON in <30s for prompt "B2B SaaS startup, 50 employees"
- [ ] Draft survives browser crash: write to draft → kill browser → reload → state restored from localStorage
- [ ] 14-task setup checklist appears on home page after onboarding, persists state across sessions
- [ ] Onboarding tour (5 slides) appears for first-login users
- [ ] Rate-limit test: 6th generator call within 1h returns 429
- [ ] Tag `git tag p6-complete`

## Schema additions

### Migration: `016_onboarding_v2`

```prisma
enum OnboardingStatus { in_progress completed archived }
enum OnboardingAiMode { generator assistant suggest explain }

model OnboardingSession {
  id                String              @id @default(cuid())
  organizationId    String?  // nullable until completed (pre-create state)
  organizationName  String
  userId            String?
  userEmail         String
  draftTokenHash    String?  // for unauth resumability
  payload           Json                // entire draft state
  status            OnboardingStatus    @default(in_progress)
  entryMode         String              @default("full")  // "quick" | "full" | "template:<slug>"
  lastEditedStep    String?
  startedAt         DateTime            @default(now())
  completedAt       DateTime?
  updatedAt         DateTime            @updatedAt
  @@index([userEmail, status])
}

model OnboardingAIInteraction {
  id                  String             @id @default(cuid())
  sessionId           String
  mode                OnboardingAiMode
  prompt              String             @db.Text
  response            String             @db.Text
  appliedSections     String[]
  editedSections      String[]
  rejectedSections    String[]
  promptTokens        Int                @default(0)
  completionTokens    Int                @default(0)
  latencyMs           Int
  providerKey         String?
  modelId             String?
  costUsd             Float?
  createdAt           DateTime           @default(now())
  @@index([sessionId, createdAt])
}

model OrgTemplate {
  id              String   @id @default(cuid())
  organizationId  String?  // null = builtin
  slug            String   @unique
  name            String
  description     String?
  tier            String   @default("starter")  // "rich" | "starter" | "legacy"
  orgType         String?
  industry        String?
  payload         Json     // roles + positions + units + categories + KPIs
  isBuiltin       Boolean  @default(false)
  isPublic        Boolean  @default(false)
  popularity      Int      @default(0)
  createdAt       DateTime @default(now())
  @@index([tier])
  @@index([industry])
}

model OnboardingTask {
  id              String   @id @default(cuid())
  organizationId  String
  key             String
  status          String   @default("pending")  // "pending" | "complete" | "dismissed"
  dueAt           DateTime?
  completedAt     DateTime?
  completedById   String?
  dismissedAt     DateTime?
  createdAt       DateTime @default(now())
  @@unique([organizationId, key])
}
```

## Backend modules

### Module 1: OnboardingModule (extended from P1 stub)

**Files**: `onboarding.module.ts`, `onboarding.controller.ts`, `onboarding.service.ts`, `onboarding-draft.service.ts`, `*.spec.ts`

- [ ] `OnboardingService.start({email, entryMode?: "quick" | "full" | "template:<slug>"})` — creates OnboardingSession with empty payload + draftTokenHash (HMAC of session id + secret); returns `{sessionId, draftToken}`
- [ ] `OnboardingDraftService.patch(sessionId, draftToken, patch)` — validates draft token; merges patch into `payload`; updates `lastEditedStep`; returns updated payload
- [ ] `OnboardingDraftService.get(sessionId, draftToken)` — returns full payload for resume
- [ ] `OnboardingDraftService.cleanupStale(olderThanDays?)` — deletes archived/abandoned drafts (scheduled via BullMQ)
- [ ] `OnboardingService.complete(sessionId, draftToken)` — atomic transaction:
  - Create Organization
  - Create RoleDefinitions with permissions
  - Create Positions
  - Create OrgUnitTypes + OrgUnits + OrgUnitMembers
  - Create KPICategories + KPIs (status=DRAFT for review)
  - Create UserKPIAssignments + OrgUnitKPIAssignments
  - Create admin User + assign Admin role
  - Mark session `status=completed + completedAt`
  - Issue JWT pair
  - Seed 14 OnboardingTask rows
  - Send invitation emails for team members
- [ ] Validate payload before commit using exhaustive Zod schema
- [ ] Endpoints:
  - `POST /onboarding/start` (public)
  - `GET /onboarding/:id` (draft token via header)
  - `PUT /onboarding/:id` (draft token via header)
  - `POST /onboarding/:id/complete` (draft token)
  - `POST /onboarding/:id/apply-template {slug}` — applies template payload into draft
- [ ] Unit tests: complete-transaction atomicity (rollback on failure), draft token validation, lifecycle states

### Module 2: OnboardingAiModule

**Files**: `onboarding-ai.module.ts`, `onboarding-ai.controller.ts`, `onboarding-ai.service.ts`, `interaction-log.service.ts`, `rate-limit-ai.ts`, `*.spec.ts`

- [ ] `OnboardingAiService.generate({sessionId, prompt})` — full org generator:
  - Calls `AiRouter.complete('ONBOARDING_GENERATOR', ...)` with system prompt instructing JSON output: `{organization: {...}, roles: [...], positions: [...], orgUnitTypes: [...], orgUnits: [...], kpiCategories: [...], kpis: [...]}`
  - Strict JSON validation
  - Logs OnboardingAIInteraction
  - Returns diff preview (new vs current draft state) — UI shows AIDiffPreview, applies on user confirm
- [ ] `OnboardingAiService.assistant({sessionId, instruction})` — targeted patch:
  - Calls `AiRouter.complete('ONBOARDING_ASSISTANT', ...)` with current draft + instruction
  - Output: RFC 6902 JSON patch (`[{op: "add", path: "/roles/-", value: {...}}, ...]`)
  - Returns patch as diff for review
- [ ] `OnboardingAiService.suggest({sessionId, fieldPath, context?})` — field-level chips:
  - Calls `AiRouter.complete('ONBOARDING_SUGGEST', ...)` with field schema + surrounding context
  - Returns list of suggestions (e.g., for "scorecard quadrant" → `["FINANCIAL", "CUSTOMER", "INTERNAL_PROCESS", "LEARNING_GROWTH"]` with rationale)
- [ ] `OnboardingAiService.explain({sessionId, fieldPath})` — tooltip help:
  - Calls `AiRouter.complete('ONBOARDING_EXPLAIN', ...)` for prose explanation of what the field means + best practices
- [ ] `OnboardingAiService.apply({sessionId, interactionId, appliedSections[], editedSections[], rejectedSections[]})` — records user's selective adoption of AI output; updates draft payload
- [ ] Per-mode rate limits via `rate-limit-ai.ts`:
  - generator: 5/hr/session
  - assistant: 30/hr/session
  - suggest: 60/hr/session
  - explain: 100/hr/session
  - 429 on exceed with `retryAfter`
- [ ] Endpoints:
  - `POST /onboarding/ai/generate {sessionId, prompt}`
  - `POST /onboarding/ai/assistant {sessionId, instruction}`
  - `POST /onboarding/ai/suggest {sessionId, fieldPath, context?}`
  - `POST /onboarding/ai/explain {sessionId, fieldPath}`
  - `POST /onboarding/ai/apply {sessionId, interactionId, appliedSections, editedSections, rejectedSections}`

### Module 3: OrgTemplatesModule

**Files**: `org-templates.module.ts`, `org-templates.controller.ts`, `org-templates.service.ts`, `seed-templates/`

- [ ] `OrgTemplatesService.list({tier?, industry?, orgType?})` — returns templates with payload preview
- [ ] `OrgTemplatesService.preview(slug)` — returns full payload
- [ ] `OrgTemplatesService.seedBuiltins()` — lazy seeds on first list:
  - **Rich SaaS-Startup template** — sourced verbatim from original-app `backend/prisma/seed.ts`; contains 10 roles, 14 positions, 11 units, 20 KPIs, 5 categories
  - **Starter templates** (~6, one per major industry): Tech / Healthcare / Finance / Retail / Non-profit / E-commerce — each ~3 roles, ~5 KPIs
  - **Legacy presets** (~3) — quick "1-role-1-KPI" minimal starts
- [ ] Endpoints:
  - `GET /org-templates` (public — used during onboarding before auth)
  - `GET /org-templates/:slug`
  - `POST /org-templates/preview {slug, organizationProfile?}` — returns customized payload
  - `POST /org-templates` (org-private, post-onboarding, ORG_SETTINGS)

### Module 4: SetupChecklistModule

- [ ] `SetupChecklistService.DEFAULT_TASKS` — 14 keyed defs with category badges:
  ```typescript
  export const DEFAULT_TASKS = [
    {key: 'domain_verification', category: 'Setup', label: 'Verify custom domain'},
    {key: 'sso', category: 'Security', label: 'Set up SSO (SAML/OIDC)'},
    {key: 'mfa', category: 'Security', label: 'Enable MFA for admins'},
    {key: 'data_source', category: 'Data', label: 'Connect a data source'},
    {key: 'channels', category: 'Alerts', label: 'Configure notification channels'},
    {key: 'historical_import', category: 'Data', label: 'Import historical KPI data'},
    {key: 'default_dashboard', category: 'Dashboards', label: 'Customize default dashboard'},
    {key: 'scheduled_report', category: 'Reports', label: 'Set up a scheduled report'},
    {key: 'ai_tuning', category: 'AI', label: 'Tune AI provider settings'},
    {key: 'remaining_invites', category: 'Team', label: 'Invite remaining team members'},
    {key: 'okrs', category: 'OKRs', label: 'Create your first OKR (post-P7)'},
    {key: 'escalation', category: 'Alerts', label: 'Configure alert escalation policies'},
    {key: 'custom_domain', category: 'Setup', label: 'Add custom domain'},
    {key: 'compliance_review', category: 'Compliance', label: 'Review compliance settings'},
  ];
  ```
- [ ] `SetupChecklistService.list()` — lazy upsert (fresh orgs return 14 pending rows without persisting until status changes)
- [ ] `SetupChecklistService.markStatus(key, status)` — flips status; persists if not already
- [ ] Endpoints:
  - `GET /setup-checklist` (auth)
  - `POST /setup-checklist/:key/complete` (auth)
  - `POST /setup-checklist/:key/dismiss` (auth)
  - `POST /setup-checklist/:key/reset` (auth)
- [ ] 7 unit tests covering lazy upsert, status transitions, idempotency

## Frontend (the big build)

### Wizard shell (`apps/web/src/app/signup/wizard/`)

- [ ] `<WizardShell>` (page component at `apps/web/src/app/signup/wizard/page.tsx`):
  - 3-pane layout: step sidebar (200px) | step content (flex) | AI co-pilot rail (380px slide-out)
  - Footer with Back / Save & Continue buttons
  - Top bar with progress indicator + org name + sync status badge
- [ ] `<EntrySplash>` — first screen shows 3 cards:
  1. **Quick start** (5-10 min, minimal fields, posts → entryMode=quick)
  2. **Full setup** (express full org depth, posts → entryMode=full)
  3. **Template gallery** (browse rich/starter templates → applies payload → enters full mode with prefilled data)
- [ ] `<StepSidebar>` — list of steps with checkmark icons + sync status badge + jump-to navigation
- [ ] `<StepContent>` — renders the active step component
- [ ] `<AICopilotRail>` — slides in from right; contains:
  - `<AICopilotHeader>` — mode tabs (Generate / Assistant / Suggest / Explain)
  - `<AICopilotComposer>` — text input + send button + rate-limit indicator
  - `<AICopilotThread>` — message list with diff previews
  - `<AIDiffPreview>` — modal showing proposed changes per section (additive/edit/remove); user clicks per-section accept/edit/reject
- [ ] `<DraftSyncProvider>` — Context provider with state + dispatch + actions reducer:
  - 600ms debounced backend sync (PUT /onboarding/:id)
  - Instant localStorage cache write on every state change
  - Sync status: 'saving' | 'saved' | 'offline' (header badge reflects)
  - `flush()` (force immediate save), `clearLocal()` (wipe), `readLocal()` (restore on mount)
- [ ] `<OfflineBanner>` — top warning if last sync failed
- [ ] `<ResumeBanner>` — prompt to resume cached draft on /signup landing
- [ ] `<DraftStatusBadge>` — visual (saving spinner / checkmark / offline icon)
- [ ] `<WizardCard>`, `<WizardEmptyState>`, `<WizardField>` — reusable UI primitives
- [ ] `<WizardSectionHeader>` — section title + description
- [ ] `<WizardKeyboardHints>` — floating hint showing keyboard shortcuts (Ctrl+Enter = save & continue, Esc = close rail)
- [ ] `<SuggestChip>` — AI suggestion chip (click to accept)
- [ ] `<TemplateGallery>` — browse template cards with preview + apply

### Wizard steps (`apps/web/src/components/wizard/steps/`)

5 steps in the simplified UI; each step has "advanced" expand-to-reveal sections matching seed.ts depth:

- [ ] `<OrganizationStep>` — basic: name + industry + sizeTier. Advanced: timezone/currency/locale/fiscal calendar/branding/compliance/terminology
- [ ] `<StructureStep>` — basic: pick "Departments → Teams" template. Advanced: dimension picker + type editor + drag-drop tree + per-unit code/description/head/metadata
- [ ] `<RolesStep>` — basic: 4 default roles (Admin/Manager/Employee/Viewer). Advanced: permission matrix + role hierarchy editor + per-role color/level/default assignments + permission preset apply
- [ ] `<KPIsStep>` — basic: skip + add later. Advanced: industry catalog browser (filter by quadrant/function/search/popularity) + per-KPI all fields including unitConfig + tieredTargets + cascade hint
- [ ] `<AdminTeamStep>` — basic: admin credentials. Advanced: optional MFA enrollment in-flow + team via CSV upload OR bulk invitations OR manual entry + per-user fields (managerEmail, orgUnitIds, notificationPrefs) + dry-run validation report before commit

### Setup checklist (post-onboarding)

- [ ] Home page (`/`) embeds `<SetupChecklistCard>`:
  - Progress bar (X of 14 complete)
  - List pending tasks with quick action links
  - Collapsible "Completed & dismissed" section
  - Dismissable per task

### Onboarding tour (first-login tooltips)

- [ ] `<OnboardingTour>` mounted in `(app)/layout.tsx`:
  - Multi-step modal (5 slides: welcome / KPIs / strategy map / digest / wrap)
  - Persists `onboardingTourCompleted` to `User.notificationSettings` via `PATCH /me/preferences`
  - No-op once flag set
- [ ] Floating welcome card on first visit

### In-app help drawer (extension of P9 but stub here)

- [ ] `<HelpDrawer>` — floating `?` button (top-right with pulse hint until first open)
- [ ] Slide-in right drawer with contextual route → tip cards (CONTEXTUAL_HELP registry maps pathname patterns; expanded in P9)

## Tests

### Unit tests
- [ ] OnboardingService.complete: atomic transaction — partial failure rolls back
- [ ] Draft token validation: wrong token rejected
- [ ] AI generator: prompt → valid JSON output (mock AI provider)
- [ ] AI assistant: instruction → valid RFC 6902 patch
- [ ] Rate-limiter: generator 5/hr enforced
- [ ] SetupChecklist: lazy upsert (no rows persisted until status change)

### Integration tests
- [ ] Full happy-path: start session → patch payload steps 1-5 → complete → Organization + all related rows exist + user receives JWT
- [ ] AI-generated org instantiation: generator returns full payload → applied → complete → seed.ts-equivalent depth reproduced

### e2e tests
- [ ] `apps/web/e2e/onboarding-happy-path.spec.ts`:
  - Visit /signup → click "Full setup"
  - Enter org details → step through 5 steps (org / structure / roles / KPIs / team)
  - Submit on review step → land in /
  - Setup checklist visible with 14 pending tasks
- [ ] `apps/web/e2e/onboarding-ai-generator.spec.ts`:
  - Visit /signup → "Full setup"
  - Open AI rail → "Generate" → type "B2B SaaS startup, 50 employees" → submit
  - Wait for AIDiffPreview → click "Apply all"
  - Verify steps populated with ≥5 roles, ≥3 unit types, ≥5 KPIs
- [ ] `apps/web/e2e/onboarding-template.spec.ts`:
  - Visit /signup → "Template gallery"
  - Pick "SaaS-Startup (Rich)"
  - Preview shows org depth
  - Apply → enter full mode with prefilled state
  - Complete → resulting org matches seed.ts depth (10 roles / 14 positions / 11 units / 20 KPIs)
- [ ] `apps/web/e2e/onboarding-draft-resume.spec.ts`:
  - Start session → enter org name → kill browser tab
  - Reopen /signup → ResumeBanner appears with cached state
  - Click "Resume" → state restored

## Acceptance checklist

```bash
# 1. Tests
pnpm test && pnpm test:int
pnpm --filter @kpi-nexus/web test:e2e

# 2. Full seed.ts reproduction
# a. Visit /signup → Template gallery → "SaaS-Startup (Rich)" → Apply
# b. Step through 5 wizard steps (just review, don't change much)
# c. Submit on review
# d. Query DB or visit /roles, /positions, /org-units, /kpis
# e. Verify: 10 roles, 14 positions, 11 units, 20 KPIs, 5 categories — matches original seed.ts

# 3. AI generator
# a. Visit /signup → Full setup
# b. AI rail → Generate → "B2B SaaS startup, 50 employees, focus on engineering excellence"
# c. Wait <30s for AIDiffPreview
# d. Verify reasonable JSON with ≥5 roles, ≥3 unit types, ≥5 KPIs

# 4. Draft persistence
# a. Start session → enter org name + 2 roles
# b. Kill browser tab without saving
# c. Reopen → ResumeBanner with right org name + roles

# 5. Rate limit
# a. Fire generator call 6 times within 1 hour
# b. 6th call returns 429 with retryAfter

# 6. Setup checklist
# a. Complete onboarding
# b. Land on /
# c. SetupChecklistCard shows 14 pending tasks
# d. Mark "MFA" complete → row state persists
# e. Dismiss "OKRs" → moves to dismissed group

# 7. CI green
```

Tag `git tag p6-complete`.

## Gotchas + notes

- **Draft localStorage size**: large drafts (full org with 20 KPIs) can exceed 1MB; truncate metadata fields before serializing
- **AI generator JSON validity**: AI sometimes returns extra prose; strip ```json fences + try multiple parse strategies before failing
- **Template application**: must merge with existing draft (don't blow away), so user can apply template then customize
- **Materialization transaction**: 7+ table inserts in one transaction — Prisma `$transaction(async tx => {...})`; if any fails, all roll back
- **Test data isolation**: e2e tests for onboarding must use unique org slugs/emails to avoid cross-test contamination
- **AIDiffPreview UX**: a busy generator output (50 KPIs) is overwhelming — chunk by section (roles / units / KPIs separately) for review
- **Onboarding tour timing**: don't show until user has signed in for ≥1 minute (avoid flash on hard reload)

## Out of scope for P6

- Plugin-based onboarding extensions (P9)
- Multi-language onboarding (P9 i18n)
- Onboarding analytics (cohort funnel etc.) — instrument later

## What comes next

Once P6 is tagged complete, open `docs/superpowers/plans/P7-collaboration.md`. P7 builds tasks, comments, mentions, OKRs, approvals, and the generic workflow rule engine.
