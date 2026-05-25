# P7 — Collaboration & Workflow Implementation Plan

| | |
|---|---|
| **Phase** | P7 — Collaboration & Workflow |
| **Goal** | Tasks, comments, mentions, OKRs, approval workflows, generic rule engine — turn KPI Nexus from a tracking tool into a collaboration platform |
| **Effort** | ≈4 weeks solo |
| **Depends on** | P0–P5 (uses KPIs for OKR links, alerts for task auto-creation) |
| **Blocks** | P8 (Slack integration consumes tasks/comments), P9 (mentions UI in i18n) |
| **Spec reference** | §3.7 (collaboration schema), §4.7 (collaboration modules) |

## Why this phase matters

KPIs are leading indicators; people are how things actually move. Tasks make KPI changes actionable. Comments preserve context. OKRs frame KPIs in goal hierarchies. Approval workflows add governance for sensitive changes. The rule engine generalizes alerting into "if this then that" for any KPI event.

## Exit criteria

- [ ] OKR objective with mixed KR types aggregates correctly (4 KR shape variants, weighted average, zero-weight fallback, parent rollup with depth-10 cycle guard)
- [ ] KPI update with approval workflow → throws HTTP 202 with requestId → approver approves → patch is replayed via ApprovalApplyService
- [ ] Comment with @mention creates Mention row in the same transaction
- [ ] Workflow rule engine: KPI change event triggers task creation via configured rule
- [ ] e2e: full task/comment/approval/OKR flows
- [ ] Tag `git tag p7-complete`

## Schema additions

### Migration: `017_collaboration`

```prisma
enum TaskStatus { TODO IN_PROGRESS BLOCKED DONE CANCELLED }
enum TaskPriority { LOW MEDIUM HIGH URGENT }
enum ObjectiveStatus { DRAFT ACTIVE AT_RISK ACHIEVED MISSED ARCHIVED }
enum ApprovalEntityType { KPI_DEFINITION KPI_TARGET ROLE_PERMISSIONS }
enum ApprovalRequestStatus { PENDING APPROVED REJECTED CANCELLED }

model Task {
  id              String        @id @default(cuid())
  organizationId  String
  kpiId           String?
  alertId         String?
  title           String
  description     String?
  assigneeUserId  String?
  dueAt           DateTime?
  status          TaskStatus    @default(TODO)
  priority        TaskPriority  @default(MEDIUM)
  externalRef     String?  // Jira link, etc.
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  createdById     String
  @@index([status, dueAt])
  @@index([kpiId])
  @@index([assigneeUserId, status])
}

model Comment {
  id                 String   @id @default(cuid())
  organizationId     String
  entityType         String   // "kpi" | "dashboard" | "alert" | "task" | "objective"
  entityId           String
  parentCommentId    String?  // threading
  authorId           String
  body               String   @db.Text
  mentionedUserIds   String[]
  deletedAt          DateTime?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  @@index([entityType, entityId, createdAt])
  @@index([parentCommentId])
}

model Mention {
  id                String   @id @default(cuid())
  organizationId    String
  commentId         String
  mentionedUserId   String
  readAt            DateTime?
  createdAt         DateTime @default(now())
  @@unique([commentId, mentionedUserId])
  @@index([mentionedUserId, readAt])
}

model Objective {
  id                  String           @id @default(cuid())
  organizationId      String
  name                String
  description         String?
  ownerUserId         String
  parentObjectiveId   String?  // alignment graph
  periodStart         DateTime
  periodEnd           DateTime
  status              ObjectiveStatus  @default(DRAFT)
  progress            Float            @default(0)  // 0-1
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
  @@index([organizationId, status])
  @@index([parentObjectiveId])
  @@index([ownerUserId])
}

model KeyResult {
  id                String     @id @default(cuid())
  organizationId    String
  objectiveId       String
  name              String
  description       String?
  kpiId             String?  // optional KPI link for auto-progress
  baselineValue     Float?
  targetValue       Float
  currentValue      Float?
  weight            Float      @default(1.0)
  progress          Float      @default(0)  // 0-1
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt
  @@index([objectiveId])
  @@index([kpiId])
}

model ApprovalWorkflow {
  id                      String              @id @default(cuid())
  organizationId          String
  entityType              ApprovalEntityType
  requiredApproverRoleIds String[]
  requireAll              Boolean             @default(false)
  isActive                Boolean             @default(false)
  createdAt               DateTime            @default(now())
  updatedAt               DateTime            @updatedAt
  @@unique([organizationId, entityType])
}

model ApprovalRequest {
  id                  String                   @id @default(cuid())
  organizationId      String
  workflowId          String
  entityType          ApprovalEntityType
  entityId            String
  requesterUserId     String
  proposedPayload     Json
  status              ApprovalRequestStatus    @default(PENDING)
  decisions           Json                     @default("[]")  // [{userId, decision, comment, decidedAt}]
  resolvedAt          DateTime?
  createdAt           DateTime                 @default(now())
  @@index([entityType, entityId])
  @@index([status, createdAt])
}
```

## Backend modules

### Module 1: TasksModule

- [ ] CRUD with status lifecycle (TODO → IN_PROGRESS → BLOCKED/DONE/CANCELLED)
- [ ] Filters: status, priority, assignee, KPI, due before/after
- [ ] Audit log on every mutation
- [ ] Permissions: Read → entity-bound (own assigned + own created + admin); Create/Edit → creator/assignee/USERS_MANAGE
- [ ] Endpoints: `GET/POST/PATCH/DELETE /tasks`, `GET /tasks/by-kpi/:kpiId`, `GET /tasks/my-tasks`

### Module 2: CommentsModule

- [ ] Threaded on KPI/Dashboard/Alert/Task/Objective
- [ ] `CommentsService.create(input)` — single transaction:
  - Persist Comment with mentionedUserIds extracted from body (@username regex)
  - For each mentioned user: persist Mention row (self-mentions stripped)
  - Publish `comment_added` + `mention_received` realtime events
  - Optional: send email notification to mentioned users
- [ ] Soft-delete via `deletedAt`; author-only edit/delete enforcement
- [ ] Permissions: Read → entity visibility; Write → entity visibility + author-only edit/delete
- [ ] Endpoints: `GET/POST/PATCH/DELETE /comments`, `GET /comments?entityType=&entityId=&page=`

### Module 3: MentionsModule

- [ ] `MentionsService.list({userId, unreadOnly?, limit?})` — returns per-user inbox
- [ ] `MentionsService.markRead(mentionId)` + `markAllRead()`
- [ ] `MentionsService.unreadCount(userId)` — for header badge
- [ ] Endpoints: `GET /me/mentions?unreadOnly=&limit=`, `GET /me/mentions/unread-count`, `POST /me/mentions/:id/read`, `POST /me/mentions/read-all`

### Module 4: OkrsModule (the math-heavy one)

**Files**: `okrs.module.ts`, `okrs.controller.ts`, `objectives.service.ts`, `key-results.service.ts`, `progress-math.ts`, `*.spec.ts`

- [ ] CRUD for Objectives + KeyResults with parent objective alignment graph
- [ ] **`progress-math.ts`** — pure helpers:
  - `keyResultProgress(kr: KeyResult, currentValue?: number): number` — clamped 0-1:
    - HIGHER_IS_BETTER with baseline: `(current - baseline) / (target - baseline)`
    - LOWER_IS_BETTER with baseline: `(baseline - current) / (baseline - target)`
    - No baseline: `current / target` (clamped)
    - baseline == target: 1 if current >= target else 0
  - `objectiveProgress(krs: KR[], childObjs: Objective[]): number` — weighted average:
    - Each KR contributes its `progress * weight`
    - Each child objective contributes its `progress * weight=1`
    - Zero-weight total → simple mean fallback
- [ ] `OkrsService.recomputeObjectiveProgress(objectiveId)` — walks up parentObjectiveId with 10-deep cycle guard (visited set)
- [ ] `OkrsService.syncFromLinkedKpis(objectiveId)` — for each KR with `kpiId`, pull latest data point → update `currentValue` → recompute progress
- [ ] Endpoints:
  - `GET/POST/PATCH/DELETE /objectives` (KPI_VIEW for read; KPI owner or KPI_CREATE for mutate)
  - `GET/POST/PATCH/DELETE /objectives/:id/key-results`
  - `POST /objectives/:id/sync-from-linked-kpis`
- [ ] 13 unit tests covering: 4 KR shape variants + weighted avg + zero-weight fallback + parent rollup + cycle guard + clamp01 edge cases

### Module 5: ApprovalsModule

**Files**: `approvals.module.ts`, `approvals.controller.ts`, `approval-workflow.service.ts`, `approval-request.service.ts`, `approval-apply.service.ts`, `*.spec.ts`

- [ ] `ApprovalWorkflowService` — CRUD on workflows (one per entityType per org); admin-only mutate
- [ ] `ApprovalRequestService.create({workflowId, entityType, entityId, proposedPayload})` — creates PENDING request; **returns HTTP 202 with `requestId` in body**
- [ ] `ApprovalRequestService.decide({requestId, decision, comment?})`:
  - Validates user's role is in workflow's `requiredApproverRoleIds[]`
  - Refuses self-approval (`requesterUserId === ctx.userId`)
  - Refuses duplicate decisions
  - Appends `{userId, decision, comment, decidedAt}` to `decisions Json`
  - Calls `resolveStatus(workflow, decisions)` — pure helper:
    - if `workflow.requireAll`: APPROVED iff every approver has approved; REJECTED if any rejected
    - else: APPROVED on first approval; REJECTED on first rejection
  - If APPROVED → fire `ApprovalApplyService.apply(request)`
- [ ] `ApprovalRequestService.cancel(requestId)` — requester only; only if status=PENDING
- [ ] `ApprovalApplyService.apply(request)` — dispatches by entityType:
  - KPI_DEFINITION → `KpisService.update(entityId, payload, {bypassApproval: true})`
  - KPI_TARGET → `KpiTargetsService.create/update(entityId, payload, {bypassApproval: true})`
  - ROLE_PERMISSIONS → `RolesService.update(entityId, payload, {bypassApproval: true})`
- [ ] **`requireApprovalIfActive(entityType, entityId, payload)` helper** — the seam:
  - Other modules call this before mutating; if active workflow exists, throws `ApprovalRequiredException` (HTTP 202 with `{requestId}`)
  - Wired into: `KpisService.update` (KPI_DEFINITION, skips status-only transitions), `KpiTargetsService.create/update` (KPI_TARGET with `kind: "create"|"update"` discriminator), `RolesService.update` (ROLE_PERMISSIONS, only when patch touches `permissions`/`isAdmin`/`parentRoleIds`)
- [ ] Endpoints:
  - `GET /approvals/workflows` (ORG_SETTINGS)
  - `PUT /approvals/workflows/:entityType` (ORG_SETTINGS)
  - `GET /approvals/requests?status=&entityType=` (auth)
  - `POST /approvals/requests/:id/decide {decision, comment?}` (auth)
  - `POST /approvals/requests/:id/cancel` (requester only)
- [ ] 6 unit tests on `resolveStatus`; 6 apply tests covering each entityType + bypassApproval flag works

### Module 6: WorkflowsModule (generic rule engine)

**Files**: `workflows.module.ts`, `workflows.controller.ts`, `workflows.service.ts`, `rule-evaluator.ts`, `action-dispatcher.ts`, `*.spec.ts`

- [ ] CRUD on Workflow rows
- [ ] **Triggers** (`triggers` array per workflow): `kpi_changed`, `schedule` (cron), `alert`, `manual`
- [ ] **Rule** (`rule Json`) — value-condition filters:
  - `{kind: "kpi_value", kpiId, operator: ">" | "<" | ">=" | "<=" | "==" | "!=", value}`
  - `{kind: "kpi_change_pct", kpiId, operator, value, windowDays?}`
  - `{kind: "alert_severity", operator: ">=" | "==", severity}`
  - 6 operators total
- [ ] **Actions** (`action Json`):
  - `{kind: "create_task", title, description?, assigneeUserId?, dueAtRelativeHours?, priority?}`
  - `{kind: "post_webhook", subscriptionId}` (uses existing WebhookSubscription)
  - `{kind: "send_notification", channelId, message}` (uses NotificationsModule)
- [ ] `RuleEvaluator.evaluate(rule, event)` → boolean — pure
- [ ] `ActionDispatcher.dispatch(action, event)` — fire side effect
- [ ] Wire `kpi_changed` trigger into `DataPointsService.create` (fire-and-forget after every non-COMPUTED data point)
- [ ] Wire `alert` trigger into `AlertEngineProcessor` (after alert persists)
- [ ] Wire `schedule` trigger as BullMQ repeatable jobs per workflow's cron
- [ ] `WorkflowsService.trigger(id, payload)` — manual fire (for `manual` trigger type)
- [ ] Endpoints: `GET/POST/PATCH/DELETE /workflows`, `POST /workflows/:id/trigger`
- [ ] 5 unit tests covering rule evaluator + action dispatcher per kind

## Frontend pages

- [ ] `/tasks` — kanban board (5 columns: TODO / IN_PROGRESS / BLOCKED / DONE / CANCELLED):
  - HTML5 native drag-drop (no dnd-kit dependency required)
  - Each card draggable; each column drop target
  - On drop: optimistic UI flip + PATCH `/tasks/:id` (rolls back on failure)
  - Per-card delete button
  - Quick-create form per column
  - Filters: assignee, priority, due-before, KPI
- [ ] `<CommentsDrawer entityType entityId />` — 380px slide-out anchored right of viewport:
  - Trigger: 💬 pill in page header (e.g., KPI detail, Dashboard detail, Alert detail)
  - Lists comments threaded; markdown body
  - Reply input at bottom; @mention autocomplete (queries `/users?q=`)
  - On submit: refresh on success (no realtime yet — P9 stretch)
  - Mounted on /kpis/[id], /dashboards/[id], /alerts/[id]
- [ ] `<CommentsPanel>` (alternative layout) — inline at page bottom; complementary to drawer
- [ ] `/me/mentions` — inbox table:
  - Unread count badge in AppHeader bell
  - Filter: unread only / all
  - Mark read individually or "Mark all read"
  - Click → navigate to entity (e.g., KPI/Dashboard/Alert/Task) with comment scrolled into view
- [ ] `/okrs` — grid of objective cards:
  - Per card: name, owner avatar, progress bar (0-100%), status badge (DRAFT/ACTIVE/AT_RISK/ACHIEVED/MISSED/ARCHIVED)
  - Filters: status, period, owner
  - "Create objective" button
- [ ] `/okrs/new` — form: name + description + owner + parent objective (alignment) + period start/end
- [ ] `/okrs/[id]` — detail page:
  - Overall progress meter
  - KR cards with inline `currentValue` edit + delete + status dropdown
  - "Add KR" form (name + optional KPI link + baseline + target + weight)
  - "Sync from linked KPIs" button
  - Aligned children list (sub-objectives that have `parentObjectiveId = this`)
- [ ] `/approvals` — Pending / Resolved split:
  - Per-request card: entity link + proposed changes diff + per-approver decision buttons + comment field + cancel button (requester only)
  - Filters: status, entityType
- [ ] `/approvals/workflows` — per-entity-type config:
  - One card per ApprovalEntityType (KPI_DEFINITION / KPI_TARGET / ROLE_PERMISSIONS)
  - Pick approver roles (multi-select), requireAll toggle, isActive toggle
- [ ] `/workflows` — rule engine editor:
  - List existing workflows with status + last run
  - Create form: name + triggers (multi-select) + rule builder (kind + operator + value) + action builder (kind + params)
  - "Test trigger" button to manually fire

## Tests

### Unit tests
- [ ] OKR progress math: 13 cases covering 4 KR shapes + weighted avg + zero-weight + parent rollup + cycle guard
- [ ] ApprovalsService.resolveStatus: 6 cases (single approver, requireAll, mixed decisions, etc.)
- [ ] ApprovalApplyService: 6 cases (each entityType + bypassApproval flag)
- [ ] WorkflowsModule rule evaluator: 5 cases (each operator)
- [ ] Comments: mention extraction from body (regex), self-mention stripped

### Integration tests
- [ ] KPI update with active workflow: `PATCH /kpis/:id` returns 202 with requestId; approve via `/approvals/requests/:id/decide`; KPI actually updates with new values
- [ ] OKR with linked KPI: record KPI data point → run sync → KR currentValue updates → progress recomputes → objective rollups recompute
- [ ] Comment with @mention: creates Mention row in same transaction (rollback test)
- [ ] Workflow `kpi_changed` trigger: KPI insert event → rule evaluates → task created

### e2e tests
- [ ] `apps/web/e2e/tasks-kanban.spec.ts` — create task → drag to IN_PROGRESS → status persists on reload
- [ ] `apps/web/e2e/comments-mentions.spec.ts` — comment with @user → /me/mentions shows row → mark read
- [ ] `apps/web/e2e/okrs.spec.ts` — create objective + 2 KRs → manually update KR currentValue → progress meter updates
- [ ] `apps/web/e2e/approvals.spec.ts` — admin enables approval workflow → manager tries KPI edit → 202 → admin approves → KPI applies

## Acceptance checklist

```bash
# 1. Tests
pnpm test && pnpm test:int
pnpm --filter @kpi-nexus/web test:e2e

# 2. OKR aggregation correctness
# a. Create objective with 3 KRs (different shapes: HIGHER_IS_BETTER with baseline, LOWER_IS_BETTER with baseline, no-baseline)
# b. Update currentValue on each
# c. Verify objective progress = weighted average (with current weights)
# d. Add child objective with own KRs
# e. Verify parent rolls up child's progress

# 3. Approval workflow round trip
# a. Enable KPI_DEFINITION approval workflow with 1 approver role (e.g., "Compliance")
# b. As manager, PATCH a KPI → response 202 with requestId
# c. KPI in DB unchanged
# d. As compliance user, /approvals → see request → approve
# e. KPI now reflects patched values

# 4. Comment + mention
# a. On any KPI, open CommentsDrawer
# b. Write "Looks great @alice"
# c. Mention row created; alice's /me/mentions shows it
# d. Click mention → navigates to KPI with comment visible

# 5. Workflow rule engine
# a. Create workflow: trigger=kpi_changed, rule=kpi_value MRR > 100000, action=create_task("Celebrate!")
# b. Record MRR data point of 150000
# c. /tasks → "Celebrate!" task created automatically

# 6. CI green
```

Tag `git tag p7-complete`.

## Gotchas + notes

- **OKR cycle guard**: depth-10 limit; if exceeded → log warning + skip; never throw (don't break OKR list page)
- **Approval bypassApproval flag**: must be set internally only; never via API param (would bypass governance)
- **Comments threading**: max depth 5; deeper nests collapse to flat list
- **Mention regex**: `@([a-zA-Z0-9_-]+)` matches usernames; resolve to userId by lookup; ambiguous matches → require disambiguation in UI
- **Drag-drop on mobile**: kanban hard on small screens; consider list view fallback
- **Workflow `schedule` trigger**: each schedule rule registers a BullMQ repeatable job; clean up old jobs when workflow deleted/edited
- **Action `create_task`**: `dueAtRelativeHours` lets rule say "due in 24 hours from trigger"

## Out of scope for P7

- Real-time comment updates via SSE (P9 stretch)
- Approval workflow for Dashboard publish (extend in future if needed)
- Multi-approval-level (linear escalation) — current design is single-level
- OKR-to-OKR dependencies beyond parent (graph-style alignment) — current is tree

## What comes next

Once P7 is tagged complete, open `docs/superpowers/plans/P8-integrations.md`. P8 builds Slack/Teams/Jira integrations, pull connectors, inbound email, plugins.
