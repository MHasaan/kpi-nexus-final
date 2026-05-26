import { z } from 'zod';

// The 10 supported widget types. Enforced at the service layer; extending
// the list requires a corresponding renderer on the frontend.
export const WidgetTypeEnum = z.enum([
  'kpi_card',
  'line',
  'bar',
  'pie',
  'gauge',
  'number',
  'list',
  'trend',
  'activity',
  'strategy_map',
]);
export type WidgetType = z.infer<typeof WidgetTypeEnum>;

// A widget position on the 12-column grid.
export const WidgetPositionSchema = z
  .object({
    x: z.number().int().min(0).max(11),
    y: z.number().int().min(0),
    w: z.number().int().min(1).max(12),
    h: z.number().int().min(1).max(12),
  })
  .strict();
export type WidgetPosition = z.infer<typeof WidgetPositionSchema>;

export const CreateDashboardDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).optional(),
    isShared: z.boolean().default(false),
    ownerRoleId: z.string().optional(),
    layout: z.record(z.unknown()).optional(),
  })
  .strict();
export type CreateDashboardDto = z.infer<typeof CreateDashboardDtoSchema>;

// Partial of the create shape. `isShared` can be toggled, name renamed,
// description edited. Scope/ownership stays put — change via a new
// dashboard or a dedicated reassign endpoint when needed.
export const UpdateDashboardDtoSchema = CreateDashboardDtoSchema.partial().strict();
export type UpdateDashboardDto = z.infer<typeof UpdateDashboardDtoSchema>;

export const AddWidgetDtoSchema = z
  .object({
    widgetType: WidgetTypeEnum,
    title: z.string().trim().max(120).optional(),
    config: z.record(z.unknown()),
    position: WidgetPositionSchema,
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type AddWidgetDto = z.infer<typeof AddWidgetDtoSchema>;

export const UpdateWidgetDtoSchema = z
  .object({
    widgetType: WidgetTypeEnum.optional(),
    title: z.string().trim().max(120).optional(),
    config: z.record(z.unknown()).optional(),
    position: WidgetPositionSchema.optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type UpdateWidgetDto = z.infer<typeof UpdateWidgetDtoSchema>;

// Fast-path body for drag/resize. Just the geometry.
export const UpdateWidgetPositionDtoSchema = WidgetPositionSchema;
export type UpdateWidgetPositionDto = z.infer<typeof UpdateWidgetPositionDtoSchema>;
