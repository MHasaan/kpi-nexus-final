import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import {
  type LineageEdgeLite,
  type LineageHop,
  type LineageLevel,
  flattenLevels,
  traverse,
} from './lineage-graph.js';
import type { RecordLineageInput } from './dto/lineage.dto.js';

@Injectable()
export class LineageService {
  private readonly logger = new Logger(LineageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fire-and-forget edge recorder. Other services call this to note that a
   * transform produced data; it must never throw into the caller's flow, so all
   * errors are swallowed (logged). Returns true when persisted.
   */
  async record(input: RecordLineageInput): Promise<boolean> {
    try {
      const ctx = RequestContextStore.require();
      await this.prisma.lineageEdge.create({
        data: {
          organizationId: ctx.organizationId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          targetType: input.targetType,
          targetId: input.targetId,
          transformType: input.transformType,
          jobRunId: input.jobRunId,
          metadata: input.metadata as Prisma.InputJsonValue | undefined,
        },
      });
      return true;
    } catch (err) {
      this.logger.warn(`lineage record failed: ${(err as Error).message}`);
      return false;
    }
  }

  /** Immediate-to-N-hop parents (sources that feed the node). */
  async getUpstream(type: string, id: string, depth = 1): Promise<LineageHop[]> {
    const edges = await this.loadEdges();
    return flattenLevels(traverse(edges, { type, id }, 'upstream', depth), depth);
  }

  /** Immediate-to-N-hop children (targets the node feeds). */
  async getDownstream(type: string, id: string, depth = 1): Promise<LineageHop[]> {
    const edges = await this.loadEdges();
    return flattenLevels(traverse(edges, { type, id }, 'downstream', depth), depth);
  }

  /**
   * Full BFS trace in both directions, grouped by depth — the shape the lineage
   * graph view consumes (upstream nodes on one side, downstream on the other).
   */
  async trace(
    type: string,
    id: string,
    maxDepth = 5,
  ): Promise<{ upstream: LineageLevel[]; downstream: LineageLevel[] }> {
    const edges = await this.loadEdges();
    return {
      upstream: traverse(edges, { type, id }, 'upstream', maxDepth),
      downstream: traverse(edges, { type, id }, 'downstream', maxDepth),
    };
  }

  /** All edges in the caller's org (in-memory BFS is sufficient at FYP scale). */
  private async loadEdges(): Promise<LineageEdgeLite[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.lineageEdge.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        targetType: true,
        targetId: true,
        transformType: true,
      },
    });
  }
}
