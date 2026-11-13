import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';

import { Public } from '../rbac/decorators/public.decorator.js';
import { OnboardingService } from './onboarding.service.js';

const StartSchema = z
  .object({
    email: z.string().email(),
    organizationName: z.string().trim().min(1).max(200),
    entryMode: z.string().trim().max(60).optional(),
  })
  .strict();

const PatchSchema = z
  .object({ patch: z.record(z.string(), z.unknown()), lastEditedStep: z.string().trim().max(60).optional() })
  .strict();

const ApplyTemplateSchema = z.object({ slug: z.string().trim().min(1) }).strict();

const CompleteSchema = z
  .object({
    adminEmail: z.string().email(),
    adminPassword: z.string().min(8).max(200),
    adminFullName: z.string().trim().min(2).max(160),
    slug: z.string().trim().min(1).max(120),
  })
  .strict();

function parse<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid request', details: r.error.flatten() });
  return r.data;
}

/** Onboarding wizard — public (pre-auth); draft access gated by X-Draft-Token. */
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('start')
  @Public()
  start(@Body() body: unknown) {
    return this.onboarding.start(parse(StartSchema, body));
  }

  @Get(':id')
  @Public()
  get(@Param('id') id: string, @Headers('x-draft-token') token?: string) {
    return this.onboarding.getDraft(id, token ?? '');
  }

  @Put(':id')
  @Public()
  patch(@Param('id') id: string, @Body() body: unknown, @Headers('x-draft-token') token?: string) {
    const data = parse(PatchSchema, body);
    return this.onboarding.patchDraft(id, token ?? '', data.patch, data.lastEditedStep);
  }

  @Post(':id/apply-template')
  @Public()
  applyTemplate(@Param('id') id: string, @Body() body: unknown, @Headers('x-draft-token') token?: string) {
    return this.onboarding.applyTemplate(id, token ?? '', parse(ApplyTemplateSchema, body).slug);
  }

  @Post(':id/complete')
  @Public()
  complete(@Param('id') id: string, @Body() body: unknown, @Headers('x-draft-token') token?: string) {
    return this.onboarding.complete(id, token ?? '', parse(CompleteSchema, body));
  }
}
