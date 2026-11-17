import { z } from 'zod';

/** `POST /users/names` — the ids whose names are wanted. Bounded, so it cannot be used to sweep. */
export const UserNamesDtoSchema = z
  .object({
    ids: z.array(z.string().min(1).max(64)).max(200),
  })
  .strict();
export type UserNamesDto = z.infer<typeof UserNamesDtoSchema>;
