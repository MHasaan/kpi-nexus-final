import { describe, expect, test } from 'vitest';
import type { Job } from 'bullmq';

import { EchoProcessor, type EchoJobData } from './echo.processor.js';

describe('EchoProcessor', () => {
  test('echoes the job message back', async () => {
    const processor = new EchoProcessor();
    const job = {
      id: 'job-1',
      data: { message: 'hello' },
    } as Job<EchoJobData>;

    const result = await processor.process(job);

    expect(result).toEqual({ id: 'job-1', received: 'hello' });
  });

  test('handles jobs with missing id gracefully', async () => {
    const processor = new EchoProcessor();
    const job = {
      data: { message: 'no-id' },
    } as Job<EchoJobData>;

    const result = await processor.process(job);

    expect(result).toEqual({ id: '', received: 'no-id' });
  });
});
