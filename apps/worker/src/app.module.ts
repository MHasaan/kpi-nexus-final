import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { EchoModule } from './echo/echo.module.js';
import { bullConnectionFromUrl } from './redis-connection.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'SYS:HH:MM:ss.l',
                  ignore: 'pid,hostname',
                },
              },
      },
    }),
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: bullConnectionFromUrl(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'),
      }),
    }),
    EchoModule,
  ],
})
export class AppModule {}
