import { describe, expect, test, vi } from 'vitest';

import {
  NotificationDigestService,
  DIGEST_WINDOW_MS,
} from './notification-digest.service.js';

describe('NotificationDigestService', () => {
  test('uses a deterministic, colon-free jobId so calls collapse in-window', () => {
    const svc = new NotificationDigestService({ add: vi.fn() } as unknown as never);
    const id = svc.digestJobId('org_1', 'user_9');
    expect(id).toBe('digest-org_1-user_9');
    expect(id).not.toContain(':');
  });

  test('enqueues a delayed job with the deterministic jobId (collapse key)', async () => {
    const add = vi.fn(
      async (_name: string, _data: unknown, _opts: { delay: number; jobId: string }) => ({}),
    );
    const svc = new NotificationDigestService({ add } as unknown as never);

    await svc.enqueueDigest('org_1', 'user_9');
    await svc.enqueueDigest('org_1', 'user_9'); // second call within window

    expect(add).toHaveBeenCalledTimes(2);
    for (const call of add.mock.calls) {
      const opts = call[2] as { delay: number; jobId: string };
      expect(opts.delay).toBe(DIGEST_WINDOW_MS);
      expect(opts.jobId).toBe('digest-org_1-user_9');
    }
    // BullMQ dedupes by jobId — both enqueues target the same scheduled job,
    // so 5 alerts in the window collapse to one digest.
  });
});
