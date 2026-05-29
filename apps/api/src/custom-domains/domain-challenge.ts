import { createHash } from 'node:crypto';

/** Normalize a user-entered domain to a bare lowercase host. */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .trim();
}

export interface DomainChallenge {
  key: string; // the DNS TXT record name to create
  value: string; // the expected TXT record value
}

/**
 * Deterministic DNS-TXT ownership challenge for a domain + org. Pure — unit
 * tested. The org verifies ownership by publishing `value` at the TXT name `key`.
 */
export function buildChallenge(domain: string, organizationId: string): DomainChallenge {
  const host = normalizeDomain(domain);
  const digest = createHash('sha256').update(`${organizationId}:${host}`).digest('hex').slice(0, 32);
  return { key: `_kpinexus-challenge.${host}`, value: `kpinexus-verify=${digest}` };
}
