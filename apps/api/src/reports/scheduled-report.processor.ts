import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { ScheduledReport } from '@kpi-nexus/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { EmailService } from '../email/email.service.js';
import { ReportsService } from './reports.service.js';
import { StorageService } from './services/storage.service.js';
import type { ScheduledReportJobData } from './scheduled-report.service.js';

// Extension lookup table for file naming.
const FORMAT_EXT: Record<string, string> = {
  CSV: 'csv',
  EXCEL: 'xlsx',
  PDF: 'pdf',
};

/**
 * P3.7 — ScheduledReportProcessor.
 * Runs inside the API process. Pulls jobs from the 'scheduled-report' BullMQ queue.
 *
 * Context strategy:
 *   The processor has no HTTP request, so there is no TenancyInterceptor to
 *   populate RequestContextStore. We run in two phases:
 *
 *   Phase 1 — look up the ScheduledReport and its creator's roleId under a
 *   minimal system context (userId='scheduler-system', roleId=null).
 *
 *   Phase 2 — run the actual generation AS THE REPORT'S CREATOR
 *   (userId=createdById, roleId=creator's roleId). This is critical: report
 *   data is fetched through KpiDataService.dashboardSummary, which applies the
 *   §6 per-user KPI visibility filter. Running as the creator means an
 *   admin-created report sees every KPI it should, and a manager-created report
 *   sees exactly what that manager can see — the visibility model is preserved
 *   end-to-end rather than bypassed. A roleless sentinel would see only
 *   ORG_WIDE KPIs and silently drop PER_UNIT/PER_USER data from reports.
 *
 *   bypassRls=true is set in both phases so Prisma's RLS middleware passes (the
 *   API connects as the schema owner); the organizationId filter is still
 *   applied explicitly in every query. We use `run()` (not `runWithBypass`,
 *   which hard-codes organizationId='platform-bypass') so that
 *   `RequestContextStore.require()` sees the correct organizationId.
 */
@Processor('scheduled-report')
export class ScheduledReportProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledReportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly storage: StorageService,
    private readonly email: EmailService,
  ) {
    super();
  }

  async process(job: Job<ScheduledReportJobData>): Promise<void> {
    const { scheduledReportId, organizationId } = job.data;
    this.logger.log(
      `Processing scheduled-report job ${job.id ?? '?'} — report ${scheduledReportId} org ${organizationId}`,
    );

    // Phase 1 — load the report + creator role under a minimal system context.
    const loaded = await RequestContextStore.run(
      {
        userId: 'scheduler-system',
        organizationId,
        roleId: null,
        principalType: 'user',
        bypassRls: true,
      },
      async () => {
        const report = await this.prisma.scheduledReport.findFirst({
          where: { id: scheduledReportId, organizationId },
        });
        if (!report) return null;
        const creator = await this.prisma.user.findFirst({
          where: { id: report.createdById, organizationId },
          select: { roleId: true },
        });
        return { report, creatorRoleId: creator?.roleId ?? null };
      },
    );

    if (!loaded) {
      this.logger.warn(`ScheduledReport ${scheduledReportId} not found — skipping`);
      return;
    }
    if (!loaded.report.isActive) {
      this.logger.log(`ScheduledReport ${scheduledReportId} is inactive — skipping`);
      return;
    }

    // Phase 2 — run generation as the report's creator so the §6 visibility
    // filter resolves the KPI set the creator intended.
    await RequestContextStore.run(
      {
        userId: loaded.report.createdById,
        organizationId,
        roleId: loaded.creatorRoleId,
        principalType: 'user',
        bypassRls: true,
      },
      async () => {
        await this.runReport(loaded.report, organizationId);
      },
    );
  }

  private async runReport(
    scheduledReport: ScheduledReport,
    organizationId: string,
  ): Promise<void> {
    const scheduledReportId = scheduledReport.id;

    // Create the ReportRun row (RUNNING).
    const run = await this.prisma.reportRun.create({
      data: {
        organizationId,
        scheduledReportId,
        status: 'RUNNING',
        format: scheduledReport.format,
        startedAt: new Date(),
      },
    });

    try {
      // Generate the report buffer.
      const { buffer, contentType } = await this.reports.generate({
        format: scheduledReport.format,
        dashboardId: scheduledReport.dashboardId ?? undefined,
        kpiIds: scheduledReport.kpiIds.length > 0 ? scheduledReport.kpiIds : undefined,
      });

      // Upload to MinIO/S3.
      const ext = FORMAT_EXT[scheduledReport.format] ?? 'bin';
      const key = `reports/${organizationId}/${run.id}.${ext}`;
      await this.storage.upload(key, buffer, contentType);
      const fileUrl = await this.storage.getDownloadUrl(key);

      // Email recipients.
      if (scheduledReport.recipients.length > 0) {
        const downloadHtml = `<p>Your scheduled report "<strong>${scheduledReport.name}</strong>" is ready.</p>
<p><a href="${fileUrl}">Download report</a> (link valid for 7 days)</p>`;
        await this.email.send({
          to: scheduledReport.recipients,
          subject: `Your scheduled report: ${scheduledReport.name}`,
          html: downloadHtml,
          text: `Your scheduled report "${scheduledReport.name}" is ready. Download: ${fileUrl}`,
        });
      }

      // Mark run SUCCEEDED.
      await this.prisma.reportRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCEEDED',
          fileUrl,
          finishedAt: new Date(),
        },
      });

      // Update lastRunAt on the scheduled report.
      await this.prisma.scheduledReport.update({
        where: { id: scheduledReportId },
        data: { lastRunAt: new Date() },
      });

      this.logger.log(
        `ScheduledReport ${scheduledReportId} run ${run.id} completed — file: ${key}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `ScheduledReport ${scheduledReportId} run ${run.id} FAILED: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );

      // Mark run FAILED — do not swallow so BullMQ records the failure.
      await this.prisma.reportRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          error: message,
          finishedAt: new Date(),
        },
      });

      // Rethrow so BullMQ records this as a job failure.
      throw err;
    }
  }
}
