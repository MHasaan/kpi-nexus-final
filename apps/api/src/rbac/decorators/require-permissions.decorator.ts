import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@kpi-nexus/contracts';

/**
 * Metadata keys consumed by `PermissionsGuard`. A handler may carry either
 * `RequirePermissions` (AND semantics) or `RequireAnyPermission` (OR
 * semantics); the guard short-circuits to allow if `isAdmin` is set on the
 * resolved principal.
 */
export const REQUIRE_PERMISSIONS_KEY = 'rbac:require_permissions';
export const REQUIRE_ANY_PERMISSION_KEY = 'rbac:require_any_permission';

/**
 * The handler/class is callable only when the principal holds ALL of the
 * listed permissions (or is admin).
 */
export const RequirePermissions = (
  ...permissions: PermissionKey[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);

/**
 * The handler/class is callable when the principal holds AT LEAST ONE of the
 * listed permissions (or is admin).
 */
export const RequireAnyPermission = (
  ...permissions: PermissionKey[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_ANY_PERMISSION_KEY, permissions);
