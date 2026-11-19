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
  MentionableQuerySchema,
  UpdateCommentDtoSchema,
} from './dto/comment.dto.js';
import { ApiBody } from '../openapi/api-body.decorator.js';

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
  @ApiBody(CreateCommentDtoSchema)
  create(@Body() body: unknown): Promise<PublicComment> {
    return this.comments.create(parse(CreateCommentDtoSchema, body));
  }

  /**
   * Colleagues to mention, by what was typed after "@": names and ids only —
   * see `CommentsService.mentionable`. The same permission as writing a
   * comment. POST so the name travels in the body, not in a URL that is logged.
   */
  @Post('mentionable')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  @HttpCode(HttpStatus.OK)
  @ApiBody(MentionableQuerySchema)
  mentionable(@Body() body: unknown): Promise<Array<{ id: string; fullName: string }>> {
    return this.comments.mentionable(parse(MentionableQuerySchema, body).query);
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  @ApiBody(UpdateCommentDtoSchema)
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
