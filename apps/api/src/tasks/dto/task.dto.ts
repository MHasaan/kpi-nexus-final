import { z } from 'zod';

export const TaskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']);
export const TaskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export const CreateTaskDtoSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    // Optional fields accept null so the client can clear them (or send "no value").
    description: z.string().trim().max(5000).nullable().optional(),
    kpiId: z.string().trim().min(1).nullable().optional(),
    alertId: z.string().trim().min(1).nullable().optional(),
    assigneeUserId: z.string().trim().min(1).nullable().optional(),
    dueAt: z.coerce.date().nullable().optional(),
    status: TaskStatusSchema.optional(),
    priority: TaskPrioritySchema.optional(),
    externalRef: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export type CreateTaskDto = z.infer<typeof CreateTaskDtoSchema>;

export const UpdateTaskDtoSchema = CreateTaskDtoSchema.partial().strict();
export type UpdateTaskDto = z.infer<typeof UpdateTaskDtoSchema>;

export const ListTasksQuerySchema = z
  .object({
    status: TaskStatusSchema.optional(),
    priority: TaskPrioritySchema.optional(),
    assigneeUserId: z.string().trim().min(1).optional(),
    kpiId: z.string().trim().min(1).optional(),
    dueBefore: z.coerce.date().optional(),
    dueAfter: z.coerce.date().optional(),
  })
  .strict();
export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;
