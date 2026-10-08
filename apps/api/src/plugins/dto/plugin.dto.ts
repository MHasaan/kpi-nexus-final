import { z } from 'zod';

export const PluginTypeSchema = z.enum(['WIDGET', 'TEMPLATE', 'FORMULA_FN', 'CONNECTOR']);

export const InstallPluginDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    type: PluginTypeSchema,
    version: z.string().trim().min(1).max(40),
    // http(s) only: javascript:/data: URLs would become XSS once plugins load (BE-023).
    entryUrl: z
      .string()
      .trim()
      .url()
      .max(1000)
      .refine((u) => /^https?:\/\//i.test(u), { message: 'entryUrl must be an http(s) URL' }),
    description: z.string().trim().max(1000).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict();
export type InstallPluginDto = z.infer<typeof InstallPluginDtoSchema>;

export const SetEnabledDtoSchema = z.object({ isEnabled: z.boolean() }).strict();
export type SetEnabledDto = z.infer<typeof SetEnabledDtoSchema>;
