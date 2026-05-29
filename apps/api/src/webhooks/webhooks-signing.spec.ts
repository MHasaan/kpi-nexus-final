import { describe, expect, it } from 'vitest';

import {
  computeSignature,
  parseSignatureHeader,
  signWebhook,
  verifyWebhookSignature,
} from './webhooks-signing.js';

const SECRET = 'whsec_testsecret';
const BODY = JSON.stringify({ event: 'alert_triggered', alertId: 'a1' });
const TS = 1_780_000_000;

describe('webhooks-signing', () => {
  it('signWebhook produces a t=,v1= header that verifies', () => {
    const header = signWebhook(SECRET, TS, BODY);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]+$/);
    expect(verifyWebhookSignature(SECRET, header, BODY, { nowSeconds: TS })).toBe(true);
  });

  it('rejects a tampered body', () => {
    const header = signWebhook(SECRET, TS, BODY);
    expect(verifyWebhookSignature(SECRET, header, BODY + 'x', { nowSeconds: TS })).toBe(false);
  });

  it('rejects a wrong signature digest', () => {
    const header = `t=${TS},v1=${'0'.repeat(64)}`;
    expect(verifyWebhookSignature(SECRET, header, BODY, { nowSeconds: TS })).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const header = signWebhook(SECRET, TS, BODY);
    expect(verifyWebhookSignature('whsec_other', header, BODY, { nowSeconds: TS })).toBe(false);
  });

  it('rejects when timestamp drift exceeds tolerance', () => {
    const header = signWebhook(SECRET, TS, BODY);
    // 10 minutes later, default window is 5 minutes
    expect(verifyWebhookSignature(SECRET, header, BODY, { nowSeconds: TS + 600 })).toBe(false);
  });

  it('accepts within tolerance', () => {
    const header = signWebhook(SECRET, TS, BODY);
    expect(verifyWebhookSignature(SECRET, header, BODY, { nowSeconds: TS + 120 })).toBe(true);
  });

  it('rejects missing / malformed header', () => {
    expect(verifyWebhookSignature(SECRET, undefined, BODY, { nowSeconds: TS })).toBe(false);
    expect(verifyWebhookSignature(SECRET, 'garbage', BODY, { nowSeconds: TS })).toBe(false);
    expect(verifyWebhookSignature(SECRET, `t=${TS}`, BODY, { nowSeconds: TS })).toBe(false);
  });

  it('rejects a partial-prefix signature (constant-time length guard)', () => {
    const full = computeSignature(SECRET, TS, BODY);
    const header = `t=${TS},v1=${full.slice(0, 32)}`; // half-length
    expect(verifyWebhookSignature(SECRET, header, BODY, { nowSeconds: TS })).toBe(false);
  });

  it('parseSignatureHeader extracts t and v1', () => {
    const parts = parseSignatureHeader(`t=${TS},v1=abcdef`);
    expect(parts).toEqual({ timestamp: TS, v1: 'abcdef' });
    expect(parseSignatureHeader('')).toBeNull();
    expect(parseSignatureHeader('v1=abc')).toBeNull(); // missing t
  });
});
