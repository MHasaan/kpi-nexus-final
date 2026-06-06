# OKRs + Tasks Pages — Depth & Detail Overhaul

> Execute with superpowers:subagent-driven-development. **Frontend only** — the backend is complete:
> full objective + key-result CRUD (KPI links, weights, parent/child alignment, progress rollup,
> sync-from-KPIs), full task CRUD (assignee/due/priority/status/KPI/alert + filters), comments+mentions
> for both ('objective'/'task' entity types).

**User ask:** the OKRs + Tasks pages "are not proper, they should be in more depth and detail." They're
shallow CRUD that hides the rich backend.

**Foundation (DONE):** `collab-client` now has `updateObjective`, `deleteObjective`, `deleteKeyResult`,
KeyResult `description`, Task `alertId`, KR create `description?`.

Backend reference: Objective {name, description, ownerUserId, parentObjectiveId, periodStart/End, status
(DRAFT|ACTIVE|AT_RISK|ACHIEVED|MISSED|ARCHIVED), progress}. KeyResult {name, description, kpiId,
baselineValue, targetValue, currentValue, weight, progress}. Objective progress = weighted KRs + child
objectives. `POST /objectives/:id/sync-from-linked-kpis`. Task {title, description, kpiId, alertId,
assigneeUserId, dueAt, status, priority}. `listTasks` filters status/priority/assignee (+ backend
kpiId/dueBefore/dueAfter). `CommentsDrawer` (entityType 'objective'/'task') is reusable.
Helios seed: 3 aligned objectives (Company→Sales, CS) with 5 KRs (KPI-linked); 6 tasks across statuses.
Login `admin@helios.io`/`Password123!`.

---

## Task B1 — OKRs list page depth (`apps/web/src/app/okrs/page.tsx`)
- Show per objective: name, **owner** (resolve via listUsers), **period** (start–end), **status** badge,
  **progress** bar/ring + %. (KR count if cheap.)
- **Filters**: status (Select) + owner (Select); client-side or via backend query params (listObjectives
  has no params in the client — filter client-side over the loaded list, OR add params; client-side fine).
- **Proper create**: replace the hardcoded-2026 quick-add with a create form/modal collecting name,
  description, **owner** (Select of users, default self), **period start + end** (date inputs; default to a
  sensible quarter), **status** (default DRAFT/ACTIVE), optional **parent objective** (Select of existing
  objectives) → `createObjective`. Gate `KPI_CREATE`.
- **Edit + delete from list**: an edit affordance (inline or link to detail) + a delete (with confirm) via
  `deleteObjective` (gate KPI_DELETE). 
- **Alignment grouping**: render objectives as an alignment tree/grouping — top-level objectives with their
  child objectives nested under them (use `parentObjectiveId`), each showing progress. This makes the OKR
  hierarchy visible. (A grouped list with indentation is fine; doesn't need a fancy graph.)
- PageHeader, KpiSubnav-style is N/A; keep states + design system. data-testids preserved/added.
- Commit `feat(web): OKRs list — owner/period/status/progress, filters, full create, alignment tree`.

## Task B2 — OKR detail page depth (`apps/web/src/app/okrs/[id]/page.tsx`)
- **Objective header**: name, description, owner, period, status badge, big progress ring/%. An **Edit
  objective** action (form: name/description/owner/period/status/parent) → `updateObjective`; a Delete.
- **Key Results — full management**: each KR shows name, description, baseline→current→target, **weight**,
  unit (from linked KPI), progress bar, and the **linked KPI** (name, link to /kpis/<id>). Actions:
  - **Add KR** (form: name, description, target*, baseline, current, weight, optional **KPI link** via a
    KPI picker — reuse the KpiPicker from the dashboards work `components/dashboard-grid/kpi-picker.tsx`,
    or a simple Select of listKpis) → `createKeyResult`.
  - **Edit KR** (all fields incl. weight, KPI link, target/baseline) → `updateKeyResult`. Keep the quick
    current-value entry too.
  - **Delete KR** → `deleteKeyResult`.
  - **Sync from linked KPIs** button → `syncObjectiveFromKpis` (pulls latest KPI values into KRs, recomputes).
- **Alignment / cascade**: show the **parent objective** (if any, link to it) and the **child objectives**
  that roll up (list with each child's progress + a note that the objective's progress combines its KRs +
  children). Fetch children by filtering `listObjectives()` for `parentObjectiveId === this.id`.
- **Progress breakdown**: visualize how progress rolls up (KR contributions by weight + child objectives).
- Keep the **CommentsDrawer** (entityType 'objective'). States + design system. data-testids.
- Commit `feat(web): OKR detail — editable objective, full KR CRUD + KPI link, alignment/rollup, sync`.

## Task C — Tasks page depth (`apps/web/src/app/tasks/page.tsx`)
- **Richer cards**: show assignee (name/avatar via listUsers map), **due date** with overdue/soon highlight,
  priority badge, **linked KPI** badge (name, link), a description preview/indicator, comment indicator. Keep
  the strike-through on DONE.
- **Full create**: keep the per-column quick-add (title→Enter), but ADD a "New task" modal/form with title,
  description, **assignee** (Select), **due date**, **priority**, **status**, optional **KPI link** → `createTask`.
- **Task detail drawer/modal**: clicking a card opens a detail panel with ALL fields editable (title,
  description, assignee, due, priority, status, KPI), a Delete, and the **CommentsDrawer** (entityType
  'task') for discussion/mentions. Save via `updateTask`.
- **More filters + sort**: keep priority + assignee; add **status** (or keep columns), **search** by title,
  and a **sort** (due date / priority / created). Keep the kanban drag-and-drop between columns.
- States + design system. data-testids preserved (`quick-add-*`, `column-*`, `task-*`, `filter-*`) + added.
- Commit `feat(web): Tasks — rich cards (assignee/due/KPI), full create + detail drawer + comments, filters/sort`.

## Task D — verify + live
- typecheck/lint/build + web tests; full API suite green (no backend change).
- Run the stack (Helios, `admin@helios.io`). Browser-verify: OKR list shows owner/period/status/progress +
  alignment tree + filters + create; OKR detail edits the objective, adds/edits/deletes a KR, links a KR to a
  KPI, shows parent/children rollup, sync-from-KPIs works; Tasks show assignee/due/KPI on cards, full create
  modal, click a card → detail drawer with edit + comments, filters/sort, drag still works. 0 console errors.
  Clean up anything created.
- Update memory; final commit.

## Out of scope
- New backend endpoints (all exist). OKR check-in/history workflow, task dependencies, recurring tasks.
