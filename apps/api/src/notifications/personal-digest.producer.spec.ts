/**
 * The digest run is hourly, so that each person's digest can go out at 07:00
 * on their own clock (since 2026-11-20). The daily run registered
 * by earlier versions must not stay behind: it would be a second run at 07:00
 * UTC, racing the hourly one.
 */
import { describe, expect, test, vi } from 'vitest';

import { PERSONAL_DIGEST_CRON, PERSONAL_DIGEST_JOB, PersonalDigestProducer } from './personal-digest.producer.js';

function fakeQueue(existing: Array<{ key: string; id: string | null; name: string; pattern: string }>) {
  return {
    getRepeatableJobs: vi.fn(async () => existing),
    removeRepeatableByKey: vi.fn(async (_key: string) => true),
    add: vi.fn(async (_name: string, _data: unknown, _opts: Record<string, unknown>) => ({})),
  };
}

describe('PersonalDigestProducer', () => {
  test('runs every hour', () => {
    expect(PERSONAL_DIGEST_CRON).toBe('0 * * * *');
  });

  test('removes the daily run an earlier version registered, and registers the hourly one', async () => {
    const queue = fakeQueue([
      { key: 'old-daily', id: PERSONAL_DIGEST_JOB, name: PERSONAL_DIGEST_JOB, pattern: '0 7 * * *' },
      { key: 'someone-else', id: 'other-job', name: 'other-job', pattern: '0 7 * * *' },
    ]);
    await new PersonalDigestProducer(queue as never).onModuleInit();
    expect(queue.removeRepeatableByKey).toHaveBeenCalledTimes(1);
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('old-daily');
    expect(queue.add).toHaveBeenCalledWith(PERSONAL_DIGEST_JOB, {}, expect.objectContaining({ repeat: { pattern: '0 * * * *' }, jobId: PERSONAL_DIGEST_JOB }));
  });

  test('leaves the hourly run alone when it is already there', async () => {
    const queue = fakeQueue([{ key: 'hourly', id: PERSONAL_DIGEST_JOB, name: PERSONAL_DIGEST_JOB, pattern: '0 * * * *' }]);
    await new PersonalDigestProducer(queue as never).onModuleInit();
    expect(queue.removeRepeatableByKey).not.toHaveBeenCalled();
  });

  test('without Redis at boot it does not crash', async () => {
    const queue = fakeQueue([]);
    queue.getRepeatableJobs.mockRejectedValue(new Error('no redis'));
    await expect(new PersonalDigestProducer(queue as never).onModuleInit()).resolves.toBeUndefined();
  });
});
