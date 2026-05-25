import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import type { ZodSchema } from 'zod';

import { Public } from '../rbac/decorators/public.decorator.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import {
  type LoginDto,
  LoginDtoSchema,
  type RefreshDto,
  RefreshDtoSchema,
} from './dto/login.dto.js';
import {
  type RegisterOrgDto,
  RegisterOrgDtoSchema,
} from './dto/register-org.dto.js';

const parse = <T>(schema: ZodSchema<T>, body: unknown): T => {
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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() body: unknown) {
    const dto = parse<RegisterOrgDto>(RegisterOrgDtoSchema, body);
    return this.auth.registerOrganization(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: unknown) {
    const dto = parse<LoginDto>(LoginDtoSchema, body);
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: unknown) {
    const dto = parse<RefreshDto>(RefreshDtoSchema, body);
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: unknown): Promise<void> {
    const dto = parse<RefreshDto>(RefreshDtoSchema, body);
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  async me(): Promise<{
    user: {
      id: string;
      email: string;
      fullName: string;
      organizationId: string;
      roleId: string | null;
    };
  }> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        organizationId: true,
        roleId: true,
      },
    });
    return { user };
  }
}
