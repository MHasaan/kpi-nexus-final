import { z } from 'zod';

type WithoutDefault<T> = T extends z.ZodDefault<infer Inner> ? Inner : T;

/**
 * `create.partial()` for update DTOs, minus the create defaults. Zod 4 applies
 * a field's `.default()` even inside `.partial()` (Zod 3 left an omitted field
 * undefined), so a PATCH would reset every defaulted field the client didn't
 * send. Uses `.extend()` so the schema keeps its strict/strip setting.
 */
export function partialUpdate<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const stripped: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    stripped[key] = field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : (field as z.ZodType);
  }
  return schema.extend(stripped as unknown as { [K in keyof T]: WithoutDefault<T[K]> }).partial();
}
