import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { CommentsService, type PublicComment } from './comments.service.js';
import {
  CreateCommentDtoSchema,
  ListCommentsQuerySchema,
  UpdateCommentDtoSchema,
} from './dto/comment.dto.js';

const parse = <S extends ZodTypeAny>(schema: S, body: unknown): ZInfer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: { issues: result.error.issues },
    });
  }
  return result.data;
};

@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  list(@Query() query: unknown): Promise<PublicComment[]> {
    return this.comments.list(parse(ListCommentsQuerySchema, query ?? {}));
  }

  @Post()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<PublicComment> {
    return this.comments.create(parse(CreateCommentDtoSchema, body));
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicComment> {
    return this.comments.update(id, parse(UpdateCommentDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.comments.remove(id);
  }
}
