import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { reportFileKey } from './report-file-key.js';
import { ScheduledReportService } from './scheduled-report.service.js';
import { StorageService } from './services/storage.service.js';

/** How long a download address handed out on request stays good: long enough to start the download. */
const FRESH_LINK_SECONDS = 300;

/**
 * A download address for a finished report run, signed when it is asked for.
 * The address stored on the run was signed when the report ran and stops
 * working after seven days, though the file is still there.
 */
@Injectable()
export class ReportDownloadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduledReports: ScheduledReportService,
    private readonly storage: StorageService,
  ) {}

  async freshUrl(scheduledReportId: string, runId: string): Promise<{ url: string }> {
    const ctx = RequestContextStore.require();
    // The report first: it carries the organisation and who-may-see-it rules, and answers 404 itself.
    await this.scheduledReports.get(scheduledReportId);
    const run = await this.prisma.reportRun.findFirst({
      where: { id: runId, scheduledReportId, organizationId: ctx.organizationId },
      select: { id: true, status: true, format: true, fileUrl: true },
    });
    if (!run || run.status !== 'SUCCEEDED' || !run.fileUrl) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'This run has no file to download' });
    }
    const url = await this.storage.getDownloadUrl(reportFileKey(ctx.organizationId, run.id, run.format), FRESH_LINK_SECONDS);
    return { url };
  }
}
