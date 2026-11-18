/**
 * Plan 7.7: a finished report's download link was a storage address signed once,
 * when the report ran, and good for seven days. After that the link on the page
 * was dead although the file was still there. A fresh one is now made on request.
 */
import { NotFoundException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { reportFileKey } from './report-file-key.js';
import { ReportDownloadService } from './report-download.service.js';
import type { ScheduledReportService } from './scheduled-report.service.js';
import type { StorageService } from './services/storage.service.js';

const ctx: RequestContext = { organizationId: 'org_a', userId: 'u1', roleId: null, principalType: 'user' };

function make(run: Record<string, unknown> | null, reportVisible = true) {
  const scheduledReports = {
    get: vi.fn(async () => {
      if (!reportVisible) throw new NotFoundException();
      return { id: 'rep_1' };
    }),
  };
  const prisma = { reportRun: { findFirst: vi.fn(async () => run) } };
  const storage = { getDownloadUrl: vi.fn(async (key: string, seconds?: number) => `https://files.test/${key}?good-for=${seconds}`) };
  const service = new ReportDownloadService(
    prisma as unknown as PrismaService,
    scheduledReports as unknown as ScheduledReportService,
    storage as unknown as StorageService,
  );
  return { service, prisma, storage, scheduledReports };
}

describe('reportFileKey', () => {
  test('names the file by organisation, run and format', () => {
    expect(reportFileKey('org_a', 'run_1', 'PDF')).toBe('reports/org_a/run_1.pdf');
    expect(reportFileKey('org_a', 'run_1', 'EXCEL')).toBe('reports/org_a/run_1.xlsx');
    expect(reportFileKey('org_a', 'run_1', 'CSV')).toBe('reports/org_a/run_1.csv');
  });
});

describe('ReportDownloadService.freshUrl', () => {
  test('signs a new, short-lived address for a finished run of a report the caller can see', async () => {
    const { service, prisma, storage } = make({ id: 'run_1', status: 'SUCCEEDED', format: 'PDF', fileUrl: 'https://old' });
    const out = await RequestContextStore.run(ctx, () => service.freshUrl('rep_1', 'run_1'));
    expect(storage.getDownloadUrl).toHaveBeenCalledWith('reports/org_a/run_1.pdf', 300);
    expect(out).toEqual({ url: 'https://files.test/reports/org_a/run_1.pdf?good-for=300' });
    // The run is looked up inside the caller's organisation and under that report.
    expect(prisma.reportRun.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { id: 'run_1', scheduledReportId: 'rep_1', organizationId: 'org_a' },
    });
  });

  test('a report the caller cannot see is not found, and nothing is signed', async () => {
    const { service, storage } = make({ id: 'run_1', status: 'SUCCEEDED', format: 'PDF', fileUrl: 'x' }, false);
    await expect(RequestContextStore.run(ctx, () => service.freshUrl('rep_1', 'run_1'))).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.getDownloadUrl).not.toHaveBeenCalled();
  });

  test('a run that does not exist, failed, or left no file has nothing to download', async () => {
    for (const run of [null, { id: 'run_1', status: 'FAILED', format: 'PDF', fileUrl: null }, { id: 'run_1', status: 'SUCCEEDED', format: 'PDF', fileUrl: null }]) {
      const { service, storage } = make(run);
      await expect(RequestContextStore.run(ctx, () => service.freshUrl('rep_1', 'run_1'))).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.getDownloadUrl).not.toHaveBeenCalled();
    }
  });
});
