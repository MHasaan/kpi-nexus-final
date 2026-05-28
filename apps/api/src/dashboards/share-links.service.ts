import { randomBytes } from 'node:crypto';

import {
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { DashboardsService } from './dashboards.service.js';
import type { CreateShareLinkDto } from './dto/dashboard.dto.js';

const BCRYPT_ROUNDS = 12;

// ────────────────────────────────────────────────────────────────────────────
// Select constants
// ────────────────────────────────────────────────────────────────────────────

// passwordHash fetched only to derive hasPassword; never returned — see explicit mapping in list().
const shareLinkListSelect = {
  id: true,
  token: true,
  expiresAt: true,
  viewCount: true,
  passwordHash: true,
  lastViewedAt: true,
  revokedAt: true,
  createdAt: true,
  createdById: true,
  createdBy: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
} satisfies Prisma.DashboardShareLinkSelect;

const shareLinkCreateSelect = {
  id: true,
  dashboardId: true,
  organizationId: true,
  token: true,
  expiresAt: true,
  viewCount: true,
  passwordHash: true,
  lastViewedAt: true,
  revokedAt: true,
  createdAt: true,
  createdById: true,
} satisfies Prisma.DashboardShareLinkSelect;

// The shape returned by resolve — minimal.
// passwordHash is fetched only for internal bcrypt comparison; it is never included in the returned payload.
const resolveSelect = {
  id: true,
  dashboardId: true,
  organizationId: true,
  expiresAt: true,
  viewCount: true,
  passwordHash: true,
  revokedAt: true,
  lastViewedAt: true,
} satisfies Prisma.DashboardShareLinkSelect;

// ────────────────────────────────────────────────────────────────────────────
// Public output types
// ────────────────────────────────────────────────────────────────────────────

export interface PublicShareLink {
  id: string;
  dashboardId?: string;
  token: string;
  expiresAt: Date | null;
  viewCount: number;
  hasPassword: boolean;
  lastViewedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  createdById: string;
  createdBy?: { id: string; fullName: string; email: string };
}

export interface ShareLinkResolvedPayload {
  dashboard: {
    id: string;
    name: string;
    description: string | null;
    isShared: boolean;
    layout: unknown;
    version: number;
  };
  widgets: Array<{
    id: string;
    widgetType: string;
    title: string | null;
    config: unknown;
    position: unknown;
    sortOrder: number;
  }>;
  kpiValues: Record<
    string,
    { latestValue: number | null; latestRecordedAt: Date | null }
  >;
}

// ────────────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ShareLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dashboards: DashboardsService,
  ) {}

  /**
   * Create a new share link for a dashboard.
   * Returns the plaintext token so the UI can show it once.
   * Never returns passwordHash — only exposes hasPassword.
   */
  async create(dashboardId: string, dto: CreateShareLinkDto): Promise<PublicShareLink> {
    const ctx = RequestContextStore.require();
    // Enforce visibility + org-scope; throws 404 if not found or not visible.
    await this.dashboards.getById(dashboardId);

    const token = randomBytes(32).toString('base64url');
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
      : null;

    const link = await this.prisma.dashboardShareLink.create({
      data: {
        organizationId: ctx.organizationId,
        dashboardId,
        token,
        expiresAt: dto.expiresAt ?? null,
        passwordHash,
        createdById: ctx.userId,
      },
      select: shareLinkCreateSelect,
    });

    await this.audit.record({
      action: 'CREATE',
      entityType: 'DashboardShareLink',
      entityId: link.id,
      metadata: {
        dashboardId,
        hasPassword: passwordHash !== null,
        expiresAt: link.expiresAt?.toISOString() ?? null,
      },
    });

    return {
      id: link.id,
      dashboardId: link.dashboardId,
      token: link.token,
      expiresAt: link.expiresAt,
      viewCount: link.viewCount,
      hasPassword: link.passwordHash !== null,
      lastViewedAt: link.lastViewedAt,
      revokedAt: link.revokedAt,
      createdAt: link.createdAt,
      createdById: link.createdById,
    };
  }

  /**
   * List all share links for a dashboard (newest first).
   * Enforces dashboard visibility. Never exposes passwordHash — returns hasPassword boolean.
   */
  async list(dashboardId: string): Promise<PublicShareLink[]> {
    const ctx = RequestContextStore.require();
    await this.dashboards.getById(dashboardId);

    const links = await this.prisma.dashboardShareLink.findMany({
      where: { organizationId: ctx.organizationId, dashboardId },
      select: shareLinkListSelect,
      orderBy: { createdAt: 'desc' },
    });

    return links.map((link) => ({
      id: link.id,
      token: link.token,
      expiresAt: link.expiresAt,
      viewCount: link.viewCount,
      hasPassword: link.passwordHash !== null,
      lastViewedAt: link.lastViewedAt,
      revokedAt: link.revokedAt,
      createdAt: link.createdAt,
      createdById: link.createdById,
      createdBy: link.createdBy,
    }));
  }

  /**
   * Soft-revoke a share link (sets revokedAt = now). Org-scoped.
   * 404 if not found or cross-org.
   */
  async revoke(linkId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.dashboardShareLink.findFirst({
      where: { id: linkId, organizationId: ctx.organizationId },
      select: { id: true, dashboardId: true, revokedAt: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Share link not found' });
    }
    if (!existing.revokedAt) {
      await this.prisma.dashboardShareLink.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'DashboardShareLink',
      entityId: existing.id,
      metadata: { dashboardId: existing.dashboardId, action: 'revoke' },
    });
  }

  /**
   * Unauthenticated path — resolve a public token to its dashboard payload.
   * Must be called within RequestContextStore.runWithBypass().
   * - 404 if token not found or revoked
   * - 410 if expired
   * - 401 if password required but wrong/missing
   * On success: increments viewCount + sets lastViewedAt, returns composed payload.
   */
  async resolve(token: string, password?: string): Promise<ShareLinkResolvedPayload> {
    return RequestContextStore.runWithBypass('public-share-resolve', async () => {
      const link = await this.prisma.dashboardShareLink.findUnique({
        where: { token },
        select: resolveSelect,
      });

      if (!link) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Share link not found' });
      }

      if (link.revokedAt !== null) {
        // Surface as 404 — don't leak that the link once existed.
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Share link not found' });
      }

      if (link.expiresAt !== null && link.expiresAt.getTime() < Date.now()) {
        throw new GoneException({ code: 'GONE', message: 'Share link has expired' });
      }

      if (link.passwordHash !== null) {
        if (!password) {
          throw new UnauthorizedException({
            code: 'PASSWORD_REQUIRED',
            message: 'This share link requires a password',
          });
        }
        const passwordOk = await bcrypt.compare(password, link.passwordHash);
        if (!passwordOk) {
          throw new UnauthorizedException({
            code: 'INVALID_PASSWORD',
            message: 'Invalid password',
          });
        }
      }

      // Increment viewCount and update lastViewedAt.
      await this.prisma.dashboardShareLink.update({
        where: { id: link.id },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: new Date(),
        },
      });

      // Load the dashboard + widgets (scoped to the link's org).
      const dashboard = await this.prisma.dashboard.findFirst({
        where: { id: link.dashboardId, organizationId: link.organizationId, deletedAt: null },
        select: {
          id: true,
          name: true,
          description: true,
          isShared: true,
          layout: true,
          version: true,
          widgets: {
            select: {
              id: true,
              widgetType: true,
              title: true,
              config: true,
              position: true,
              sortOrder: true,
            },
            orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
          },
        },
      });

      if (!dashboard) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Dashboard not found' });
      }

      // Collect distinct kpiIds from widget configs.
      const kpiIds = new Set<string>();
      for (const widget of dashboard.widgets) {
        const cfg = widget.config as Record<string, unknown> | null;
        if (cfg && typeof cfg['kpiId'] === 'string') {
          kpiIds.add(cfg['kpiId']);
        }
      }

      // Fetch the latest data point for each kpiId within the org.
      const kpiValues: ShareLinkResolvedPayload['kpiValues'] = {};
      await Promise.all(
        Array.from(kpiIds).map(async (kpiId) => {
          const point = await this.prisma.kPIDataPoint.findFirst({
            where: { organizationId: link.organizationId, kpiId },
            orderBy: { recordedAt: 'desc' },
            select: { value: true, recordedAt: true },
          });
          kpiValues[kpiId] = {
            latestValue: point?.value ?? null,
            latestRecordedAt: point?.recordedAt ?? null,
          };
        }),
      );

      return {
        dashboard: {
          id: dashboard.id,
          name: dashboard.name,
          description: dashboard.description,
          isShared: dashboard.isShared,
          layout: dashboard.layout,
          version: dashboard.version,
        },
        widgets: dashboard.widgets.map((w) => ({
          id: w.id,
          widgetType: w.widgetType,
          title: w.title,
          config: w.config,
          position: w.position,
          sortOrder: w.sortOrder,
        })),
        kpiValues,
      };
    });
  }
}
