/**
 * SSRF guard for tenant-supplied URLs (audit BE-016).
 *
 * Uses a real local HTTP listener on 127.0.0.1 as the stand-in "internal
 * service": the guard must refuse to reach it unless explicitly allow-listed,
 * including via DNS names that resolve to loopback and via redirects.
 */
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { OutboundUrlBlockedError, isBlockedAddress, outboundFetch, validateOutboundUrl } from './outbound-fetch.js';

let server: Server;
let port: number;
let hits: string[];

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? '');
    if (req.url === '/redirect-to-metadata') {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
      res.end();
      return;
    }
    if (req.url === '/redirect-to-self') {
      res.writeHead(302, { location: `http://127.0.0.1:${port}/ok` });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.close();
});
beforeEach(() => {
  hits = [];
  vi.unstubAllEnvs();
});

describe('isBlockedAddress', () => {
  test.each([
    '127.0.0.1', '127.255.0.9', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.18.0.1',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
  ])('%s is blocked', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  test.each(['93.184.216.34', '8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111'])('%s is allowed', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('outboundFetch', () => {
  test('refuses a loopback IP literal and never connects', async () => {
    await expect(outboundFetch(`http://127.0.0.1:${port}/ok`)).rejects.toBeInstanceOf(OutboundUrlBlockedError);
    expect(hits).toEqual([]);
  });

  test('refuses cloud metadata and private literals', async () => {
    for (const url of ['http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/', 'http://[::1]/', 'http://0.0.0.0/']) {
      await expect(outboundFetch(url), url).rejects.toBeInstanceOf(OutboundUrlBlockedError);
    }
  });

  test('refuses a hostname that RESOLVES to loopback (checked at connect time)', async () => {
    await expect(outboundFetch(`http://localhost:${port}/ok`)).rejects.toBeInstanceOf(OutboundUrlBlockedError);
    expect(hits).toEqual([]);
  });

  test('connect-time DNS guard: a name that slips past the name check (`localhost.`) is still refused', async () => {
    await expect(outboundFetch(`http://localhost.:${port}/ok`)).rejects.toBeInstanceOf(OutboundUrlBlockedError);
    expect(hits).toEqual([]);
  });

  test('IPv4-mapped IPv6 literal for loopback is refused', async () => {
    await expect(outboundFetch(`http://[::ffff:127.0.0.1]:${port}/ok`)).rejects.toBeInstanceOf(OutboundUrlBlockedError);
    expect(hits).toEqual([]);
  });

  test('refuses non-http(s) schemes', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/', 'gopher://example.com/', 'data:text/plain,hi']) {
      await expect(outboundFetch(url), url).rejects.toBeInstanceOf(OutboundUrlBlockedError);
    }
  });

  test('OUTBOUND_ALLOWED_HOSTS lets a specific internal host through', async () => {
    vi.stubEnv('OUTBOUND_ALLOWED_HOSTS', '127.0.0.1');
    const res = await outboundFetch(`http://127.0.0.1:${port}/ok`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test('every redirect hop is re-checked: allowed host → metadata IP is refused', async () => {
    vi.stubEnv('OUTBOUND_ALLOWED_HOSTS', '127.0.0.1');
    await expect(outboundFetch(`http://127.0.0.1:${port}/redirect-to-metadata`)).rejects.toBeInstanceOf(OutboundUrlBlockedError);
  });

  test('redirects between allowed hosts are followed', async () => {
    vi.stubEnv('OUTBOUND_ALLOWED_HOSTS', '127.0.0.1');
    const res = await outboundFetch(`http://127.0.0.1:${port}/redirect-to-self`);
    expect(res.status).toBe(200);
    expect(hits).toEqual(['/redirect-to-self', '/ok']);
  });
});

describe('validateOutboundUrl (create-time check)', () => {
  test.each([
    ['http://127.0.0.1:9000/hook'],
    ['http://localhost/hook'],
    ['http://169.254.169.254/'],
    ['javascript:alert(1)'],
    ['not a url'],
  ])('rejects %s', async (url) => {
    await expect(validateOutboundUrl(url)).rejects.toBeInstanceOf(OutboundUrlBlockedError);
  });

  test('accepts a public https URL', async () => {
    await expect(validateOutboundUrl('https://93.184.216.34/hook')).resolves.toBeUndefined();
  });

  test('accepts a host that does not resolve yet (delivery-time guard still applies)', async () => {
    await expect(validateOutboundUrl('https://hooks.not-yet-registered.invalid/x')).resolves.toBeUndefined();
  });
});
