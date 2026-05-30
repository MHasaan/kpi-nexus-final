import { describe, expect, it } from 'vitest';

import { signMlRequest } from './ml-signature.js';

describe('signMlRequest (must match the Python sidecar compute_signature)', () => {
  it('reproduces the Python sidecar signature byte-for-byte', () => {
    // Reference computed by apps/ml app.middleware.hmac_auth.compute_signature(
    //   'dev-ml-shared-secret', 'org_test', 1700000000000)
    expect(signMlRequest('dev-ml-shared-secret', 'org_test', 1700000000000)).toBe(
      'd2328677c744ff3dde62f31be7604ecf4175fd5c9cab974ffdfa07e6aeb5f9bc',
    );
  });

  it('signs the message as `${tsMs}.${tenantId}`', () => {
    // Different tenant or timestamp → different signature.
    const a = signMlRequest('s', 'orgA', 1);
    const b = signMlRequest('s', 'orgB', 1);
    const c = signMlRequest('s', 'orgA', 2);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('is hex SHA-256 (64 chars)', () => {
    expect(signMlRequest('secret', 'org', 1700000000000)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('depends on the secret', () => {
    expect(signMlRequest('s1', 'org', 1)).not.toBe(signMlRequest('s2', 'org', 1));
  });
});
