/**
 * Route discovery for the OpenAPI document: every controller route is found
 * from Nest's own metadata (paths, verbs, @RequirePermissions /
 * @RequireAnyPermission at handler or class level, @Public, @ApiBody).
 */
import 'reflect-metadata';
import { Body, Controller, Delete, Get, Module, Param, Patch, Post } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { Public } from '../rbac/decorators/public.decorator.js';
import { RequireAnyPermission, RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { ApiBody } from './api-body.decorator.js';
import { OpenApiService } from './openapi.service.js';

const Body1 = z.object({ name: z.string() }).strict();

@Controller('widgets')
@RequirePermissions('KPI_VIEW' as never)
class WidgetsController {
  @Get()
  list() {
    return [];
  }

  @Post()
  @RequirePermissions('KPI_CREATE' as never)
  @ApiBody(Body1)
  create(@Body() _b: unknown) {
    return {};
  }

  @Patch(':id')
  @RequireAnyPermission('KPI_EDIT' as never, 'ORG_SETTINGS' as never)
  update(@Param('id') _id: string) {
    return {};
  }

  @Delete(':id')
  remove(@Param('id') _id: string) {
    return {};
  }
}

@Controller()
class OpenController {
  @Get('ping')
  @Public()
  ping() {
    return 'pong';
  }
}

@Module({ imports: [DiscoveryModule], controllers: [WidgetsController, OpenController], providers: [OpenApiService] })
class TestModule {}

describe('OpenApiService route discovery', () => {
  it('finds every route with its verb, path, permissions, public flag and body schema', async () => {
    const mod = await Test.createTestingModule({ imports: [TestModule] }).compile();
    const routes = mod.get(OpenApiService).routes();
    const byKey = Object.fromEntries(routes.map((r) => [`${r.method} ${r.path}`, r]));

    expect(Object.keys(byKey).sort()).toEqual(['delete /widgets/:id', 'get /ping', 'get /widgets', 'patch /widgets/:id', 'post /widgets']);
    expect(byKey['get /widgets']).toMatchObject({ controller: 'WidgetsController', handler: 'list', permissions: { all: ['KPI_VIEW'] }, isPublic: false });
    expect(byKey['post /widgets']).toMatchObject({ permissions: { all: ['KPI_CREATE'] } });
    expect(byKey['post /widgets']!.body).toBe(Body1);
    expect(byKey['patch /widgets/:id']).toMatchObject({ permissions: { any: ['KPI_EDIT', 'ORG_SETTINGS'] } });
    expect(byKey['delete /widgets/:id']).toMatchObject({ permissions: { all: ['KPI_VIEW'] } }); // class-level
    expect(byKey['get /ping']).toMatchObject({ isPublic: true });
  });

  it('builds the document once and serves the same object', async () => {
    const mod = await Test.createTestingModule({ imports: [TestModule] }).compile();
    const svc = mod.get(OpenApiService);
    const doc = svc.document();
    expect(doc.paths['/widgets/{id}']).toBeDefined();
    expect(svc.document()).toBe(doc);
  });
});
