import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { MfaModule } from './mfa/mfa.module.js';
import { PasswordModule } from './password/password.module.js';
import { PositionsModule } from './positions/positions.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RbacModule } from './rbac/rbac.module.js';
import { RolesModule } from './roles/roles.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';
import { UsersModule } from './users/users.module.js';

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
                  ignore: 'pid,hostname,req.headers,res.headers',
                },
              },
        autoLogging: {
          ignore: (req) => req.url === '/health',
        },
      },
    }),
    PrismaModule,
    TenancyModule,
    RbacModule,
    AuditModule,
    AuthModule,
    MfaModule,
    PasswordModule,
    RolesModule,
    PositionsModule,
    UsersModule,
    HealthModule,
  ],
})
export class AppModule {}
