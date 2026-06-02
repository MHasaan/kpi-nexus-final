# Granular Access — Phase 6a: Access Center (preview + per-user override editor)

> REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** The admin **Access Center** (spec §9) — first slice: pick a user → see their **resolved access**
("what can this user see?") + a plain-language summary, and **edit their per-user override** (Phase 5) →
re-preview. Makes Phases 0–5 usable in-app. Role scope/type/limits editor + resource/delegation/hierarchy
UIs → Phase 6b.

**Architecture:** One small backend endpoint to resolve a *target* user's `AccessProfile`; the rest is a
new FE page on the established design system. Gated by `USERS_MANAGE` (matches the Phase-5 override endpoints).

**Spec:** `2026-06-01-granular-access-control-design.md` §9, §10 (Phase 6).

## Task 1 — backend: GET /users/:id/access-profile
- [x] `users.service.getAccessProfile(userId)`: org-scoped user lookup (roleId) → `RequestContextStore.run({ userId, organizationId, roleId, principalType:'user' }, () => this.accessContext.resolveForCurrentPrincipal())`. 404 if not in tenant.
- [x] `users.controller`: `@Get(':id/access-profile') @RequirePermissions(USERS_MANAGE)`.
- [x] Test (returns the target's profile; foreign user ⇒ 404). **Commit**.

## Task 2 — FE clients + labels
- [x] `api-client.ts`: `getUser`, `getUserAccessProfile`, `getAccessOverride`, `upsertAccessOverride`, `deleteAccessOverride` (+ `PublicAccessOverride` type, re-export access contracts).
- [x] `lib/permissions.ts`: `PERMISSION_LABELS` (25 keys → human labels) + `PERMISSION_GROUPS` (domain → keys) for the capability matrix. **Commit**.

## Task 3 — FE Access Center page + nav
- [x] `app/settings/access/page.tsx`: AppShell + `RequirePermission USERS_MANAGE` + PageHeader; two-panel
  (`lg:grid-cols-[280px_1fr]`): left = searchable user list; right = (a) **Resolved access** (isAdmin,
  capabilities by domain, scope per domain, data limits, category filter) + plain-language summary;
  (b) **Override editor** — per-capability tri-state (Inherit/Grant/Revoke), scope-per-domain Selects
  (Inherit + 4 scopes), data-limit number inputs, category multi-select; Save → PUT + re-preview, Clear →
  DELETE + re-preview. Controlled state, inline error/success (mirror roles/organization pages).
- [x] Add `/settings/access` to the settings index + app-shell nav (gated `USERS_MANAGE`). **Commit**.

## Task 4 — verify
- [ ] Web typecheck + `next build`; rebuild+restart web+API. Browser as admin: pick a user, see resolved
  access, set an override (revoke a cap + narrow scope), Save, confirm preview updates; Clear restores.
  0 console errors. **Commit**.

## Deferred → Phase 6b
- Role scope/type/limits editor on /roles. Resource-grant + delegation + role-hierarchy UIs.
