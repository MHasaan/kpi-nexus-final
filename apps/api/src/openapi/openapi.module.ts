import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { OpenApiController } from './openapi.controller.js';
import { OpenApiService } from './openapi.service.js';

@Module({
  imports: [DiscoveryModule],
  controllers: [OpenApiController],
  providers: [OpenApiService],
})
export class OpenApiModule {}
