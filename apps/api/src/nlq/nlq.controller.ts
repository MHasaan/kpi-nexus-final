import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { type NlqAnswer, NlqService } from './nlq.service.js';

const AskSchema = z.object({ question: z.string().trim().min(1).max(1000) }).strict();

@Controller('nlq')
export class NlqController {
  constructor(private readonly nlq: NlqService) {}

  @Post('ask')
  @RequirePermissions(PermissionKey.INSIGHTS_VIEW)
  ask(@Body() body: unknown): Promise<NlqAnswer> {
    const parsed = AskSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'question is required' });
    return this.nlq.ask(parsed.data.question);
  }

  @Post('reembed')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  reembed(): Promise<{ embedded: number }> {
    return this.nlq.reembed();
  }
}
