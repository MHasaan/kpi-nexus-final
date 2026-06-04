# Granular Access — Phase 7: Page-Access Lists (Layer 5)

> Execute with superpowers:subagent-driven-development. The final access layer: per-role + per-user
> **page allow/deny** lists, resolved into the AccessProfile, shipped via `/auth/me`, enforced in the
> FE nav + a route guard, and editable in the role (6b) + user-override (6a) editors.

**Model:** `pageAccess: { allow?: string[] | null, deny?: string[] }`.
- `allow = null` (default) ⇒ no allow-restriction — every page the capabilities/nav already permit.
- `allow = [hrefs]` ⇒ ONLY those pages (intersected with capability gating).
- `deny = [hrefs]` ⇒ subtract those pages even if otherwise allowed.
- Admin ⇒ no restriction. Override's `pageAccess`, when set, REPLACES the role's (whole-object, like the
  other override blocks). Unset everywhere ⇒ `{ allow: null, deny: [] }` = parity (no change).

**Nature:** page-access is a **navigation/UX control** — it hides routes. The underlying data stays
protected by capabilities (Layer 1) + scope (Layer 2) + the other layers. So enforcement is FE-side
(nav filter + route guard). The resolved `pageAccess` is on the profile for any future BE use; no
broad per-route BE guard is added this phase (most data routes are already capability-gated).

**Verified current state:** `AccessProfile` has no `pageAccess`. `RoleDefinition` + `UserAccessOverride`
have `scopeConfig/dataTypeConfig/dataLimits` but NO `pageAccess` column (schema comment defers it to
Phase 7). `/auth/me` already ships the full `accessProfile` (pageAccess flows automatically once added).
Nav = `NAV_GROUPS` in `apps/web/src/components/app-shell.tsx`, items `{ href, label, icon, permission? }`,
filtered by `visibleNavItems()`. Guards in `apps/web/src/components/auth/require-permission.tsx`;
`useAccess`/`getCachedAccessProfile` in `apps/web/src/lib/access.ts`.

---

## Task 1 — Contract + schema + resolver (backend)

**Files:** `packages/contracts/src/access.ts`; `packages/db/prisma/schema.prisma` +
`packages/db/prisma/migrations/20260605100000_p7_page_access/migration.sql`;
`apps/api/src/rbac/services/access-context.service.ts` + spec; `apps/api/src/roles/dto/update-role.dto.ts`;
`apps/api/src/users/...access-override` DTO/contract.

- [ ] **Contract**: add
  ```ts
  export const PageAccessConfigSchema = z.object({
    allow: z.array(z.string()).nullable().optional(),
    deny: z.array(z.string()).optional(),
  });
  export type PageAccessConfig = z.infer<typeof PageAccessConfigSchema>;

  export const PageAccessSchema = z.object({ allow: z.array(z.string()).nullable(), deny: z.array(z.string()) });
  export type PageAccess = z.infer<typeof PageAccessSchema>;
  ```
  Add `pageAccess: PageAccessSchema` to `AccessProfileSchema`. Add `pageAccess: PageAccessConfigSchema.optional()`
  to `UpdateRoleDtoSchema`'s extension and to the `UserAccessOverrideSchema`. (Build contracts.)
- [ ] **Schema**: add `pageAccess Json?` to `model RoleDefinition` and `model UserAccessOverride` (remove the
  `// pageAccess deferred to Phase 7` comment). Hand-write the migration (additive; both columns nullable):
  ```sql
  ALTER TABLE "RoleDefinition" ADD COLUMN IF NOT EXISTS "pageAccess" JSONB;
  ALTER TABLE "UserAccessOverride" ADD COLUMN IF NOT EXISTS "pageAccess" JSONB;
  ```
  Apply per the project flow (kill API first — Windows DLL lock): `prisma db execute --file ... --schema ...`
  → `prisma migrate resolve --applied 20260605100000_p7_page_access` → `prisma generate`. Typecheck.
- [ ] **Resolver** (`access-context.service.ts`): add `pageAccess` to the `select` in `loadRoleConfig` +
  `loadUserOverride`, parse with `PageAccessConfigSchema` (safeParse ⇒ `{}` on failure). In
  `resolveForCurrentPrincipal`, compute:
  ```ts
  const rawPage = isAdmin ? null : (override?.pageAccess ?? roleConfig.pageAccess ?? null);
  const pageAccess = { allow: rawPage?.allow ?? null, deny: rawPage?.deny ?? [] };
  ```
  add `pageAccess` to the returned profile. Admin ⇒ `{ allow: null, deny: [] }`.
- [ ] **DTOs**: `UpdateRoleDto` + the access-override DTO accept `pageAccess`; `roles.service.update` +
  the override upsert persist it (Json column). `PublicRole` + `PublicAccessOverride` echo it.
- [ ] Tests (access-context spec, mirroring its FakePrisma/run harness): role pageAccess resolves; override
  pageAccess replaces role's; admin ⇒ default; unset ⇒ `{allow:null,deny:[]}`. Extend the role/override
  fakes' selects to carry `pageAccess`. Fix any AccessProfile fixtures missing the new field (search for
  full-profile literals — at least `auth.controller.spec`, `kpi-visibility.spec`, the FE editor specs).
- [ ] Verify: `pnpm --filter @kpi-nexus/api exec vitest run src/rbac src/roles` + typecheck. Commit
  `feat(access): Layer-5 pageAccess — contract + schema + resolver (Phase 7)`.

## Task 2 — FE nav filter + route guard

**Files:** `apps/web/src/lib/access.ts` (helpers); `apps/web/src/components/app-shell.tsx` (nav filter);
`apps/web/src/components/auth/require-permission.tsx` (or a new `require-page-access.tsx`).

- [ ] **Helpers** (`lib/access.ts`): add a pure `isPageAllowed(pageAccess, href): boolean` =
  `!deny.includes(href) && (allow == null || allow.includes(href))`, plus a `useAccess()`-style reader of the
  cached profile's `pageAccess` (mirror `usePermissions` SSR-safety — read in `useEffect`, not a sync
  initializer, to avoid the documented hydration bug). Add a small unit test for `isPageAllowed`.
- [ ] **Nav**: in `visibleNavItems()`/`filterNav()`, after the capability check, also require
  `isPageAllowed(pageAccess, item.href)`. Thread the resolved `pageAccess` from the cached profile (default
  `{allow:null,deny:[]}` when absent ⇒ unchanged behaviour). Empty groups still drop.
- [ ] **Route guard**: a `<RequirePageAccess href={...}>` (or extend `RequirePermission`) that redirects to
  `/unauthorized` when `!isPageAllowed`. Keep it ready-aware (render nothing until the profile is loaded).
  Apply it where it adds value (it can wrap `AppShell` children using `usePathname()` to gate the current
  route generically). Add it to `AppShell` so any denied route redirects — but ONLY deny routes that are in
  the page-access universe (don't accidentally lock the user out of `/unauthorized`, `/login`, `/profile`).
- [ ] Verify typecheck + lint + build. Commit `feat(web): enforce Layer-5 page-access in nav + route guard (Phase 7)`.

## Task 3 — FE editor blocks (role + user-override)

**Files:** `apps/web/src/lib/api-client.ts` (extend `RoleSummary`/override types + `updateRole`/
`upsertAccessOverride` payloads with `pageAccess`); a shared `PAGE_ROUTES` list; the role editor
(`app/roles/page.tsx`) + the user override editor (`app/settings/access/page.tsx`).

- [ ] Define a curated `PAGE_ROUTES: { href: string; label: string; group: string }[]` (the routable nav
  pages — derive from `NAV_GROUPS` or hand-list ~20). Export from a shared module (e.g. `lib/page-routes.ts`).
- [ ] Add a **"Page access"** block to BOTH editors (mirror the existing config blocks): per route, a
  tri-state `Segmented` (`Default` / `Allow-only` / `Deny`) OR two checkbox columns (Allow / Deny). Simpler:
  a per-route `Segmented` with values `default | allow | deny`. Building the payload:
  - any route set to `deny` ⇒ add to `deny[]`.
  - if ANY route is set to `allow` ⇒ `allow = [those hrefs]` (allow-list mode); if none ⇒ `allow = null`.
  - Pre-populate from the role's/override's stored `pageAccess`.
  - Persist via the existing Save (now sending `pageAccess`).
- [ ] Extend `RoleSummary` + `PublicAccessOverride` FE types with `pageAccess`; `updateRole` +
  `upsertAccessOverride` payloads carry it.
- [ ] Verify typecheck + lint + build (+ keep web unit specs green; update any that construct a full role/
  override/profile object). Commit `feat(web): page-access editor block in role + user-override editors (Phase 7)`.

## Task 4 — verify (live) + memory

- [ ] Full API suite + web build green. LIVE browser smoke (admin sara): set a non-admin role's page-access
  to `deny: ['/reports']` (or allow-only a subset) → log in as a user on that role → confirm `/reports` is
  gone from the nav and navigating to it redirects to `/unauthorized`; clear it ⇒ restored. 0 console errors.
- [ ] Update memory; commit `test(access): Phase 7 full-suite + live verification; memory`.

## Out of scope
- Broad per-route BE page-access enforcement (data already capability+scope gated; profile carries
  pageAccess for any future endpoint that wants it).
- Sub-route deny below a capability handled purely here (no new capability keys).
