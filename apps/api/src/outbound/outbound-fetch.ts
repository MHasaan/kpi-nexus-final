import { type LookupAddress, lookup as dnsLookup } from 'node:dns';
import { BlockList, isIP } from 'node:net';

import { Agent, type RequestInit, type Response, fetch as undiciFetch } from 'undici';

/**
 * SSRF-safe fetch for tenant-supplied URLs (webhooks, notification channels,
 * connectors) — audit BE-016.
 *
 * - only http/https;
 * - IP literals in private / loopback / link-local / CGNAT / multicast /
 *   reserved ranges are refused before connecting;
 * - hostnames are checked AT CONNECT TIME via the agent's DNS lookup, so a
 *   name that resolves to an internal address (or rebinds to one) is refused;
 * - redirects are followed manually (max 5) and every hop is re-checked.
 *
 * `OUTBOUND_ALLOWED_HOSTS` (comma-separated hostnames / IPs) explicitly allows
 * specific internal targets, e.g. a local test receiver in development.
 */
export class OutboundUrlBlockedError extends Error {
  constructor(
    readonly url: string,
    readonly reason: string,
  ) {
    super(`Outbound request to ${safeForMessage(url)} blocked: ${reason}`);
    this.name = 'OutboundUrlBlockedError';
  }
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.168.0.0', 16],
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64 (embeds IPv4)
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

/** True for any address an outbound tenant request must never reach. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return blocked.check(ip, 'ipv4');
  if (family === 6) {
    // BlockList maps ::ffff:a.b.c.d onto the IPv4 rules.
    return blocked.check(ip, 'ipv6');
  }
  return true; // not an IP at all — never treat as safe
}

function allowedHosts(): Set<string> {
  return new Set(
    (process.env.OUTBOUND_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

/** Synchronous checks that need no DNS: scheme, allow-list, IP literals. */
function checkTarget(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OutboundUrlBlockedError(raw, 'not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OutboundUrlBlockedError(raw, `scheme ${url.protocol} is not allowed (http/https only)`);
  }
  const host = hostOf(url);
  if (allowedHosts().has(host)) return url;
  if (isIP(host) && isBlockedAddress(host)) {
    throw new OutboundUrlBlockedError(raw, 'address is private, loopback, link-local or reserved');
  }
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new OutboundUrlBlockedError(raw, 'localhost is not allowed');
  }
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** DNS lookup used by the agent: refuses names that resolve to blocked addresses. */
function guardedLookup(hostname: string, options: { all?: boolean } & object, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    if (!allowedHosts().has(hostname.toLowerCase()) && list.some((a) => isBlockedAddress(a.address))) {
      return callback(new OutboundUrlBlockedError(`//${hostname}`, 'host resolves to an internal address'), []);
    }
    if (options.all) return callback(null, list);
    const first = list[0];
    if (!first) return callback(Object.assign(new Error(`no address for ${hostname}`), { code: 'ENOTFOUND' }), []);
    return callback(null, first.address, first.family);
  });
}

const agent = new Agent({ connect: { lookup: guardedLookup as never } });

function unwrapBlocked(err: unknown): OutboundUrlBlockedError | undefined {
  for (let e: unknown = err, i = 0; e && i < 5; e = (e as { cause?: unknown }).cause, i++) {
    if (e instanceof OutboundUrlBlockedError) return e;
  }
  return undefined;
}

const MAX_REDIRECTS = 5;

/** fetch() for tenant-supplied URLs. Throws OutboundUrlBlockedError when refused. */
export async function outboundFetch(raw: string, init: RequestInit = {}): Promise<Response> {
  let url = checkTarget(raw);
  let req: RequestInit = { ...init };
  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await undiciFetch(url, { ...req, redirect: 'manual', dispatcher: agent });
    } catch (err) {
      throw unwrapBlocked(err) ?? err;
    }
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return res;
    if (hop >= MAX_REDIRECTS) throw new OutboundUrlBlockedError(raw, 'too many redirects');
    url = checkTarget(new URL(location, url).toString());
    if (res.status === 301 || res.status === 302 || res.status === 303) {
      const { body: _body, ...rest } = req;
      req = { ...rest, method: 'GET' };
    }
  }
}

/**
 * Create-time validation for a tenant-supplied URL: scheme, literal IPs, and
 * (for hostnames) that it doesn't currently resolve to an internal address.
 * A name that doesn't resolve yet is accepted — customers often register a
 * webhook before its DNS exists; outboundFetch re-checks at delivery time.
 */
export async function validateOutboundUrl(raw: string): Promise<void> {
  const url = checkTarget(raw);
  const host = hostOf(url);
  if (isIP(host) || allowedHosts().has(host)) return;
  const addresses = await new Promise<LookupAddress[]>((resolve) =>
    dnsLookup(host, { all: true }, (err, list) => resolve(err ? [] : list)),
  );
  if (addresses.some((a) => isBlockedAddress(a.address))) {
    throw new OutboundUrlBlockedError(raw, 'host resolves to an internal address');
  }
}

function safeForMessage(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return raw.slice(0, 60);
  }
}
