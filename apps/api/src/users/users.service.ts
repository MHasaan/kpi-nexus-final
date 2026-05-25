import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roleId: string | null;
  managerId: string | null;
  positionId: string | null;
  createdAt: Date;
}

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  roleId: true,
  managerId: true,
  positionId: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PublicUser[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.user.findMany({
      where: { organizationId: ctx.organizationId },
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string): Promise<PublicUser> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: userSelect,
    });
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    }
    return user;
  }
}
