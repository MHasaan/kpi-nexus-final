import { describe, expect, it } from 'vitest';

import { resolveRateLimit } from './rate-limit-policy.js';

describe('resolveRateLimit', () => {
  it('applies a strict per-IP limit to auth routes', () => {
    const p = resolveRateLimit('/auth/login', '1.2.3.4', 'org1');
    expect(p.limit).toBe(10);
    expect(p.windowSec).toBe(60);
    expect(p.bucketKey).toBe('rl:auth:1.2.3.4');
  });

  it('treats /auth subpaths as auth routes', () => {
    expect(resolveRateLimit('/auth/password/request-reset', '9.9.9.9', null).bucketKey).toBe('rl:auth:9.9.9.9');
  });

  it('applies a generous per-org limit to non-auth routes', () => {
    const p = resolveRateLimit('/kpis', '1.2.3.4', 'org1');
    expect(p.limit).toBe(600);
    expect(p.windowSec).toBe(60);
    expect(p.bucketKey).toBe('rl:org:org1');
  });

  it('falls back to IP bucket for non-auth routes without an org', () => {
    expect(resolveRateLimit('/health', '5.5.5.5', null).bucketKey).toBe('rl:org:5.5.5.5');
  });
});
