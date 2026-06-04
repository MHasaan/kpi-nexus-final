import { SetMetadata } from '@nestjs/common';
import type { ResourceAction } from '@kpi-nexus/contracts';

/** Resolution step 6 — additive per-entity ResourcePermission grant (spec §5.4/§8).
 *  When present, a principal who lacks the route's @RequirePermissions capability is
 *  STILL allowed if they (or their role) hold a non-expired ResourcePermission grant
 *  for (action, resourceType, <route param>). Additive — a capability-holder passes
 *  regardless; admins bypass entirely. */
export const REQUIRE_RESOURCE_ACCESS_KEY = 'rbac:require_resource_access';

export interface ResourceAccessConfig {
  resourceType: string;
  paramKey: string;
  action: ResourceAction;
}

export const RequireResourceAccess = (
  resourceType: string,
  paramKey: string,
  action: ResourceAction,
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_RESOURCE_ACCESS_KEY, {
    resourceType,
    paramKey,
    action,
  } satisfies ResourceAccessConfig);
