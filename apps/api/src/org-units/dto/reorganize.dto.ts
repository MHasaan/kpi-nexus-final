import { z } from 'zod';

/** Body for `POST /org-units/:id/rename`. */
export const RenameOrgUnitDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
  })
  .strict();
export type RenameOrgUnitDto = z.infer<typeof RenameOrgUnitDtoSchema>;

/** Body for `POST /org-units/move-users`. */
export const MoveUsersDtoSchema = z
  .object({
    userIds: z.array(z.string().min(1)).min(1),
    /** Optional source unit — when present, the user's active membership there is ended. */
    fromUnitId: z.string().min(1).optional(),
    toUnitId: z.string().min(1),
  })
  .strict();
export type MoveUsersDto = z.infer<typeof MoveUsersDtoSchema>;

/** Body for `POST /org-units/:id/merge-into`. */
export const MergeUnitsDtoSchema = z
  .object({
    targetId: z.string().min(1),
  })
  .strict();
export type MergeUnitsDto = z.infer<typeof MergeUnitsDtoSchema>;

/** Body for `POST /org-units/:id/split`. */
export const SplitUnitDtoSchema = z
  .object({
    newUnitName: z.string().trim().min(2).max(120),
    memberUserIds: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type SplitUnitDto = z.infer<typeof SplitUnitDtoSchema>;
