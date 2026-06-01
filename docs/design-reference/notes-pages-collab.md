# Notes — Collab area pages restyle (area key: collab)

Restyled the real P7/P9 collaboration pages to the design (views-collab.jsx /
views-execute.jsx / pages-collab.jsx + 08-okrs-tasks-collaboration.md) using the
ui primitives + AppShell. **Pages live directly under `apps/web/src/app/`** (NOT in
an `(app)` route group), and CommentsDrawer is at `apps/web/src/components/`.

## Files restyled (8)
1. `app/okrs/page.tsx` — AppShell + PageHeader. Inline create card (gated `KPI_CREATE`),
   3-col objective card grid, status Badge (tone map DRAFT/ACTIVE/AT_RISK/ACHIEVED/MISSED),
   hero progress bar (color varies by status), flag icon. Skeleton/EmptyState(Flag)/error/success.
2. `app/okrs/[id]/page.tsx` — AppShell (crumbs OKRs / name) + PageHeader carrying the
   self-contained `<CommentsDrawer entityType="OBJECTIVE">` as the action. 2fr/1fr grid:
   Key-results card (per-KR progress bar + inline current-value Input committing on blur,
   `Sync from linked KPIs` button in card header) + gradient "Overall progress" hero card +
   "Add key result" form card. Skeleton/empty(kr-empty)/error/success.
3. `app/tasks/page.tsx` — AppShell + PageHeader. Inline add-task card. 5-col kanban
   (surface-1 lanes, count pill, drop-target highlight via accent-bg + dashed border on
   dragover, "Drop here" hint on empty cols), task cards with priority Badge + hover delete (X).
   Kept HTML5 drag-drop (added over-column highlight). Skeleton/error/success (board always shown).
4. `app/approvals/page.tsx` — AppShell + PageHeader (pending Badge). Workflow-config card grid
   (active Badge + approver) + pending-requests rows (Approve primary / Reject secondary).
   Skeleton/EmptyState(pending-empty)/error/success.
5. `app/workflows/page.tsx` — AppShell + PageHeader. 340px/1fr split: "New automation" form card
   (gated `ORG_SETTINGS`, with fallback note) + active-automations list (Activity icon, delete X).
   Skeleton/EmptyState(workflows-empty, Activity icon)/error/success.
6. `app/activity/page.tsx` — AppShell + PageHeader (entity-filter Select as action). Single timeline
   Card (Avatar + actor/action/entity + ts), Load-more button. Skeleton/EmptyState(History)/error/success.
7. `app/me/mentions/page.tsx` — AppShell + PageHeader (unread Badge + unread-only checkbox +
   Mark-all-read). Mention cards; unread = left accent border + accent-bg tint + bold (not colour-only),
   per-row Mark-read. Skeleton/EmptyState(AtSign)/error/success.
8. `components/comments-drawer.tsx` — Restyled the existing self-contained drawer (keeps its
   own trigger pill + open state; props unchanged: entityType/entityId only — consumers like KPI
   detail are untouched). Added backdrop overlay, ESC-to-close, loading skeleton, EmptyState,
   role="alert" error, Avatar/Textarea/Button primitives, MessageSquare/X icons.

## Every original testid preserved (none removed)
- okrs: okrs-error, okrs-empty, objective-name, create-objective, objective-grid, objective-<id>
- okr detail: okr-error, objective-heading, sync-kpis, objective-progress, kr-list, kr-<id>,
  kr-current-<id>, kr-progress, kr-empty, kr-name, kr-baseline, kr-target, add-kr
- tasks: tasks-error, task-title-input, create-task, kanban, column-<STATUS> (TODO/IN_PROGRESS/
  BLOCKED/DONE/CANCELLED), task-<id>, task-title
- approvals: approvals-error, workflow-config, workflow-<entityType>, pending-requests, request-<id>,
  approve-<id>, reject-<id>, pending-empty
- workflows: workflows-error, wf-name, wf-kpi-id, wf-operator, wf-value, wf-task-title, wf-create,
  workflow-list, workflow-<id>, workflows-empty
- activity: activity-entity-filter, activity-error, activity-list, activity-<id>, activity-empty,
  activity-load-more
- mentions: mentions-unread-badge, unread-only, mark-all-read, mentions-error, mentions-list,
  mention-<id>, mark-read-<id>, mentions-empty
- comments-drawer: comments-trigger, comments-drawer, comments-close, comments-list, comment-<id>,
  comment-body, comment-submit

## API / permissions — unchanged
All collab-client + polish-client calls and payloads kept verbatim (listObjectives/createObjective/
getObjective/listKeyResults/addKeyResult/updateKeyResult/syncObjectiveFromKpis, tasks CRUD,
approvals workflows+requests+decide, workflows CRUD, mentions, comments, listActivity). Permission
keys are the real 18-key enum (KPI_CREATE on okrs create, ORG_SETTINGS on the workflow form) — NOT
invented `okr:read` style keys. getAccessToken→/login redirect retained on every page.

## Verification
`cd apps/web && npx tsc --noEmit` → **0 errors** (whole web app).

## TODO / notes
- Approvals proposed-changes diff preview (design shows a +/- diff per request) is NOT rendered:
  the real `ApprovalRequest.proposedChanges` is an untyped record and no diff component exists in the
  kit; left as status text. Could add a diff later.
- Tasks quick-add-per-column (`quick-add-<STATUS>`) + linked-KPI/assignee/due on cards from the design
  are not wired — the real `createTask` add box is a single top input and the real list testids don't
  include those; kept existing behaviour to avoid breaking e2e.
- `Select` width: the primitive wraps the native select in a `relative` div, so `className="w-40"`
  sizes the inner select, not the wrapper (cosmetic only).
