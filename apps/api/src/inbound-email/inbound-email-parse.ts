import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Pure helpers for the inbound-email webhook. No Nest/Prisma so they are
 * unit-testable in isolation.
 */

export type InboundEntityType = 'kpi' | 'alert' | 'task';

export interface InboundTarget {
  type: InboundEntityType;
  id: string;
}

/** Timing-safe HMAC-SHA256 verification of the raw request body. */
export function verifyInboundSignature(secret: string, body: string, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Plus-addressing: inbound+<type>-<id>@host, optionally inside a `Name <addr>`.
const ADDRESS_RE = /inbound\+(kpi|alert|task)-([^@\s>]+)@/i;

export function parseInboundAddress(to: string): InboundTarget | null {
  const match = to.match(ADDRESS_RE);
  if (!match) return null;
  return { type: match[1]!.toLowerCase() as InboundEntityType, id: match[2]! };
}

/** Pull the bare email out of a `From` header (handles `Name <addr>`). */
export function extractEmailAddress(from: string): string {
  const angle = from.match(/<([^>]+)>/);
  return (angle ? angle[1]! : from).trim().toLowerCase();
}

/**
 * Strip a quoted reply: cut at the first `> ` quote line or an
 * "On … wrote:" attribution boundary, and trim.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^\s*On .*wrote:\s*$/.test(line)) break;
    kept.push(line);
  }
  return kept.join('\n').trim();
}
