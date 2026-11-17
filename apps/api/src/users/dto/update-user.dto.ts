import { z } from 'zod';

/**
 * PATCH /users/:id — what an administrator may change about another person.
 * `null` clears a manager or a position; leaving a key out leaves it alone.
 */
export const UpdateUserDtoSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    roleId: z.string().min(1).optional(),
    managerId: z.string().min(1).nullable().optional(),
    positionId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine((dto) => Object.keys(dto).length > 0, { message: 'Nothing to change' });

export type UpdateUserDto = z.infer<typeof UpdateUserDtoSchema>;
