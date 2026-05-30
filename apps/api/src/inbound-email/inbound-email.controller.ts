import { BadRequestException, Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../rbac/decorators/public.decorator.js';
import { InboundEmailService } from './inbound-email.service.js';

const InboundEmailDtoSchema = z
  .object({
    to: z.string().trim().min(1),
    from: z.string().trim().min(1),
    subject: z.string().optional(),
    text: z.string().default(''),
    html: z.string().optional(),
  })
  .passthrough();

/**
 * Public inbound-email webhook. Integrity via the `x-inbound-signature` HMAC
 * header (over the canonical-JSON body); the acting principal is derived inside
 * the service from the addressed entity + sender lookup.
 */
@Controller('webhooks/inbound')
export class InboundEmailController {
  constructor(private readonly inbound: InboundEmailService) {}

  @Public()
  @Post('email')
  @HttpCode(HttpStatus.OK)
  async email(
    @Body() body: unknown,
    @Headers('x-inbound-signature') signature?: string,
  ): Promise<{ ok: true; commentId: string }> {
    const parsed = InboundEmailDtoSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid inbound email payload' });
    }
    const payload = parsed.data;
    const rawBody = JSON.stringify(payload);
    const result = await this.inbound.handle(payload, { rawBody, signature: signature ?? '' });
    return { ok: true, commentId: result.commentId };
  }
}
