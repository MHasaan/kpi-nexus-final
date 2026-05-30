import { Controller, Get, Query } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { type SearchResult, SearchService, type SearchType } from './search.service.js';

const VALID_TYPES: SearchType[] = ['kpi', 'dashboard', 'user', 'orgUnit'];

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  run(@Query('q') q?: string, @Query('types') types?: string, @Query('limit') limit?: string): Promise<SearchResult[]> {
    const parsedTypes = types
      ? types.split(',').map((t) => t.trim()).filter((t): t is SearchType => VALID_TYPES.includes(t as SearchType))
      : undefined;
    return this.search.search(q ?? '', {
      types: parsedTypes && parsedTypes.length > 0 ? parsedTypes : undefined,
      limit: limit ? Math.min(50, Math.max(1, Number(limit) || 50)) : undefined,
    });
  }
}
