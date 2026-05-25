import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { z, type ZodTypeAny, type infer as ZInfer } from 'zod';

import { MfaService, type EnrollmentResult } from './mfa.service.js';

const ConfirmSchema = z.object({
  code: z.string().min(6).max(8),
  recoveryCodes: z.array(z.string()).min(1).max(20),
});

const DisableSchema = z.object({
  code: z.string().min(6).max(20),
});

const parse = <S extends ZodTypeAny>(schema: S, body: unknown): ZInfer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: { issues: result.error.issues },
    });
  }
  return result.data;
};

@Controller('mfa')
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  /** Start enrollment. Returns secret + otpauth URL + plain recovery codes (one-time). */
  @Post('enroll')
  @HttpCode(HttpStatus.OK)
  enroll(): Promise<EnrollmentResult> {
    return this.mfa.enroll();
  }

  /** Confirm with a TOTP code generated from the secret. Persists the recovery hashes. */
  @Post('confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirm(@Body() body: unknown): Promise<void> {
    const dto = parse(ConfirmSchema, body);
    await this.mfa.confirm(dto.code, dto.recoveryCodes);
  }

  /** Disable MFA — requires a current TOTP code or one recovery code. */
  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disable(@Body() body: unknown): Promise<void> {
    const dto = parse(DisableSchema, body);
    await this.mfa.disable(dto.code);
  }
}
