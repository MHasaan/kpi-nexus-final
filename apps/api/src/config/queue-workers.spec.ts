import { describe, expect, it } from 'vitest';

import { queueProcessors, queueWorkersEnabled } from './queue-workers.js';

class FakeProcessor {}

describe('queueWorkersEnabled', () => {
  it('runs the processors in the API by default', () => {
    expect(queueWorkersEnabled({})).toBe(true);
  });

  it('honors RUN_QUEUE_WORKERS=true and =false', () => {
    expect(queueWorkersEnabled({ RUN_QUEUE_WORKERS: 'true' })).toBe(true);
    expect(queueWorkersEnabled({ RUN_QUEUE_WORKERS: 'false' })).toBe(false);
  });

  it('rejects any other value so a typo cannot silently stop every job', () => {
    expect(() => queueWorkersEnabled({ RUN_QUEUE_WORKERS: 'maybe' })).toThrow(/RUN_QUEUE_WORKERS/);
    expect(() => queueWorkersEnabled({ RUN_QUEUE_WORKERS: 'off' })).toThrow(/RUN_QUEUE_WORKERS/);
  });

  it('always runs the processors in the worker process', () => {
    expect(queueWorkersEnabled({ KPI_PROCESS_ROLE: 'worker' })).toBe(true);
    expect(queueWorkersEnabled({ KPI_PROCESS_ROLE: 'worker', RUN_QUEUE_WORKERS: 'true' })).toBe(true);
  });

  it('refuses a worker process told not to run workers', () => {
    expect(() => queueWorkersEnabled({ KPI_PROCESS_ROLE: 'worker', RUN_QUEUE_WORKERS: 'false' })).toThrow(
      /worker/,
    );
  });
});

describe('queueProcessors', () => {
  it('returns the processors when workers are enabled', () => {
    expect(queueProcessors([FakeProcessor], {})).toEqual([FakeProcessor]);
  });

  it('returns nothing when workers are disabled', () => {
    expect(queueProcessors([FakeProcessor], { RUN_QUEUE_WORKERS: 'false' })).toEqual([]);
  });
});
