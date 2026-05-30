import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { Public } from '../rbac/decorators/public.decorator.js';
import { OrgTemplatesService, type TemplateSummary } from './org-templates.service.js';

/**
 * Org templates — used during onboarding (before auth exists), so the read
 * endpoints are public.
 */
@Controller('org-templates')
export class OrgTemplatesController {
  constructor(private readonly templates: OrgTemplatesService) {}

  @Get()
  @Public()
  list(
    @Query('tier') tier?: string,
    @Query('industry') industry?: string,
    @Query('orgType') orgType?: string,
  ): Promise<TemplateSummary[]> {
    return this.templates.list({ tier: tier || undefined, industry: industry || undefined, orgType: orgType || undefined });
  }

  @Get(':slug')
  @Public()
  preview(@Param('slug') slug: string) {
    return this.templates.preview(slug);
  }

  @Post('preview')
  @Public()
  previewBody(@Body() body: unknown) {
    const slug = (body as { slug?: string })?.slug ?? '';
    return this.templates.preview(slug);
  }
}
