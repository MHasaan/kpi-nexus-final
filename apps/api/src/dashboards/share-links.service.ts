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
import { AccessContextService } from '../rbac/services/access-context.service.js';
import {
  clampHistoryFrom,
  isCategoryAllowed,
} from '../rbac/visibility/kpi-visibility.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { DashboardsService } from './dashboards.service.js';
import { type KpiHealthStatus, attainmentPct, kpiHealthStatus } from '../kpis/kpi-health.js';
import {
  PUBLIC_SERIES_POINTS,
  type PublicKpiView,
  type PublicListRow,
  type PublicPerspectiveCount,
  type SummaryRow,
  perspectiveCounts,
  publicListRows,
  publicListSize,
} from './public-dashboard-view.js';
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
  // createdById — used to gate the public payload by the link creator's KPI
  // category allowlist (Phase 3 security); never surfaced in the output.
  createdById: true,
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
  /** The KPIs the widgets point at: name, target and a short history to draw. Keyed by kpiId. */
  kpis: Record<string, PublicKpiView>;
  /** The rows the list widgets show; absent when the dashboard has no list widget. */
  listRows?: PublicListRow[];
  /** Strategy-map counts; absent when the dashboard has no strategy map. */
  perspectives?: PublicPerspectiveCount[];
}

// ────────────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────────────

/** The most organisation-wide KPIs a public list or strategy map is built from. */
const MAX_PUBLIC_SUMMARY_KPIS = 500;

@Injectable()
export class ShareLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dashboards: DashboardsService,
    private readonly accessContext: AccessContextService,
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

      // Layer-3 category gate (Phase 3 security): the public viewer is anonymous,
      // so we gate the payload by the LINK CREATOR's KPI category allowlist — a
      // restricted creator must not be able to leak restricted-category KPI values
      // through a public link. `null` ⇒ all (admin / unconfigured creator) = parity.
      //
      // Layer-4 data limit (Phase 4): for the same reason, the creator's
      // `historyWindowDays` bounds the latest-point read so a public viewer can't
      // surface a point older than the creator's own window. Both restrictions are
      // resolved under the re-established creator context in one pass.
      const { allowlist, historyWindowDays } = await this.resolveCreatorLimits(
        link.organizationId,
        link.createdById,
      );
      const windowFrom = clampHistoryFrom(undefined, historyWindowDays);

      // Fetch the latest data point for each allowed kpiId within the org;
      // restricted KPI values never enter the public payload.
      const kpiValues: ShareLinkResolvedPayload['kpiValues'] = {};
      await Promise.all(
        Array.from(kpiIds).map(async (kpiId) => {
          // null allowlist short-circuits the category lookup (parity / admin).
          if (allowlist != null) {
            const kpi = await this.prisma.kPI.findFirst({
              where: { organizationId: link.organizationId, id: kpiId },
              select: { categoryId: true },
            });
            if (!isCategoryAllowed(allowlist, kpi?.categoryId ?? null)) {
              // Restricted: omit entirely — the value must not be exposed publicly.
              return;
            }
          }

          // Organisation-level rows only (BE-047). The reader has no account:
          // a per-unit or per-person KPI on a shared board must not surface
          // whichever unit's or person's value happened to be recorded last.
          const where: Prisma.KPIDataPointWhereInput = {
            organizationId: link.organizationId,
            kpiId,
            orgUnitId: null,
            userId: null,
          };
          // Apply the creator's history-window lower bound only when set; an older
          // point is omitted (latestValue becomes null/absent) for the public viewer.
          if (windowFrom) where.recordedAt = { gte: windowFrom };

          const point = await this.prisma.kPIDataPoint.findFirst({
            where,
            // Newest period first ("latest" = newest period; entry time breaks ties).
            orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
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
        ...(await this.publicView(link.organizationId, dashboard.widgets, kpiIds, allowlist, windowFrom)),
      };
    });
  }

  /**
   * What the widgets need to be drawn as widgets rather than as bare numbers.
   * Gated exactly as `kpiValues` is — the link creator's category allowlist
   * and history window — and narrower in one respect: history, health, list
   * rows and strategy-map counts are built from ORGANISATION-WIDE KPIs only.
   * A per-unit or per-person KPI contributes its name and target and nothing
   * recorded, so no unit's or person's values reach a reader with no account.
   */
  private async publicView(
    organizationId: string,
    widgets: ReadonlyArray<{ widgetType: string; config: unknown }>,
    widgetKpiIds: ReadonlySet<string>,
    allowlist: readonly string[] | null,
    windowFrom: Date | undefined,
  ): Promise<Pick<ShareLinkResolvedPayload, 'kpis' | 'listRows' | 'perspectives'>> {
    const listSize = publicListSize(widgets);
    const wantsMap = widgets.some((w) => w.widgetType === 'strategy_map');
    const wantsSummary = listSize !== null || wantsMap;
    if (widgetKpiIds.size === 0 && !wantsSummary) return { kpis: {} };

    const select = {
      id: true,
      name: true,
      scope: true,
      unit: true,
      direction: true,
      targetValue: true,
      warningThreshold: true,
      criticalThreshold: true,
      scorecardQuadrant: true,
      categoryId: true,
    } satisfies Prisma.KPISelect;
    // The widgets' own KPIs are always looked up; the organisation-wide set
    // (for list rows and strategy-map counts) is capped separately, so a large
    // catalogue can never push a widget's KPI out of the result.
    const [pointedAt, summarised] = await Promise.all([
      widgetKpiIds.size > 0
        ? this.prisma.kPI.findMany({ where: { organizationId, deletedAt: null, id: { in: [...widgetKpiIds] } }, select })
        : [],
      wantsSummary
        ? this.prisma.kPI.findMany({
            where: { organizationId, deletedAt: null, scope: 'ORG_WIDE' },
            select,
            orderBy: { name: 'asc' },
            take: MAX_PUBLIC_SUMMARY_KPIS,
          })
        : [],
    ]);
    const found = [...new Map([...pointedAt, ...summarised].map((k) => [k.id, k])).values()];
    const allowed = found.filter((k) => isCategoryAllowed(allowlist, k.categoryId));
    const orgWide = allowed.filter((k) => k.scope === 'ORG_WIDE');

    const bandRows = orgWide.length
      ? await this.prisma.kPIThresholdBand.findMany({
          where: { organizationId, kpiId: { in: orgWide.map((k) => k.id) } },
          select: { kpiId: true, name: true, lower: true, upper: true, color: true, order: true, consecutivePointsRequired: true },
        })
      : [];

    // Newest period first, organisation-level rows only.
    const measured = new Map<string, { status: KpiHealthStatus; points: Array<{ value: number; recordedAt: Date; periodStart: Date }> }>();
    await Promise.all(
      orgWide.map(async (kpi) => {
        const points = await this.prisma.kPIDataPoint.findMany({
          where: {
            organizationId,
            kpiId: kpi.id,
            orgUnitId: null,
            userId: null,
            ...(windowFrom ? { recordedAt: { gte: windowFrom } } : {}),
          },
          select: { value: true, recordedAt: true, periodStart: true },
          orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
          take: PUBLIC_SERIES_POINTS,
        });
        measured.set(kpi.id, {
          points,
          status: kpiHealthStatus({
            recentValues: points.slice(0, 10).map((p) => p.value),
            meta: kpi,
            bands: bandRows.filter((b) => b.kpiId === kpi.id),
          }),
        });
      }),
    );

    const kpis: ShareLinkResolvedPayload['kpis'] = {};
    for (const kpi of allowed) {
      if (!widgetKpiIds.has(kpi.id)) continue;
      const data = measured.get(kpi.id);
      kpis[kpi.id] = {
        name: kpi.name,
        unit: kpi.unit,
        direction: kpi.direction,
        targetValue: kpi.targetValue,
        warningThreshold: kpi.warningThreshold,
        criticalThreshold: kpi.criticalThreshold,
        status: data?.status ?? null,
        series: data ? [...data.points].reverse() : [],
      };
    }
    if (!wantsSummary) return { kpis };

    const rows: SummaryRow[] = orgWide.map((kpi) => {
      const data = measured.get(kpi.id);
      const latestValue = data?.points[0]?.value ?? null;
      return {
        kpiId: kpi.id,
        name: kpi.name,
        unit: kpi.unit,
        latestValue,
        status: data?.status ?? 'NO_DATA',
        attainmentPct: attainmentPct(latestValue, kpi.targetValue, kpi.direction),
        scorecardQuadrant: kpi.scorecardQuadrant,
      };
    });
    return {
      kpis,
      ...(listSize !== null ? { listRows: publicListRows(rows, listSize) } : {}),
      ...(wantsMap ? { perspectives: perspectiveCounts(rows) } : {}),
    };
  }

  /**
   * Resolve the Layer-3 + Layer-4 restrictions of the user who created a share
   * link, as seen under that creator's own request context. The public
   * `resolve()` path runs unauthenticated under `runWithBypass`, so there is no
   * principal to resolve from — we re-establish the creator's request context
   * (org + user + role) and ask the shared `AccessContextService`, ensuring the
   * public payload is gated by exactly the restrictions the creator is subject
   * to:
   *   - `allowlist`: KPI category allowlist (`null` ⇒ all / admin = parity).
   *   - `historyWindowDays`: data-limit window (`null` ⇒ unbounded = parity).
   *
   * Both are resolved in a single re-established context. A deleted/missing
   * creator can't vouch for anything — fail closed: deny all categories (`[]`)
   * but leave the window unbounded (`null`) since the empty allowlist already
   * suppresses every value.
   */
  private async resolveCreatorLimits(
    organizationId: string,
    createdById: string,
  ): Promise<{
    allowlist: readonly string[] | null;
    historyWindowDays: number | null;
  }> {
    const creator = await this.prisma.user.findFirst({
      where: { id: createdById, organizationId },
      select: { id: true, roleId: true },
    });
    // A deleted/missing creator can't vouch for any category — fail closed.
    if (!creator) return { allowlist: [], historyWindowDays: null };

    return RequestContextStore.run(
      {
        userId: creator.id,
        organizationId,
        roleId: creator.roleId,
        principalType: 'user',
      },
      async () => {
        const allowlist = await this.accessContext.kpiCategoryAllowlist();
        const limits = await this.accessContext.dataLimits();
        return { allowlist, historyWindowDays: limits.historyWindowDays };
      },
    );
  }
}
