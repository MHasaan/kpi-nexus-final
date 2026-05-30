import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { parseEqFilter, parseMemberValueFilter } from './scim-patch.js';

const GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';

export interface ScimGroupResource {
  schemas: string[];
  id: string;
  displayName: string;
  members: Array<{ value: string; display: string }>;
  meta: { resourceType: 'Group' };
}

export interface ScimGroupList {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: ScimGroupResource[];
}

/**
 * SCIM Groups backed by RoleDefinition; membership maps to User.roleId. Members
 * referencing users outside the org are silently dropped (Okta sends ids it
 * believes are valid; we never write across tenants).
 */
@Injectable()
export class ScimGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter?: string): Promise<ScimGroupList> {
    const ctx = RequestContextStore.require();
    const displayName = parseEqFilter(filter, 'displayName');
    const roles = await this.prisma.roleDefinition.findMany({
      where: { organizationId: ctx.organizationId, ...(displayName ? { name: displayName } : {}) },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }],
    });
    const resources: ScimGroupResource[] = [];
    for (const r of roles) resources.push(await this.toGroup(r.id, r.name));
    return { schemas: [LIST_SCHEMA], totalResults: resources.length, startIndex: 1, itemsPerPage: resources.length, Resources: resources };
  }

  async getById(id: string): Promise<ScimGroupResource> {
    const role = await this.requireRole(id);
    return this.toGroup(role.id, role.name);
  }

  async patch(id: string, body: unknown): Promise<ScimGroupResource> {
    const ctx = RequestContextStore.require();
    const role = await this.requireRole(id);
    const ops = ((body ?? {}) as { Operations?: Array<Record<string, unknown>> }).Operations ?? [];

    for (const raw of ops) {
      const op = String(raw.op ?? '').toLowerCase();
      const path = typeof raw.path === 'string' ? raw.path : undefined;

      if (op === 'add' || op === 'replace') {
        const ids = this.memberIds(raw.value);
        if (ids.length > 0) {
          // Only assign users that belong to this org (cross-tenant ids dropped).
          await this.prisma.user.updateMany({ where: { organizationId: ctx.organizationId, id: { in: ids } }, data: { roleId: id } });
        }
      } else if (op === 'remove') {
        const single = parseMemberValueFilter(path);
        if (single) {
          await this.prisma.user.updateMany({ where: { organizationId: ctx.organizationId, id: { in: [single] }, roleId: id }, data: { roleId: null } });
        } else if (path === 'members' || !path) {
          // Remove all members of the group.
          await this.prisma.user.updateMany({ where: { organizationId: ctx.organizationId, roleId: id }, data: { roleId: null } });
        }
      }
    }
    return this.toGroup(role.id, role.name);
  }

  private memberIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((m) => (m && typeof m === 'object' ? (m as { value?: string }).value : undefined))
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
  }

  private async toGroup(id: string, name: string): Promise<ScimGroupResource> {
    const ctx = RequestContextStore.require();
    const members = await this.prisma.user.findMany({
      where: { organizationId: ctx.organizationId, roleId: id },
      select: { id: true, email: true },
    });
    return {
      schemas: [GROUP_SCHEMA],
      id,
      displayName: name,
      members: members.map((m) => ({ value: m.id, display: m.email })),
      meta: { resourceType: 'Group' },
    };
  }

  private async requireRole(id: string): Promise<{ id: string; name: string }> {
    const ctx = RequestContextStore.require();
    const role = await this.prisma.roleDefinition.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, name: true },
    });
    if (!role) {
      throw new NotFoundException({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], detail: 'Group not found', status: '404' });
    }
    return role;
  }
}
