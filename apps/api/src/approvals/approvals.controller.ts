import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { ApprovalEntityType } from '@kpi-nexus/db';
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { ApprovalRequestService, type PublicApprovalRequest } from './approval-request.service.js';
import { ApprovalWorkflowService, type PublicApprovalWorkflow } from './approval-workflow.service.js';
import {
  DecideDtoSchema,
  ListRequestsQuerySchema,
  UpsertWorkflowDtoSchema,
} from './dto/approval.dto.js';

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

const ENTITY_TYPES = ['KPI_DEFINITION', 'KPI_TARGET', 'ROLE_PERMISSIONS'];

@Controller('approvals')
export class ApprovalsController {
  constructor(
    private readonly workflows: ApprovalWorkflowService,
    private readonly requests: ApprovalRequestService,
  ) {}

  // --- Workflow config (admin only) ---

  @Get('workflows')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  listWorkflows(): Promise<PublicApprovalWorkflow[]> {
    return this.workflows.list();
  }

  @Put('workflows/:entityType')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  upsertWorkflow(@Param('entityType') entityType: string, @Body() body: unknown): Promise<PublicApprovalWorkflow> {
    if (!ENTITY_TYPES.includes(entityType)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Unknown entityType ${entityType}` });
    }
    return this.workflows.upsert(entityType as ApprovalEntityType, parse(UpsertWorkflowDtoSchema, body));
  }

  // --- Requests (authenticated) ---

  @Get('requests')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  listRequests(@Query() query: unknown): Promise<PublicApprovalRequest[]> {
    return this.requests.list(parse(ListRequestsQuerySchema, query ?? {}));
  }

  @Post('requests/:id/decide')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  @HttpCode(HttpStatus.OK)
  decide(@Param('id') id: string, @Body() body: unknown): Promise<PublicApprovalRequest> {
    return this.requests.decide(id, parse(DecideDtoSchema, body));
  }

  @Post('requests/:id/cancel')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string): Promise<PublicApprovalRequest> {
    return this.requests.cancel(id);
  }
}
