import { Inject, Injectable } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import type { ZodType } from 'zod';

import { IS_PUBLIC_KEY } from '../rbac/decorators/public.decorator.js';
import { REQUIRE_ANY_PERMISSION_KEY, REQUIRE_PERMISSIONS_KEY } from '../rbac/decorators/require-permissions.decorator.js';
import { API_BODY_KEY } from './api-body.decorator.js';
import { type HttpMethod, type OpenApiDocument, type RouteInfo, buildOpenApiDocument } from './openapi-builder.js';

// Nest's RequestMethod enum values.
const METHODS: Record<number, HttpMethod | undefined> = { 0: 'get', 1: 'post', 2: 'put', 3: 'delete', 4: 'patch' };

const API_VERSION = '1.0.0';

const join = (...parts: string[]) =>
  '/' +
  parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .join('/');

/**
 * Builds the OpenAPI document from the controllers Nest has registered:
 * paths and verbs, @RequirePermissions / @RequireAnyPermission and @Public
 * (handler first, then class, as PermissionsGuard reads them) and @ApiBody.
 */
@Injectable()
export class OpenApiService {
  private cached?: OpenApiDocument;

  // Explicit tokens: this service must not depend on emitted constructor metadata.
  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(MetadataScanner) private readonly scanner: MetadataScanner,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  routes(): RouteInfo[] {
    const routes: RouteInfo[] = [];
    for (const wrapper of this.discovery.getControllers()) {
      const type = wrapper.metatype as (new (...args: unknown[]) => unknown) | undefined;
      if (!type || !wrapper.instance) continue;
      const base = (Reflect.getMetadata(PATH_METADATA, type) as string | string[] | undefined) ?? '';
      const proto = Object.getPrototypeOf(wrapper.instance) as Record<string, unknown>;
      for (const name of this.scanner.getAllMethodNames(proto)) {
        const handler = proto[name] as (...args: unknown[]) => unknown;
        const method = METHODS[Reflect.getMetadata(METHOD_METADATA, handler) as number];
        const sub = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        if (!method || sub === undefined) continue;
        const all = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRE_PERMISSIONS_KEY, [handler, type]);
        const any = this.reflector.getAllAndOverride<string[] | undefined>(REQUIRE_ANY_PERMISSION_KEY, [handler, type]);
        const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [handler, type]) === true;
        const body = Reflect.getMetadata(API_BODY_KEY, handler) as ZodType | undefined;
        for (const b of Array.isArray(base) ? base : [base]) {
          for (const s of Array.isArray(sub) ? sub : [sub]) {
            routes.push({
              method,
              path: join(b, s),
              controller: type.name,
              handler: name,
              isPublic,
              ...(all?.length || any?.length ? { permissions: { ...(all?.length ? { all } : {}), ...(any?.length ? { any } : {}) } } : {}),
              ...(body ? { body } : {}),
            });
          }
        }
      }
    }
    return routes;
  }

  document(): OpenApiDocument {
    this.cached ??= buildOpenApiDocument(this.routes(), { version: API_VERSION });
    return this.cached;
  }
}
