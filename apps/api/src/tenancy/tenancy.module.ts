import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { TenancyInterceptor } from './tenancy.interceptor.js';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TenancyInterceptor,
    },
  ],
})
export class TenancyModule {}
