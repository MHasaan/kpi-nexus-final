# KPI Pages Overhaul — Implementation Plan

> Execute with superpowers:subagent-driven-development. **Mostly frontend** — the backend `POST /kpis`
> DTO already accepts every field (name, description, unit, categoryId, scope, type, direction, frequency,
> aggregationMethod, status, targetValue, warning/criticalThreshold, allowNegative, scorecardQuadrant,
> ownerUserId, tags, orgUnitIds, userIds). No backend change needed.

**Goal:** Make the KPIs page + 6 sub-pages (Categories, Templates, Tree, Scorecard, Import, Archive)
properly built with consistent UI/UX and all options working, and — the headline — make **KPI creation
(especially from a template) genuinely usable**.

**Root problems (all FE):** the create form is a cramped 6-col inline grid missing ~10 fields; "Use
template" instantly creates a DRAFT with zero customization; the list has no search/filter(category,status)/
edit; sub-pages each have gaps (categories no icon, archive silent errors + browser confirm, import no
preview/nav, etc.) and no connected sub-nav.

**Key design decision:** route ALL creation (manual AND template) through a single rich, sectioned
**`/kpis/new`** page backed by `createKpi` (full DTO). "Use template" → `/kpis/new?template=<id>`
(prefilled). Edit via `/kpis/[id]/edit` reusing the same `<KpiForm>`. This fixes both "missing fields"
and "templates are hard" at once.

Helios Cloud seed login for live checks: `admin@helios.io` / `Password123!`.

---

## Task A — api-client + shared KpiSubnav foundation
**Files:** `apps/web/src/lib/api-client.ts`; new `apps/web/src/components/kpis/kpi-subnav.tsx`; all 7 KPI pages.
- Extend `createKpi` body type to the FULL DTO: add `categoryId?, direction?, frequency?, aggregationMethod?,
  status?, warningThreshold?, criticalThreshold?, allowNegative?, ownerUserId?, tags?` (keep existing). Add a
  matching `updateKpi(id, patch)` that accepts the same partial (if not already full).
- Add `getKpiTemplate(id)` if a single-template fetch helps prefill (else read from the templates list).
  `listUsers()`, `listOrgUnits()`, `listKpiCategories()` already exist for the pickers.
- Build `<KpiSubnav active="catalog|categories|templates|tree|scorecard|import|archive" />` — a horizontal
  tab/link bar (Catalog + the 6) using `usePathname()` to highlight active; design-system styling (match the
  existing SUBNAV markup on `/kpis`). Replace the inline `SUBNAV` on `/kpis` with it and add it to ALL six
  sub-pages (under their PageHeader) so the section is navigable + has a clear "back to Catalog".
- Verify web typecheck/lint/build. Commit `feat(web): KPI api-client full-DTO types + shared KpiSubnav`.

## Task B — `/kpis/new` create + `/kpis/[id]/edit` + template prefill (CENTERPIECE)
**Files:** new `apps/web/src/components/kpis/kpi-form.tsx`; new `apps/web/src/app/kpis/new/page.tsx`;
new `apps/web/src/app/kpis/[id]/edit/page.tsx`.
- `<KpiForm mode="create"|"edit" initial?>` — a well-organized, sectioned form (Cards):
  - **Basics:** name*, description (Textarea), category (Select from `listKpiCategories`), owner (Select from
    `listUsers`), tags (chip/comma input).
  - **Measurement:** type, unit, direction, frequency, aggregationMethod (Selects with sensible defaults +
    short help text). scope (Select ORG_WIDE/PER_UNIT/PER_USER) — when PER_UNIT show an org-unit multiselect,
    when PER_USER show a user multiselect, INLINE right under scope (not below the submit). On edit, scope +
    assignments may be read-only/limited (note it).
  - **Target & status:** targetValue, warningThreshold, criticalThreshold, allowNegative (checkbox),
    scorecardQuadrant (Select), status (Select; default DRAFT).
  - Validation, loading, error; a clear primary "Create KPI"/"Save changes" + Cancel.
- `/kpis/new`: renders `<KpiForm mode="create">`. If `?template=<id>` present, fetch the template and prefill
  name/type/unit/direction/frequency/aggregationMethod/scorecardQuadrant/tags from it, and show the
  template's `targetSummary` as a hint near targetValue (targetValue stays user-entered — it's numeric).
  On submit → `createKpi(full body)` → redirect to `/kpis/<id>` (detail) with the new id. Gate `KPI_CREATE`.
- `/kpis/[id]/edit`: load the KPI (`getKpi`), render `<KpiForm mode="edit" initial={kpi}>`; submit →
  `updateKpi(id, patch)` → redirect to `/kpis/<id>`. Gate `KPI_EDIT`.
- Live-verify: creating from a template now opens the prefilled form; manual create has all fields.
- Commit `feat(web): rich /kpis/new create + /kpis/[id]/edit + template prefill (KpiForm)`.

## Task C — main `/kpis` list polish
**Files:** `apps/web/src/app/kpis/page.tsx`.
- Use `PageHeader` (title "KPIs", actions: a "New KPI" `Button`/Link → `/kpis/new`, gated KPI_CREATE).
- Add `<KpiSubnav active="catalog" />`.
- Replace the cramped inline create form with the New KPI button (creation now lives on `/kpis/new`).
- Add a **search** input (filter rows by name, client-side) + filters: **category** (Select), **status**
  (Select), keep **scope** (Select). Combine client-side.
- Add an **Edit** action per row (Link → `/kpis/<id>/edit`, gated KPI_EDIT) alongside Record/Delete; keep the
  inline ORG_WIDE record-data expansion. Tidy empty/loading states.
- Commit `feat(web): KPIs list — header, search/filters, New KPI + Edit actions`.

## Task D — sub-pages polish
**Files:** the 6 sub-page files + `kpi-subnav` (from A).
- **Templates** (`templates/page.tsx`): change "Use template" to a Link → `/kpis/new?template=<id>` (the
  prefilled rich form). Keep a secondary "Quick add" that does the old instant `instantiateTemplate` if you
  like, but the primary CTA is "Use template" → customize. Show `popularity`. KpiSubnav.
- **Categories** (`categories/page.tsx`): add an **icon** field (text or a small lucide-name input) and a
  proper **color** input (`<input type="color">` beside the hex), clean up the inline-edit UX (clear edit row
  highlight, separate the KPIs-count column from the sortOrder editor). KpiSubnav.
- **Archive** (`archive/page.tsx`): SURFACE errors (replace silent `.catch(()=>undefined)` with an error
  banner), add per-row loading/disabled state on Restore/Purge, replace `window.confirm` with an inline
  styled confirm (a small "Confirm purge?" row or a lightweight confirm). KpiSubnav.
- **Import** (`import/page.tsx`): after dry-run, show a **preview table of the valid rows** that WILL be
  created (not just errors); after commit, navigate to `/kpis` (or link to it) + show createdCount; loading
  states; clearer header-mapping help. KpiSubnav.
- **Scorecard** (`scorecard/page.tsx`): add an on-target **summary** (e.g. "X of Y on target" overall + per
  quadrant). KpiSubnav.
- **Tree** (`tree/page.tsx`): light visual polish (clearer indentation/connector, level labels) + a link to a
  KPI's Cascade tab to edit. KpiSubnav. (Lowest priority — keep read-only.)
- Commit per sub-page or as a couple of cohesive commits.

## Task E — verify + live + memory
- `pnpm --filter @kpi-nexus/web typecheck|lint|build` clean; web unit tests green (update specs touching the
  KPIs list/templates structure); full API suite green (no backend change, should stay green).
- Run the stack (docker up; rebuild+start API:4000 + web:3000). Browser-verify as `admin@helios.io`:
  every page renders, the **create-from-template** flow (templates → prefilled /kpis/new → create → detail),
  manual create with all fields, edit a KPI, list search/filter, categories icon, archive restore/purge with
  confirm+error, import preview+commit+nav, scorecard summary. 0 unexpected console errors.
- Update memory; final commit.

## Out of scope
- New backend endpoints (the DTO already supports everything; instantiateTemplate stays but is no longer the
  primary path). PER_UNIT manager data-entry UI and a full CSV column-mapper are noted but optional.
