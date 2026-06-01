# 01 — Auth & Onboarding

Pages here render **without the app shell** (centered, focused, marketing-adjacent).
Tokens are seeded to `localStorage` on success (`kpi-nexus.access-token` / `kpi-nexus.refresh-token`),
then the user lands on `/dashboard`.

---

## `/login` — Sign in

- **Access**: public.
- **Purpose**: authenticate an existing user into their org.
- **Layout**: centered card on `surface-bg`; product wordmark; heading "Sign in"; form: **Email**, **Password**, optional **Organization** (only needed when the email belongs to multiple orgs — otherwise hidden/auto-resolved); primary "Sign in" button; secondary links to **Forgot password** and **Create organization** (`/register` or `/signup`).
- **Data/API**: `POST /auth/login { email, password, organizationId? }` → tokens. On `MFA_REQUIRED` response, show the **MFA step** (6-digit code input + "Verify"); on success store tokens.
- **States**: inline field validation (email format, required); error banner for bad credentials / locked account; button spinner while submitting; on success redirect `/dashboard`.
- **Interactions**: Enter submits; password reveal toggle; remember-me optional.
- **A11y**: labelled inputs, `autocomplete="email"`/`"current-password"`, error text tied to fields via `aria-describedby`.
- **Design notes**: calm, single-column, generous whitespace; the MFA step replaces the password step inline (no full navigation).

## `/register` — Create organization (full signup)

- **Access**: public.
- **Purpose**: create a new tenant + its first admin in one form (the non-wizard path).
- **Layout**: centered card; fields: **Organization name**, **slug** (auto-suggested from name, editable, uniqueness-checked), **Admin full name**, **Admin email**, **Admin password** (strength meter). Primary "Create organization".
- **Data/API**: `POST /auth/register { orgName, slug, adminEmail, adminPassword, adminFullName }` → tokens (201). Slug collision → inline error on the slug field.
- **States**: per-field validation; submit disabled until valid; error banner; on success → `/dashboard`.
- **Design notes**: keep it to one screen; this is the "I know what I want" path. The richer guided path is `/signup` (below).

## `/(auth)/accept-invitation` — Accept an invite

- **Access**: public; requires `?token=` in the URL.
- **Purpose**: an invited user sets their password and is signed in.
- **Layout**: centered card; heading "Accept your invitation"; shows the invitee email (read-only); fields **Password** + **Confirm password**; "Accept & continue".
- **Data/API**: `POST /auth/accept-invitation { token, password }` → tokens (200) → `/dashboard`.
- **States**:
  - Missing `token` → friendly "invitation link is missing" message (no form).
  - Password mismatch → inline error, **no API call**.
  - Expired/invalid token → error banner.
- **`data-testid`s**: `invite-password`, `invite-confirm-password`, `invite-submit`, `invite-error`.
- **Design notes**: reassuring tone; show which org they're joining if available.

---

## `/signup` — Guided entry splash (onboarding 2.0, P6)

- **Access**: public. Begins the onboarding wizard; **no app shell, no bearer** — uses a draft token.
- **Purpose**: let a new admin pick how to set up their org: **Quick**, **Full (AI co-pilot)**, or **start from a Template**. Also resumes an in-progress draft.
- **Layout**:
  - Top: email + org-name inputs that seed the draft (`signup-email`, `signup-org`).
  - Three large choice cards:
    - **Quick** (`entry-quick`) — minimal wizard.
    - **Full** (`entry-full`) — wizard with the AI co-pilot.
    - **Template** (`entry-template`) — opens a **template gallery** (`template-gallery`) of built-in org templates (e.g., "SaaS Startup (Rich)"); each card has a "Use template" action (`use-template-<slug>`).
  - **Resume banner** (`resume-banner` + `resume-button`) appears when a cached draft exists in localStorage — one click resumes the wizard.
- **Data/API**: `POST /onboarding/start` → `{ sessionId, draftToken }` (cached locally via `lib/onboarding-client`); `GET /org-templates`, `GET /org-templates/:slug`; choosing a template applies it to the draft.
- **States**: error banner (`signup-error`); template gallery loading skeleton.
- **Design notes**: aspirational first impression; the three paths must be visually distinct (effort/speed tradeoff). Template cards should preview depth (counts of roles/units/KPIs).

## `/signup/wizard` — Setup wizard (P6)

- **Access**: public; requires a cached draft (else redirect to `/signup`). Uses `X-Draft-Token`, **not** a bearer.
- **Purpose**: build the org (roles, positions, org units, KPI categories, KPIs) via template + AI co-pilot, then materialize it and sign the admin in.
- **Layout** (single scrollable wizard; the design pass may convert to a 3-pane shell — step rail | content | AI rail):
  - **Header**: wordmark + "Setup wizard" + a **sync status** chip (`sync-status`: "Saving…" / "Saved ✓") reflecting the 600ms-debounced autosave.
  - **Organization** section: org name input (`wizard-org-name`) with debounced PUT sync.
  - **AI co-pilot** section: prompt input (`ai-prompt`) + "Generate" (`ai-generate`); on response a **diff preview** (`ai-diff`) summarizing proposed roles/units/KPIs with an "Apply all" (`ai-apply`).
  - **Review** section: count tiles (`wizard-counts` with `count-roles`, `count-positions`, `count-orgUnits`, `count-kpiCategories`, `count-kpis`) showing the draft's depth.
  - **Finish** section: admin account fields — full name (`admin-name`), email (`admin-email`), password (`admin-password`), org slug (`org-slug`) — and "Finish setup" (`wizard-complete`).
- **Data/API**: `GET/PUT /onboarding/:id` (draft), `POST /onboarding/ai/{generate,apply}`, `POST /onboarding/:id/complete` → JWT pair → `setTokens` → `/dashboard`. All with `X-Draft-Token`.
- **States**: `wizard-error` banner; generate button shows busy; diff preview only after a generation; complete shows "Finishing…".
- **Interactions**: org-name edits autosave (debounced); AI generate → review diff → apply mutates the draft; draft **survives reload** (resume from `/signup`).
- **Design notes**: this is the product's "wow" moment — the AI rail should feel like a collaborator (streaming feel, clear proposed-vs-applied states). The deferred "full 5-step wizard with advanced editors" (drag-drop org tree, permission matrix, KPI catalog browser, CSV team import) is a future enhancement; the current streamlined flow already reproduces full template depth.
- **Exit criterion reference**: applying the rich template must show **10 roles / 14 positions / 11 units / 20 KPIs / 5 categories** in the review tiles.
