/**
 * Pure inbound-email helpers. 9 cases: HMAC signature valid/invalid, plus-
 * addressing parse (kpi/alert/task/invalid), quoted-reply stripping.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'vitest';

import {
  extractEmailAddress,
  parseInboundAddress,
  stripQuotedReply,
  verifyInboundSignature,
} from './inbound-email-parse.js';

const SECRET = 'inbound-test-secret';
function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

describe('verifyInboundSignature', () => {
  test('accepts a correct HMAC-SHA256 signature', () => {
    const body = JSON.stringify({ to: 'x', text: 'hi' });
    expect(verifyInboundSignature(SECRET, body, sign(body))).toBe(true);
  });
  test('rejects a wrong signature', () => {
    const body = JSON.stringify({ to: 'x', text: 'hi' });
    expect(verifyInboundSignature(SECRET, body, sign('tampered'))).toBe(false);
  });
  test('rejects a malformed signature without throwing', () => {
    expect(verifyInboundSignature(SECRET, 'body', 'not-hex!!')).toBe(false);
  });
});

describe('parseInboundAddress', () => {
  test('parses inbound+kpi-<id>', () => {
    expect(parseInboundAddress('inbound+kpi-abc123@mail.kpinexus.com')).toEqual({ type: 'kpi', id: 'abc123' });
  });
  test('parses inbound+alert-<id> with a display name', () => {
    expect(parseInboundAddress('Bot <inbound+alert-al_9@mail.host>')).toEqual({ type: 'alert', id: 'al_9' });
  });
  test('parses inbound+task-<id>', () => {
    expect(parseInboundAddress('inbound+task-t_1@host')).toEqual({ type: 'task', id: 't_1' });
  });
  test('returns null for a non-plus address', () => {
    expect(parseInboundAddress('support@host.com')).toBeNull();
    expect(parseInboundAddress('inbound+widget-1@host')).toBeNull();
  });
});

describe('stripQuotedReply', () => {
  test('drops > quoted lines', () => {
    const text = 'My reply here\n> previous line 1\n> previous line 2';
    expect(stripQuotedReply(text)).toBe('My reply here');
  });
  test('cuts at an "On … wrote:" boundary', () => {
    const text = 'Thanks, looks good\n\nOn Mon, May 30, 2026 at 9:00 AM Alice <a@x> wrote:\nthe original message';
    expect(stripQuotedReply(text)).toBe('Thanks, looks good');
  });
  test('returns plain text unchanged (trimmed)', () => {
    expect(stripQuotedReply('  just a comment  ')).toBe('just a comment');
  });
});

describe('extractEmailAddress', () => {
  test('pulls the address out of a Name <addr> header', () => {
    expect(extractEmailAddress('Alice Smith <Alice@Example.com>')).toBe('alice@example.com');
  });
  test('returns a bare address lowercased', () => {
    expect(extractEmailAddress('Bob@Host.COM')).toBe('bob@host.com');
  });
});
