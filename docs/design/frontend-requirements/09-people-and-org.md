# 09 — People & Org (Users, Roles, Positions, Org Units, Team, My KPIs, Profile)

Identity, RBAC, org structure, and the per-user KPI surfaces. RBAC is the trust backbone —
the UI must gate precisely (18 canonical permissions; admin bypass).

---

## `/users` — User directory + invite

- **Access**: `USERS_VIEW`; invite/manage `USERS_MANAGE`.
- **Purpose**: list org users; invite new ones; manage status.
- **Layout**: heading (`users-heading`); an **invite** section (`invite-section`, gated `USERS_MANAGE`): email (`invite-email-input`), name (`invite-name-input`), **role** (`invite-role-select`), submit (`invite-submit-button`) → on success show the **accept URL** (`invite-accept-url`) to share (and `invite-success`); a **list** (`users-list-section` → `users-list`) — each user: name, email, **status badge** (`user-status-badge`: INVITED/ACTIVE/SUSPENDED/ARCHIVED), role, manager; row → `/users/[id]`. Nav links `nav-users`, `nav-roles`, `nav-positions`.
- **Data/API**: `GET /users`, `POST /users` (invite → returns invite token/URL), status transitions (suspend/archive/purge).
- **States**: `users-load-error`, `invite-error`.
- **Design notes**: status as labelled chip; archived/suspended visually de-emphasized; a filter for "Archived" (restore/purge actions) per the soft-delete pattern.

## `/users/[id]` — User profile (admin view)

- **Access**: `USERS_VIEW`.
- **Purpose**: a user's detail incl. their **PER_USER KPI assignments** + trends.
- **Layout**: user header (name/email/role/manager/status); a **KPI assignments** list (`user-kpis-list`) — each assigned PER_USER KPI with current value + trend; (admin can view their recorded values per the visibility model).
- **States**: `user-kpis-empty`.
- **Design notes**: respects the per-user isolation invariant (this is the admin/manager view of someone's personal KPIs); show last activity + sessions (future).

## `/roles` — Roles & RBAC

- **Access**: `ROLES_MANAGE` to mutate; `USERS_VIEW` to read.
- **Purpose**: manage roles, their permission sets, admin flag, hierarchy/inheritance.
- **Layout**: heading (`roles-heading`); a roles list/table (level, isAdmin, member count, color); a **create role** form (name, description, level, color, isAdmin, **permission matrix** of the 18 permissions); role detail shows direct vs inherited permissions and parent roles. Nav `nav-roles`, `nav-users`, `nav-positions`.
- **Data/API**: `/roles` CRUD; permission changes may be **approval-gated** (ROLE_PERMISSIONS workflow → 202). Guardrail: can't delete the last admin role / a role with members.
- **Design notes**: the **PermissionMatrix** is the key component — 18 permissions grouped (KPIs/Dashboards/Users&RBAC/Org/Alerts/Insights/Admin), with inherited ones shown read-only/derived. Resolver order matters (isAdmin → resource → role → inherited → delegation → owner) — surface "effective permissions".

## `/positions` — Positions

- **Access**: `POSITIONS_MANAGE`.
- **Purpose**: manage job positions (name, track, level, pay grade) used in org structure.
- **Layout**: heading (`positions-heading`); **create** (`create-position-section`): name (`position-name-input`), **track** (`position-track-select`: EXECUTIVE/MANAGER/IC/…), level (`position-level-input`), pay grade (`position-paygrade-input`), submit (`position-submit-button`); list (`positions-list-section` → `positions-list`). Nav `nav-positions`.
- **States**: `positions-load-error`, `position-error`.
- **Design notes**: group by track; level as an ordering hint.

## `/org-units` — Org structure

- **Access**: `GROUPS_VIEW` read; `GROUPS_MANAGE` mutate.
- **Purpose**: build the org-unit hierarchy and manage members.
- **Layout**: heading (`org-units-heading`); **create unit** (`create-unit-section`): name (`unit-name-input`), description (`unit-description-input`), **parent** (`unit-parent-select`), submit (`unit-submit-button`); a **units list/tree** (`units-list-section` → `units-list`); selecting a unit → **members** management: **add member** (`add-member-select` user, `add-member-role` role, `add-member-button`). Nav `nav-org-units`.
- **Data/API**: `/org-units` CRUD + members; supports the PER_UNIT KPI visibility.
- **States**: `units-empty`, `org-units-load-error`, `unit-error`, `members-error`, `add-member-error`.
- **Design notes**: tree view with parent→child; member roles (MANAGER/LEAD/member) drive KPI visibility; a future org-chart/reorganize drag view.

## `/team` — Manager team view (PER_USER)

- **Access**: authenticated (managers with direct reports).
- **Purpose**: see direct reports' personally-assigned KPIs side-by-side.
- **Layout**: a **team list** (`team-list`) — each member (linked to `/users/[id]`) with their PER_USER KPIs (name, current/target, status).
- **States**: `team-empty` ("No direct reports").
- **Design notes**: compact per-member cards; quick scan of who's on/off track (icon+label).

## `/my-kpis` — My KPIs (PER_USER self-service)

- **Access**: authenticated.
- **Purpose**: the viewer's own PER_USER KPI assignments with inline value entry.
- **Layout**: a **list** (`my-kpis-list`) — each assignment: KPI name, current value, target, status, and an **inline record** control that posts to `POST /user-kpis/my-kpis/:assignmentId/data` (scope-correct endpoint).
- **States**: `my-kpis-empty`.
- **Design notes**: fast personal data-entry; optimistic; shows the period due next; this is the individual's home panel too.

## `/profile` — My profile & preferences

- **Access**: authenticated.
- **Purpose**: account info, **language** (i18n), and **security (MFA)**.
- **Layout**: heading (`profile-heading`), nav `nav-profile`.
  - **Language** section (`language-section`, built): locale select (`locale-select`) — switching flips **RTL** for ur-PK and persists; heading uses translated string (`language-heading`).
  - **Account** section: name, email, user id, status.
  - **Security** section (`security-section`): MFA — status (`mfa-status`), **Enable MFA** (`enable-mfa-button`) → enrollment panel (`mfa-enrollment-panel`) with secret (`mfa-secret`), otpauth URL (`mfa-otpauth-url`) for a QR, recovery codes (`mfa-recovery-codes`/`mfa-recovery-code`), confirm code (`mfa-confirm-code`) + confirm (`mfa-confirm-button`) / cancel (`mfa-cancel-button`); **Disable MFA** (`mfa-disable-button`) → form (`mfa-disable-form`) with code (`mfa-disable-code`).
- **Data/API**: `GET /auth/me`, MFA enroll/confirm/disable, profile update, `User.language`.
- **States**: `mfa-enroll-error`, `mfa-confirm-error`, `mfa-disable-error`.
- **Design notes**: render the otpauth URL as a **QR code** (designer add) with the secret as fallback; recovery codes in a copyable mono block with a "save these" warning; locale picker shows native language names. Theme toggle can live here too.
