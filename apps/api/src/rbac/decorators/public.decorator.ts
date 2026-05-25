import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key read by JwtAuthGuard + PermissionsGuard. Routes annotated
 * with `@Public()` skip auth entirely — use for login/register/etc.
 */
export const IS_PUBLIC_KEY = 'rbac:is_public';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
