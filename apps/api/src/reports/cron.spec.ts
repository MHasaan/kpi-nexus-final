import { describe, expect, test } from 'vitest';

import { CreateScheduledReportDtoSchema, UpdateScheduledReportDtoSchema } from './dto/reports.dto.js';
import { isValidCron } from './cron.js';

// BE-019: "every tuesday" passed the DTO (length check only), the row was
// inserted, then BullMQ rejected the pattern → 500 + an orphaned "active"
// report that never runs. Validate with BullMQ's own parser, up front.
describe('isValidCron', () => {
  test.each(['0 8 * * 1', '*/15 * * * *', '0 0 1 * *', '30 9 * * MON-FRI', '0 0 8 * * 1'])('accepts %s', (c) => {
    expect(isValidCron(c)).toBe(true);
  });

  test.each(['every tuesday', '61 * * * *', '0 8 * *', '0 8 * * 1 * *', '', '   '])('rejects %j', (c) => {
    expect(isValidCron(c)).toBe(false);
  });
});

describe('scheduled-report DTOs reject an invalid cron (→ 400 before any write)', () => {
  const base = { name: 'Weekly', format: 'PDF', recipients: ['a@b.co'] };

  test('create', () => {
    expect(CreateScheduledReportDtoSchema.safeParse({ ...base, cron: 'every tuesday' }).success).toBe(false);
    expect(CreateScheduledReportDtoSchema.safeParse({ ...base, cron: '0 8 * * 1' }).success).toBe(true);
  });

  test('update', () => {
    expect(UpdateScheduledReportDtoSchema.safeParse({ cron: '61 * * * *' }).success).toBe(false);
    expect(UpdateScheduledReportDtoSchema.safeParse({ cron: '0 8 * * 1' }).success).toBe(true);
    expect(UpdateScheduledReportDtoSchema.safeParse({ name: 'no cron change' }).success).toBe(true);
  });
});
