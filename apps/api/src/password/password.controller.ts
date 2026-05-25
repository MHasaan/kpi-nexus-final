import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { z, type ZodTypeAny, type infer as ZInfer } from 'zod';

import { Public } from '../rbac/decorators/public.decorator.js';
import { PasswordResetService } from './password-reset.service.js';

const RequestResetSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

const ConfirmResetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(1).max(128),
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

@Controller('auth/password')
export class PasswordController {
  constructor(private readonly passwords: PasswordResetService) {}

  @Public()
  @Post('request-reset')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestReset(@Body() body: unknown): Promise<{ accepted: true }> {
    const dto = parse(RequestResetSchema, body);
    await this.passwords.request(dto.email);
    return { accepted: true };
  }

  @Public()
  @Post('confirm-reset')
  @HttpCode(HttpStatus.OK)
  async confirmReset(@Body() body: unknown): Promise<{ ok: true }> {
    const dto = parse(ConfirmResetSchema, body);
    await this.passwords.confirm(dto.token, dto.newPassword);
    return { ok: true };
  }
}
