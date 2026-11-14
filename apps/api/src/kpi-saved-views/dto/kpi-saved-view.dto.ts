import { z } from 'zod';

import { partialUpdate } from '../../common/partial-update.js';

/** The KPI list's filters a view stores (mirrors the /kpis toolbar). */
export const KpiViewFiltersSchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    categoryId: z.string().trim().max(64).optional(),
    status: z.enum(['DRAFT', 'PROPOSED', 'APPROVED', 'ACTIVE', 'PAUSED', 'DEPRECATED', 'ARCHIVED']).optional(),
    scope: z.enum(['ORG_WIDE', 'PER_UNIT', 'PER_USER']).optional(),
  })
  .strict();

export const CreateKpiSavedViewDtoSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    filters: KpiViewFiltersSchema,
    isShared: z.boolean().default(false),
  })
  .strict();
export type CreateKpiSavedViewDto = z.infer<typeof CreateKpiSavedViewDtoSchema>;

export const UpdateKpiSavedViewDtoSchema = partialUpdate(CreateKpiSavedViewDtoSchema);
export type UpdateKpiSavedViewDto = z.infer<typeof UpdateKpiSavedViewDtoSchema>;
