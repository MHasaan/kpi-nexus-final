import { describe, expect, it } from 'vitest';

import { type MlSignedRequest, signMlRequest } from './ml-signature.js';

const BASE: MlSignedRequest = {
  tenantId: 'org_test',
  tsMs: 1700000000000,
  method: 'POST',
  path: '/forecast',
  body: '{"values":[1,2,3],"horizon":7}',
};

describe('signMlRequest (must match the Python sidecar compute_signature)', () => {
  it('reproduces the Python sidecar signature byte-for-byte', () => {
    // Reference computed by apps/ml app.middleware.hmac_auth.compute_signature(
    //   'dev-ml-shared-secret', 'org_test', 1700000000000, 'POST', '/forecast',
    //   b'{"values":[1,2,3],"horizon":7}') — same vector as apps/ml/tests/test_hmac.py.
    expect(signMlRequest('dev-ml-shared-secret', BASE)).toBe(
      '6403642190ea8cf62b4db487df4d61ec79394b07c757b2002a39ba54fba3364d',
    );
  });

  it('binds tenant, timestamp, method, path and body (BE-024)', () => {
    const a = signMlRequest('s', BASE);
    for (const change of [
      { tenantId: 'org_other' },
      { tsMs: BASE.tsMs + 1 },
      { method: 'PUT' },
      { path: '/whatif' },
      { body: '{"values":[1,2,3],"horizon":365}' },
    ]) {
      expect(signMlRequest('s', { ...BASE, ...change })).not.toBe(a);
    }
  });

  it('is hex SHA-256 (64 chars)', () => {
    expect(signMlRequest('secret', BASE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('depends on the secret', () => {
    expect(signMlRequest('s1', BASE)).not.toBe(signMlRequest('s2', BASE));
  });
});
