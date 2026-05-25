import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type {
  CreatePositionDto,
  UpdatePositionDto,
} from './dto/create-position.dto.js';

export interface PublicPosition {
  id: string;
  name: string;
  level: number;
  track: 'IC' | 'MANAGEMENT' | 'EXECUTIVE' | null;
  payGrade: string | null;
  description: string | null;
  orgUnitId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const positionSelect = {
  id: true,
  name: true,
  level: true,
  track: true,
  payGrade: true,
  description: true,
  orgUnitId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<PublicPosition[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.position.findMany({
      where: { organizationId: ctx.organizationId },
      select: positionSelect,
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
    });
  }

  async getById(id: string): Promise<PublicPosition> {
    const ctx = RequestContextStore.require();
    const position = await this.prisma.position.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: positionSelect,
    });
    if (!position) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'position not found' });
    }
    return position;
  }

  async create(dto: CreatePositionDto): Promise<PublicPosition> {
    const ctx = RequestContextStore.require();
    try {
      return await this.prisma.position.create({
        data: { ...dto, organizationId: ctx.organizationId },
        select: positionSelect,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'A position with this name already exists',
        });
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdatePositionDto): Promise<PublicPosition> {
    await this.getById(id);
    try {
      return await this.prisma.position.update({
        where: { id },
        data: dto,
        select: positionSelect,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'A position with this name already exists',
        });
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const position = await this.prisma.position.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, _count: { select: { users: true } } },
    });
    if (!position) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'position not found' });
    }
    if (position._count.users > 0) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: `Position still has ${position._count.users} user(s); reassign before deleting`,
        details: { userCount: position._count.users },
      });
    }
    await this.prisma.position.delete({ where: { id } });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
  }
}
