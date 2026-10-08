import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { attachRedisErrorLogger } from './redis-error-logger.js';

describe('attachRedisErrorLogger (BE-005)', () => {
  it('handles the error event, so ioredis stops reporting it as unhandled', () => {
    const client = new EventEmitter();
    attachRedisErrorLogger(client, { warn: vi.fn() }, 'test');
    // An EventEmitter with no 'error' listener throws on emit.
    expect(() => client.emit('error', new Error('read ECONNRESET'))).not.toThrow();
  });

  it('logs the first error, then at most once per window while Redis stays down', () => {
    const client = new EventEmitter();
    const logger = { warn: vi.fn() };
    let now = 0;
    attachRedisErrorLogger(client, logger, 'rate-limit', { windowMs: 30_000, now: () => now });

    client.emit('error', new Error('ECONNREFUSED'));
    now = 1_000;
    client.emit('error', new Error('ECONNREFUSED'));
    now = 29_000;
    client.emit('error', new Error('ECONNREFUSED'));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]![0]).toContain('rate-limit');
    expect(logger.warn.mock.calls[0]![0]).toContain('ECONNREFUSED');

    now = 31_000;
    client.emit('error', new Error('ECONNREFUSED'));
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn.mock.calls[1]![0]).toContain('2 more');
  });
});
