# 08 — OKRs, Tasks, Approvals, Workflows, Activity, Mentions, Comments

The collaboration layer (P7) + activity/mentions (P9). Turns tracking into action:
tasks tied to KPIs, OKRs framing KPIs into goals, approval governance, an automation rule
engine, an audit-backed activity feed, a mentions inbox, and a comments drawer reusable on
any entity.

---

## `/tasks` — Kanban board

- **Access**: authenticated (baseline `KPI_VIEW`); entity-bound visibility (non-admins see tasks they created or are assigned).
- **Purpose**: manage tasks across a 5-column lifecycle.
- **Layout**: a **kanban** (`kanban`) with 5 columns (`column-TODO`, `column-IN_PROGRESS`, `column-BLOCKED`, `column-DONE`, `column-CANCELLED`), each with a count and a **quick-add** input (`quick-add-<STATUS>`, Enter to create). Cards (`task-<id>`) show title (`task-title`) + priority + (optional) linked KPI + assignee avatar + due date; per-card delete on hover.
- **Interactions**: **HTML5 drag-drop** between columns → optimistic status flip → `PATCH /tasks/:id` (rollback on failure). Filters (assignee, priority, due-before, KPI). Persists across reload.
- **Data/API**: `GET /tasks`, `POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`, `/tasks/my-tasks`, `/tasks/by-kpi/:id`.
- **States**: `tasks-error`; empty columns show a subtle drop hint.
- **Design notes**: the drag interaction must feel crisp (drop-target highlight, optimistic move); cards compact but scannable; priority as a labelled chip. Mobile → consider a list/segmented fallback (drag is hard on touch).

## `/okrs` — Objectives grid

- **Access**: `KPI_VIEW` read; create `KPI_CREATE`.
- **Purpose**: browse objectives; create.
- **Layout**: heading; **create** inline (name `objective-name`, button `create-objective`); a **grid** (`objective-grid`) of objective cards (`objective-<id>`) — name, owner, **progress bar** (0–100%), **status badge** (DRAFT/ACTIVE/AT_RISK/ACHIEVED/MISSED/ARCHIVED); click → `/okrs/[id]`. Filters by status/period/owner.
- **States**: `okrs-empty`, `okrs-error`.
- **Design notes**: progress meters are the hero; status badge uses status tokens (with text); period shown.

## `/okrs/[id]` — Objective detail

- **Access**: `KPI_VIEW`.
- **Purpose**: manage an objective's key results; see rolled-up progress.
- **Layout**: heading (`objective-heading`); an **overall progress meter** (`objective-progress`, %); a **Sync from linked KPIs** action (`sync-kpis`); a **KR list** (`kr-list`) — each KR (`kr-<id>`) shows name, baseline→target, an inline **current value** editor (`kr-current-<id>`, commits on blur), and a **KR progress %** (`kr-progress`); an **Add KR** form (name `kr-name`, baseline `kr-baseline`, target `kr-target`, submit `add-kr`). Aligned child objectives listed below.
- **Interactions**: editing a KR's current value recomputes its progress and the objective's weighted progress (and rolls up to parents); "Sync from linked KPIs" pulls the latest KPI value into KR current values.
- **Data/API**: `/objectives/:id`, `/objectives/:id/key-results` (CRUD), `/objectives/:id/sync-from-linked-kpis`.
- **States**: `okr-error`, `kr-empty`.
- **Design notes**: progress meter updates live on edit; weighted contribution per KR visible; clear baseline/target/current triplet.

## `/approvals` — Approval workflows + requests

- **Access**: workflow config requires `ORG_SETTINGS`; deciding requires being an approver (role in the workflow). Requesters see their own.
- **Purpose**: configure which entity changes need approval, and decide pending requests.
- **Layout**:
  - **Workflow config** (`workflow-config`): one card per entity type (`workflow-<KPI_DEFINITION|KPI_TARGET|ROLE_PERMISSIONS>`) — an **active** toggle (`workflow-active-<type>`), an **approver role** picker (`workflow-role-<type>`), require-all toggle.
  - **Pending requests** (`pending-requests`): each request (`request-<id>`) shows entity + a **proposed-changes diff**, with **Approve** (`approve-<id>`) / **Reject** (`reject-<id>`) + comment; self-approval is refused; requester can cancel.
  - **Resolved** (`resolved-requests`): historical list with outcome.
- **Interactions**: enabling a workflow means future edits to that entity return **HTTP 202** ("submitted for approval") instead of applying; approving replays the change.
- **Data/API**: `/approvals/workflows` (list + `PUT /:entityType`), `/approvals/requests` (list + `:id/decide` + `:id/cancel`).
- **States**: `approvals-error`, `pending-empty`.
- **Design notes**: the **diff preview** is the key component (before→after of the proposed payload); per-approver decision trail; clear "you are an approver for X" context.

## `/workflows` — Automation rule engine

- **Access**: `ORG_SETTINGS`.
- **Purpose**: "if a KPI changes and a rule matches, run an action" (e.g., create a task).
- **Layout**: heading; a **create** form — name (`wf-name`), a rule builder (KPI id `wf-kpi-id`, operator `wf-operator`, value `wf-value`), an action (task title `wf-task-title`), create (`wf-create`); a **list** (`workflow-list`) of automations with trigger(s), active state, last-run-at, delete.
- **Data/API**: `/workflows` CRUD; `kpi_changed` trigger fires when data points are recorded. (Schedule/alert triggers are documented deferrals; show only what's supported.)
- **States**: `workflows-empty`, `workflows-error`.
- **Design notes**: rule builder = trigger → condition → action, read like a sentence ("When MRR > 100000, create task 'Celebrate'"); a "Test trigger" button is a nice add.

## `/activity` — Activity feed (P9)

- **Access**: authenticated; admins see all org activity, others see their own.
- **Purpose**: chronological audit-backed timeline.
- **Layout**: heading; an **entity-type filter** (`activity-entity-filter`); a timeline **list** (`activity-list`) — each row (`activity-<id>`): actor name, action verb, entity type, timestamp; **Load more** (`activity-load-more`) cursor pagination.
- **Data/API**: `GET /activity?entityType=&cursor=&limit=` (cursor-paginated, side-loaded user names).
- **States**: `activity-empty`, `activity-error`.
- **Design notes**: dense timeline; group by day; click a row → the entity; filters for user/action/date range.

## `/me/mentions` — Mentions inbox (P7)

- **Access**: authenticated; a user only sees their own mentions.
- **Purpose**: see comments where you were @mentioned; mark read.
- **Layout**: heading with an **unread badge** (`mentions-unread-badge`); a filter **unread only** (`unread-only`); **Mark all read** (`mark-all-read`); a **list** (`mentions-list`) — each row (`mention-<id>`): "you were mentioned…", timestamp, **Mark read** (`mark-read-<id>`); click → the entity with the comment in view.
- **Data/API**: `/me/mentions`, `/me/mentions/unread-count`, `/me/mentions/:id/read`, `/me/mentions/read-all`.
- **States**: `mentions-empty`.
- **Design notes**: unread rows accented (left border + weight, not color-only); the header mentions-bell mirrors the unread count.

## CommentsDrawer (`components/comments-drawer.tsx`, built) — reusable

- **Mounted on**: KPI detail (03), and should be available on Dashboard/Alert/Task/Objective details.
- **Layout**: a 💬 trigger pill (`comments-trigger`) in the page header → a right slide-out drawer (`comments-drawer`, ~380px) with a threaded **comments list** (`comments-list`, each `comment-<id>`), a **composer** (`comment-body` textarea + `comment-submit`) with **@mention autocomplete** (queries `/users`), and a close (`comments-close`).
- **Behaviour**: posting creates a comment + Mention rows transactionally; @handles resolve to org members; self-mentions stripped. (Real-time comment updates are a P9-stretch deferral — currently refresh-on-submit.)
- **Design notes**: anchored drawer that doesn't cover the entity; markdown body; mention chips; relative timestamps + author.
