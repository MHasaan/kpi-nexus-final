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
