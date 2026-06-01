# 02 — App Shell, Marketing Home & Dashboard Home

Covers the public marketing landing, the authenticated role-adaptive home, and the
cross-app chrome (sidebar, header, ⌘K search, alerts/mentions bells, setup checklist,
first-login tour).

---

## `/` — Marketing / landing (public)

- **Access**: public, no app shell.
- **Purpose**: brief product splash + entry to sign-in / create-org.
- **Layout**: centered hero — wordmark "KPI Nexus", tagline ("Measure what matters."), two CTAs: **Sign in** (`/login`) and **Create organization** (`/signup`, testid `home-guided-setup`).
- **States**: static; no data.
- **Design notes**: this is a placeholder; the design pass can make it a real landing (value props, screenshot, social proof) or keep it minimal. Authenticated users may be redirected straight to `/dashboard`.

---

## `/dashboard` — Role-adaptive home (app shell)

- **Access**: authenticated. The primary landing after login.
- **Purpose**: a personalized home that adapts to the viewer's role (spec §12.7):
  - **Admin** → org health snapshot + **setup checklist** + recent **activity**.
  - **Manager** → team performance + direct reports' KPIs.
  - **Individual** → **My KPIs** + assigned **Tasks** + unread **Mentions**.
- **Layout**:
  - **Header band** (becomes the AppHeader): wordmark; primary nav links (`nav-dashboard`, `nav-kpis`, `nav-dashboards`, `nav-alerts`, plus more); right side: **global ⌘K search** (built), **alerts bell** (built), user email (`dashboard-user-email`), **Sign out** (`dashboard-signout-button`).
  - **Heading** (`dashboard-heading`).
  - **Summary grid** (`dashboard-summary-grid`): stat tiles / cards (org-level counts, KPI health, recent movement). The design pass should make this role-aware (see above) — today it's a generic summary.
  - **SetupChecklistCard** (component, see below) shown to fresh orgs.
  - **OnboardingTour** modal on first login (see below).
- **Data/API**: `GET /auth/me` (user), org summary endpoints, `GET /setup-checklist`, plus role-specific data (`/user-kpis/my-kpis`, `/tasks/my-tasks`, `/me/mentions/unread-count`).
- **States**: `dashboard-error` banner; `dashboard-empty` when there's nothing yet (point to onboarding); skeleton tiles while loading.
- **`data-testid`s**: `dashboard-heading`, `dashboard-summary-grid`, `dashboard-user-email`, `dashboard-signout-button`, `dashboard-empty`, `dashboard-error`, `nav-dashboard`, `nav-kpis`, `nav-dashboards`, `nav-alerts`.
- **Design notes**: the most-visited page — make it scannable in <5s. Stat tiles with tabular numerals + sparklines + delta arrows (icon + sign, never color-only). Role detection drives which panels render.

---

## Cross-app chrome (build once, used everywhere)

### AppSidebar (new in design pass)
Permission-filtered primary nav (256px / 64px collapsed; mobile sheet). Groups: **Home**,
**KPIs**, **Dashboards**, **Alerts**, **AI** (Insights, Recommendations, Ask), **OKRs**, **Tasks**,
**Approvals**, **Reports**, **People & Org** (Users, Roles, Positions, Org units, Team), **Integrations**
(Integrations, Connectors, Plugins), **Activity**, **Settings**. Hide any item the user lacks permission
for. Includes org switcher, platform-admin **impersonation banner** (persistent, when impersonating),
and the user menu (Profile, theme toggle, Sign out).

### AppHeader
Page title + breadcrumb, the **⌘K search trigger**, **alerts bell**, **mentions bell**, theme toggle.

### Global search — ⌘K command palette (`components/global-search.tsx`, built)
- **Trigger**: a header button (`global-search-trigger`) showing the placeholder + a `⌘K` kbd hint; also opens on ⌘K/Ctrl-K; ESC closes.
- **Modal** (`global-search-modal`): search input (`global-search-input`), debounced 300ms; **grouped results** (`global-search-results`) under headers KPIs / Dashboards / People / Units; each result (`search-result-<id>`) links to the entity; empty query shows nothing; no matches shows `global-search-empty`.
- **Data/API**: `GET /search?q=` → scored, grouped results.
- **Design notes**: this is the keyboard-first centerpiece. Add arrow-key navigation + Enter to open, recent searches in localStorage, and result-type icons.

### AlertsBell (`components/alerts-bell.tsx`, built)
Header bell with an unread count badge; opens a popover of recent open alerts; links to `/alerts`.
Data: alerts list + unread count.

### Mentions (header bell → `/me/mentions`)
Unread mention count badge (`GET /me/mentions/unread-count`); see 08 for the inbox page.

### SetupChecklistCard (`components/setup-checklist-card.tsx`, built)
- On `/dashboard`. Shows progress (X of 14 complete) + the pending starter tasks (invite team, create first KPI, connect Slack, enable MFA, etc.).
- Data: `GET /setup-checklist`; actions `POST /setup-checklist/:key/{complete,dismiss,reset}`.
- `data-testid`: `setup-checklist-card`.
- **Design notes**: dismissible, celebratory at 100%; each item deep-links to where the task is done.

### OnboardingTour (`components/onboarding-tour.tsx`, built)
- 5-slide first-login modal, gated by localStorage `kpi-nexus.tour-completed`; mounted on `/dashboard`.
- **Design notes**: skippable; dots + next/back; the design pass can upgrade to spotlight/coachmarks on real UI elements.
