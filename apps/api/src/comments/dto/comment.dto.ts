import { z } from 'zod';

export const CommentEntityTypeSchema = z.enum(['kpi', 'dashboard', 'alert', 'task', 'objective']);

export const CreateCommentDtoSchema = z
  .object({
    entityType: CommentEntityTypeSchema,
    entityId: z.string().trim().min(1),
    parentCommentId: z.string().trim().min(1).optional(),
    body: z.string().trim().min(1).max(10_000),
    mentionedUserIds: z.array(z.string().trim().min(1)).max(50).optional(),
  })
  .strict();
export type CreateCommentDto = z.infer<typeof CreateCommentDtoSchema>;

export const UpdateCommentDtoSchema = z
  .object({
    body: z.string().trim().min(1).max(10_000),
    mentionedUserIds: z.array(z.string().trim().min(1)).max(50).optional(),
  })
  .strict();
export type UpdateCommentDto = z.infer<typeof UpdateCommentDtoSchema>;

export const ListCommentsQuerySchema = z
  .object({
    entityType: CommentEntityTypeSchema,
    entityId: z.string().trim().min(1),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();
export type ListCommentsQuery = z.infer<typeof ListCommentsQuerySchema>;
