import { z } from 'zod';

export const WorkflowTriggerSchema = z.enum(['kpi_changed', 'schedule', 'alert', 'manual']);

export const RuleOperatorSchema = z.enum(['>', '<', '>=', '<=', '==', '!=']);

/**
 * The condition a workflow fires on — the shapes `rule-evaluator.ts` reads.
 * It used to be "any JSON object": a rule with the wrong keys was stored and
 * then never matched anything, without a word (UI-007).
 */
export const WorkflowRuleSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('kpi_value'),
      kpiId: z.string().trim().min(1),
      operator: RuleOperatorSchema,
      value: z.number().finite(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('kpi_change_pct'),
      kpiId: z.string().trim().min(1),
      operator: RuleOperatorSchema,
      value: z.number().finite(),
      windowDays: z.number().int().min(1).max(365).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('alert_severity'),
      operator: RuleOperatorSchema,
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    })
    .strict(),
]);
export type WorkflowRuleDto = z.infer<typeof WorkflowRuleSchema>;

/** What a workflow does when it fires — the shapes `action-dispatcher.service.ts` reads. */
export const WorkflowActionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('create_task'),
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().max(2000).optional(),
      assigneeUserId: z.string().trim().min(1).optional(),
      dueAtRelativeHours: z.number().int().min(1).max(8760).optional(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('post_webhook'),
      subscriptionId: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('send_notification'),
      channelId: z.string().trim().min(1),
      message: z.string().trim().min(1).max(2000),
    })
    .strict(),
]);
export type WorkflowActionDto = z.infer<typeof WorkflowActionSchema>;

const WorkflowFields = z
  .object({
    name: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).optional(),
    triggers: z.array(WorkflowTriggerSchema).min(1),
    // null = no condition: the workflow fires on every event of its triggers.
    rule: WorkflowRuleSchema.nullable().optional(),
    action: WorkflowActionSchema,
    isActive: z.boolean().optional(),
    scheduleCron: z.string().trim().max(100).optional(),
  })
  .strict();

export const CreateWorkflowDtoSchema = WorkflowFields;
export type CreateWorkflowDto = z.infer<typeof CreateWorkflowDtoSchema>;

export const UpdateWorkflowDtoSchema = WorkflowFields.partial().strict();
export type UpdateWorkflowDto = z.infer<typeof UpdateWorkflowDtoSchema>;
