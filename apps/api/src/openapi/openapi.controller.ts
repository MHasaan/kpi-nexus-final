import { Controller, Get } from '@nestjs/common';

import { Public } from '../rbac/decorators/public.decorator.js';
import type { OpenApiDocument } from './openapi-builder.js';
import { OpenApiService } from './openapi.service.js';

/** The API's OpenAPI 3.1 document (spec §: OpenAPI at /api/v1/openapi.json). */
@Controller('api/v1')
export class OpenApiController {
  constructor(private readonly openapi: OpenApiService) {}

  @Get('openapi.json')
  @Public()
  spec(): OpenApiDocument {
    return this.openapi.document();
  }
}
