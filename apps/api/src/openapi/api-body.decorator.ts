import { SetMetadata } from '@nestjs/common';
import type { ZodType } from 'zod';

export const API_BODY_KEY = 'openapi:body';

/**
 * Documents a route's request body for the OpenAPI document. Controllers
 * parse bodies with Zod by hand, so the schema they parse with is passed here.
 */
export const ApiBody = (schema: ZodType): MethodDecorator => SetMetadata(API_BODY_KEY, schema);
