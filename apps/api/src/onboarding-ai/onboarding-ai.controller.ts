import { BadRequestException, Body, Controller, Headers, Post } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../rbac/decorators/public.decorator.js';
import { OnboardingAiService } from './onboarding-ai.service.js';

const GenerateSchema = z.object({ sessionId: z.string().min(1), prompt: z.string().trim().min(1).max(2000) }).strict();
const AssistantSchema = z.object({ sessionId: z.string().min(1), instruction: z.string().trim().min(1).max(2000) }).strict();
const SuggestSchema = z
  .object({ sessionId: z.string().min(1), fieldPath: z.string().trim().min(1).max(200), context: z.string().trim().max(500).optional() })
  .strict();
const ExplainSchema = z.object({ sessionId: z.string().min(1), fieldPath: z.string().trim().min(1).max(200) }).strict();
const ApplySchema = z
  .object({
    sessionId: z.string().min(1),
    interactionId: z.string().min(1),
    appliedSections: z.array(z.string()).max(20),
    editedSections: z.array(z.string()).max(20).optional(),
    rejectedSections: z.array(z.string()).max(20).optional(),
  })
  .strict();

function parse<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: r.error.flatten() });
  return r.data;
}

/** Onboarding AI co-pilot. Public (pre-auth); draft gated by X-Draft-Token. */
@Controller('onboarding/ai')
export class OnboardingAiController {
  constructor(private readonly ai: OnboardingAiService) {}

  @Post('generate')
  @Public()
  generate(@Body() body: unknown, @Headers('x-draft-token') token?: string) {
    const d = parse(GenerateSchema, body);
    return this.ai.generate(d.sessionId, token ?? '', d.prompt);
  }

  @Post('assistant')
  @Public()
  assistant(@Body() body: unknown, @Headers('x-draft-token') token?: string) {
    const d = parse(AssistantSchema, body);
    return this.ai.assistant(d.sessionId, token ?? '', d.instruction);
  }

  @Post('suggest')
  @Public()
  suggest(@Body() body: unknown, @Headers('x-draft-token') token?: string) {
    const d = parse(SuggestSchema, body);
    return this.ai.suggest(d.sessionId, token ?? '', d.fieldPath, d.context);
  }

  @Post('explain')
  @Public()
  explain(@Body() body: unknown, @Headers('x-draft-token') token?: string) {
    const d = parse(ExplainSchema, body);
    return this.ai.explain(d.sessionId, token ?? '', d.fieldPath);
  }

  @Post('apply')
  @Public()
  apply(@Body() body: unknown, @Headers('x-draft-token') token?: string) {
    const d = parse(ApplySchema, body);
    return this.ai.apply(d.sessionId, token ?? '', d);
  }
}
