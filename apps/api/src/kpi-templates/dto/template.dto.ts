import { z } from 'zod';

import {
  KpiAggregationEnum,
  KpiDirectionEnum,
  KpiFrequencyEnum,
  KpiTypeEnum,
} from '../../kpis/dto/create-kpi.dto.js';

/** Query params for the gallery list endpoint. */
export const ListTemplatesQuerySchema = z
  .object({
    industry: z.string().trim().min(1).optional(),
    function: z.string().trim().min(1).optional(),
    scorecardQuadrant: z.string().trim().min(1).optional(),
    search: z.string().trim().min(1).optional(),
  })
  .strict();
export type ListTemplatesQuery = z.infer<typeof ListTemplatesQuerySchema>;

/** Override fields when instantiating a template into a KPI. */
export const InstantiateTemplateDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    targetValue: z.number().finite().optional(),
    ownerUserId: z.string().trim().min(1).optional(),
  })
  .strict();
export type InstantiateTemplateDto = z.infer<typeof InstantiateTemplateDtoSchema>;

/** Create an org-private template. */
export const CreateTemplateDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).optional(),
    type: KpiTypeEnum,
    direction: KpiDirectionEnum,
    frequency: KpiFrequencyEnum,
    aggregationMethod: KpiAggregationEnum.optional(),
    scorecardQuadrant: z.string().trim().min(1).max(40).optional(),
    function: z.string().trim().min(1).max(40).optional(),
    industry: z.string().trim().min(1).max(60).optional(),
    unit: z.string().trim().max(40).optional(),
    targetSummary: z.string().trim().max(200).optional(),
    tags: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();
export type CreateTemplateDto = z.infer<typeof CreateTemplateDtoSchema>;
