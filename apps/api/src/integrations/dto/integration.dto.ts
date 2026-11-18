import { z } from 'zod';

export const CreateIntegrationDtoSchema = z
  .object({
    /** `slack` or `jira`. Teams, webhooks and API keys are set up on their own pages. */
    provider: z.string().trim().min(1).max(64),
    /** Slack only: the workspace (team) id, e.g. T0ABC123. */
    teamId: z.string().trim().max(40).optional(),
  })
  .strict();
export type CreateIntegrationDto = z.infer<typeof CreateIntegrationDtoSchema>;
