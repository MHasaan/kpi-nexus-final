import { z } from 'zod';

/** How many earlier turns of a conversation go to the model with a new question. */
export const MAX_HISTORY_TURNS = 3;

/**
 * One earlier turn, as the asker's own page holds it. It is what the asker
 * already read, sent back so a follow-up ("and last month?") has something to
 * refer to. It is never treated as data: figures still come from the tools,
 * which read only what the asker may see.
 */
const TurnSchema = z
  .object({
    question: z.string().trim().min(1).max(1000),
    answer: z.string().trim().min(1).max(8000),
  })
  .strict();
export type NlqTurn = z.infer<typeof TurnSchema>;

export const AskSchema = z
  .object({
    question: z.string().trim().min(1).max(1000),
    history: z.array(TurnSchema).max(MAX_HISTORY_TURNS).optional(),
  })
  .strict();
