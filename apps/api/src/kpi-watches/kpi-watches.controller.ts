import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { KPI_WATCH_EVENTS } from './kpi-watch.producer.js';
import { KpiWatchesService } from './kpi-watches.service.js';

const WatchDtoSchema = z.object({ events: z.array(z.enum(KPI_WATCH_EVENTS)).min(1).max(KPI_WATCH_EVENTS.length) }).strict();

/** Watching KPIs: personal notices (LOW alerts) when chosen events happen. */
@Controller()
@RequirePermissions(PermissionKey.KPI_VIEW)
export class KpiWatchesController {
  constructor(private readonly watches: KpiWatchesService) {}

  @Get('kpi-watches')
  list() {
    return this.watches.list();
  }

  @Get('kpis/:id/watch')
  get(@Param('id') id: string) {
    return this.watches.get(id);
  }

  @Put('kpis/:id/watch')
  watch(@Param('id') id: string, @Body() body: unknown) {
    const parsed = WatchDtoSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid request body', details: { issues: parsed.error.issues } });
    }
    return this.watches.watch(id, [...new Set(parsed.data.events)]);
  }

  @Delete('kpis/:id/watch')
  @HttpCode(HttpStatus.NO_CONTENT)
  unwatch(@Param('id') id: string): Promise<void> {
    return this.watches.unwatch(id);
  }
}
