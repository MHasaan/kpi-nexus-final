import { z } from 'zod';

import { CreateRoleDtoSchema } from './create-role.dto.js';

export const UpdateRoleDtoSchema = CreateRoleDtoSchema.partial();
export type UpdateRoleDto = z.infer<typeof UpdateRoleDtoSchema>;
