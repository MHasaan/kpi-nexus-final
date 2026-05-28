import { z } from 'zod';

export const ReportFormatSchema = z.enum(['CSV', 'EXCEL', 'PDF']);
export type ReportFormat = z.infer<typeof ReportFormatSchema>;

export const GenerateReportDtoSchema = z
  .object({
    format: ReportFormatSchema,
    dashboardId: z.string().optional(),
    kpiIds: z.array(z.string()).optional(),
    from: z
      .string()
      .datetime()
      .transform((s) => new Date(s))
      .optional(),
    to: z
      .string()
      .datetime()
      .transform((s) => new Date(s))
      .optional(),
  })
  .strict();

export type GenerateReportDto = z.infer<typeof GenerateReportDtoSchema>;

export const BoardPackQuerySchema = z.object({
  sinceDays: z
    .string()
    .default('30')
    .transform((s) => parseInt(s, 10))
    .pipe(z.number().int().min(1).max(365)),
});
export type BoardPackQuery = z.infer<typeof BoardPackQuerySchema>;

// ── Scheduled Reports ─────────────────────────────────────────────────────────

export const CreateScheduledReportDtoSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1024).optional(),
  dashboardId: z.string().optional(),
  kpiIds: z.array(z.string()).optional(),
  cron: z.string().min(9).max(100), // standard 5-part cron
  format: ReportFormatSchema,
  recipients: z.array(z.string().email()).min(1).max(50),
});

export type CreateScheduledReportDto = z.infer<typeof CreateScheduledReportDtoSchema>;

export const UpdateScheduledReportDtoSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1024).optional(),
  dashboardId: z.string().nullable().optional(),
  kpiIds: z.array(z.string()).optional(),
  cron: z.string().min(9).max(100).optional(),
  format: ReportFormatSchema.optional(),
  recipients: z.array(z.string().email()).min(1).max(50).optional(),
  isActive: z.boolean().optional(),
});

export type UpdateScheduledReportDto = z.infer<typeof UpdateScheduledReportDtoSchema>;
