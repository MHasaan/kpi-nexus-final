import { SetMetadata } from '@nestjs/common';

/**
 * Resolver step 6 — owner override (spec §5.4).
 *
 * Lets an endpoint bypass its `@RequirePermissions(...)` check when the
 * requesting principal IS the owner of the resource being accessed (e.g.
 * `GET /users/:id` should be reachable by the user themselves without
 * USERS_VIEW, even though it's normally an admin-only endpoint).
 *
 * Two shapes:
 *
 *   @OwnerOverride('id')
 *     – the route param IS the owning user id (the canonical case for
 *       self-access to a User record).
 *
 *   @OwnerOverride({
 *     paramKey: 'id',
 *     resolveOwnerId: (id) => prisma.dashboard.findUnique({ ... }),
 *   })
 *     – the route param is a resource id, and `resolveOwnerId` looks up
 *       the owning user id (used later by Dashboard/KPI ownership in P2+).
 *
 * The override is additive — if the user already passes the permission
 * check, the override is never consulted.
 */

export const OWNER_OVERRIDE_KEY = 'rbac:owner_override';

export interface OwnerOverrideConfig {
  /** Name of the route param that carries the resource id. */
  paramKey: string;
  /**
   * Optional async lookup that returns the owning user id for `resourceId`.
   * When omitted the resource id IS treated as the owner id (the User
   * self-access case).
   */
  resolveOwnerId?: (resourceId: string) => Promise<string | null>;
}

export const OwnerOverride = (
  config: OwnerOverrideConfig | string,
): MethodDecorator & ClassDecorator => {
  const normalized: OwnerOverrideConfig =
    typeof config === 'string' ? { paramKey: config } : config;
  return SetMetadata(OWNER_OVERRIDE_KEY, normalized);
};
