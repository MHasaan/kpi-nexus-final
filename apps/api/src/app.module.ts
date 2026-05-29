import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { AlertEngineModule } from './alert-engine/alert-engine.module.js';
import { AlertRulesModule } from './alert-rules/alert-rules.module.js';
import { AlertsModule } from './alerts/alerts.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DashboardsModule } from './dashboards/dashboards.module.js';
import { HealthModule } from './health/health.module.js';
import { KpisModule } from './kpis/kpis.module.js';
import { MfaModule } from './mfa/mfa.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { OrgUnitsModule } from './org-units/org-units.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { PasswordModule } from './password/password.module.js';
import { PermissionDelegationsModule } from './permission-delegations/permission-delegations.module.js';
import { PositionsModule } from './positions/positions.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RbacModule } from './rbac/rbac.module.js';
import { ResourcePermissionsModule } from './resource-permissions/resource-permissions.module.js';
import { RolesModule } from './roles/roles.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';
import { UsersModule } from './users/users.module.js';
import { ReportsModule } from './reports/reports.module.js';

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
    BullModule.forRootAsync({
      useFactory: () => {
        const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
          },
        };
      },
    }),
    PrismaModule,
    TenancyModule,
    RbacModule,
    AuditModule,
    AuthModule,
    MfaModule,
    OrganizationsModule,
    OrgUnitsModule,
    PasswordModule,
    PermissionDelegationsModule,
    ResourcePermissionsModule,
    RolesModule,
    PositionsModule,
    UsersModule,
    KpisModule,
    DashboardsModule,
    ReportsModule,
    RealtimeModule,
    AlertEngineModule,
    AlertRulesModule,
    AlertsModule,
    HealthModule,
  ],
})
export class AppModule {}
