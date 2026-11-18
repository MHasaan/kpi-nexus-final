import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { type NlqAnswer, NlqService } from './nlq.service.js';
import { ApiBody } from '../openapi/api-body.decorator.js';
import { AskSchema } from './nlq-ask.dto.js';


@Controller('nlq')
export class NlqController {
  constructor(private readonly nlq: NlqService) {}

  @Post('ask')
  @RequirePermissions(PermissionKey.INSIGHTS_VIEW)
  @ApiBody(AskSchema)
  ask(@Body() body: unknown): Promise<NlqAnswer> {
    const parsed = AskSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Send a question of up to 1,000 characters',
        details: { issues: parsed.error.issues },
      });
    }
    return this.nlq.ask(parsed.data.question, parsed.data.history);
  }

  @Post('reembed')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  reembed(): Promise<{ embedded: number }> {
    return this.nlq.reembed();
  }
}
