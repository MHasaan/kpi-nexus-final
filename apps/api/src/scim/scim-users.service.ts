import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { flattenScimUserPatch, parseEqFilter } from './scim-patch.js';

const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  status: string;
}

export interface ScimUserResource {
  schemas: string[];
  id: string;
  userName: string;
  name: { formatted: string };
  displayName: string;
  active: boolean;
  emails: Array<{ value: string; primary: boolean }>;
  meta: { resourceType: 'User' };
}

export interface ScimListResponse {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: ScimUserResource[];
}

/** A user is SCIM-`active` unless deactivated/archived. */
function isActive(status: string): boolean {
  return status !== 'SUSPENDED' && status !== 'ARCHIVED' && status !== 'DELETED';
}

function toScim(u: UserRow): ScimUserResource {
  return {
    schemas: [USER_SCHEMA],
    id: u.id,
    userName: u.email,
    name: { formatted: u.fullName },
    displayName: u.fullName,
    active: isActive(u.status),
    emails: [{ value: u.email, primary: true }],
    meta: { resourceType: 'User' },
  };
}

@Injectable()
export class ScimUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter?: string): Promise<ScimListResponse> {
    const ctx = RequestContextStore.require();
    const userName = parseEqFilter(filter, 'userName');
    const rows = await this.prisma.user.findMany({
      where: { organizationId: ctx.organizationId, ...(userName ? { email: userName } : {}) },
      select: { id: true, email: true, fullName: true, status: true },
      orderBy: [{ createdAt: 'asc' }],
    });
    const resources = rows.map(toScim);
    return {
      schemas: [LIST_SCHEMA],
      totalResults: resources.length,
      startIndex: 1,
      itemsPerPage: resources.length,
      Resources: resources,
    };
  }

  async getById(id: string): Promise<ScimUserResource> {
    return toScim(await this.requireUser(id));
  }

  async create(payload: Record<string, unknown>): Promise<ScimUserResource> {
    const ctx = RequestContextStore.require();
    const email = this.extractUserName(payload);
    const displayName = flattenScimUserPatch(payload).displayName ?? email;
    try {
      const created = await this.prisma.user.create({
        data: {
          organizationId: ctx.organizationId,
          email,
          fullName: displayName,
          status: 'INVITED',
          invitedAt: new Date(),
        },
        select: { id: true, email: true, fullName: true, status: true },
      });
      return toScim(created);
    } catch (err) {
      if (this.isUnique(err)) {
        throw new ConflictException({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], detail: 'User already exists', status: '409' });
      }
      throw err;
    }
  }

  async patch(id: string, body: unknown): Promise<ScimUserResource> {
    await this.requireUser(id);
    const patch = flattenScimUserPatch(body);
    return this.applyPatch(id, patch);
  }

  async replace(id: string, body: Record<string, unknown>): Promise<ScimUserResource> {
    await this.requireUser(id);
    // PUT carries the full resource as a flat object — reuse the flattener.
    const patch = flattenScimUserPatch(body);
    return this.applyPatch(id, patch);
  }

  async archive(id: string): Promise<void> {
    await this.requireUser(id);
    await this.prisma.user.update({ where: { id }, data: { status: 'ARCHIVED', archivedAt: new Date(), isActive: false } });
  }

  private async applyPatch(id: string, patch: { active?: boolean; displayName?: string }): Promise<ScimUserResource> {
    const data: Record<string, unknown> = {};
    if (patch.active === false) {
      data.status = 'SUSPENDED';
      data.isActive = false;
    } else if (patch.active === true) {
      data.status = 'ACTIVE';
      data.isActive = true;
    }
    if (patch.displayName !== undefined) data.fullName = patch.displayName;
    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, fullName: true, status: true },
    });
    return toScim(updated);
  }

  private async requireUser(id: string): Promise<UserRow> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, email: true, fullName: true, status: true },
    });
    if (!user) {
      throw new NotFoundException({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], detail: 'User not found', status: '404' });
    }
    return user;
  }

  private extractUserName(payload: Record<string, unknown>): string {
    if (typeof payload.userName === 'string' && payload.userName) return payload.userName;
    const emails = payload.emails as Array<{ value?: string; primary?: boolean }> | undefined;
    const primary = emails?.find((e) => e.primary) ?? emails?.[0];
    if (primary?.value) return primary.value;
    throw new ConflictException({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], detail: 'userName is required', status: '400' });
  }

  private isUnique(err: unknown): boolean {
    return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002';
  }
}
