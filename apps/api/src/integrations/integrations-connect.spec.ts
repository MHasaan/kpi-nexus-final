/**
 * Connecting an integration (plan 6.10, UI-015). "Connect" used to store a
 * connection with no credentials for any provider name, marked CONNECTED.
 */
import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { IntegrationCryptoService } from './integration-crypto.service.js';
import { IntegrationsService } from './integrations.service.js';

interface Conn {
  id: string;
  organizationId: string;
  provider: string;
  displayName: string | null;
  encryptedTokens: string;
  status: string;
  metadata: Record<string, unknown> | null;
}

function make(existing: Conn[] = []) {
  const conns = [...existing];
  const prisma = {
    integrationConnection: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; organizationId?: string; provider?: string; metadata?: { equals: string } } }) =>
        conns.find(
          (c) =>
            (where.id === undefined || c.id === where.id) &&
            (where.organizationId === undefined || c.organizationId === where.organizationId) &&
            (where.provider === undefined || c.provider === where.provider) &&
            (where.metadata === undefined || c.metadata?.team_id === where.metadata.equals),
        ) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Partial<Conn> }) => {
        const c = { id: `conn_${conns.length + 1}`, displayName: null, metadata: null, ...data } as Conn;
        conns.push(c);
        return c;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Conn> }) => Object.assign(conns.find((c) => c.id === where.id)!, data)),
    },
  };
  // "Encryption" that can be read back in the test.
  const crypto = { encrypt: (value: unknown) => JSON.stringify(value), decrypt: (value: string) => JSON.parse(value) as unknown };
  const audit = { record: vi.fn(async () => undefined) };
  const service = new IntegrationsService(prisma as unknown as PrismaService, audit as unknown as AuditService, crypto as unknown as IntegrationCryptoService);
  return { service, conns };
}

const asOrg = <T>(organizationId: string, fn: () => Promise<T>) =>
  RequestContextStore.run({ userId: 'admin', organizationId, roleId: null, principalType: 'user' }, fn) as Promise<T>;
const slack = (organizationId: string, teamId: string): Conn => ({ id: `s-${organizationId}`, organizationId, provider: 'slack', displayName: 'Slack', encryptedTokens: '{}', status: 'CONNECTED', metadata: { team_id: teamId } });

describe('IntegrationsService.connect', () => {
  test('Slack: the workspace id is stored, and the connection waits for Slack to be heard from', async () => {
    const { service, conns } = make();
    const out = await asOrg('org-a', () => service.connect({ provider: 'slack', teamId: 'T0ABC123' }));
    expect(out.connection).toMatchObject({ provider: 'slack', status: 'PENDING', metadata: { team_id: 'T0ABC123' } });
    expect(out.webhookSecret).toBeUndefined();
    expect(conns).toHaveLength(1);
  });

  test('Slack: without a workspace id, or with something that is not one, nothing is stored', async () => {
    const { service, conns } = make();
    await expect(asOrg('org-a', () => service.connect({ provider: 'slack' }))).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    await expect(asOrg('org-a', () => service.connect({ provider: 'slack', teamId: 'my workspace' }))).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    expect(conns).toHaveLength(0);
  });

  test("Slack: a workspace another organisation has connected cannot be claimed — its commands would reach the wrong organisation", async () => {
    const { service, conns } = make([slack('org-b', 'T0ABC123')]);
    await expect(asOrg('org-a', () => service.connect({ provider: 'slack', teamId: 'T0ABC123' }))).rejects.toMatchObject({ response: { code: 'CONFLICT' } });
    expect(conns).toHaveLength(1);
  });

  test('one connection per provider: connecting Slack twice is refused', async () => {
    const { service } = make([slack('org-a', 'T0ABC123')]);
    await expect(asOrg('org-a', () => service.connect({ provider: 'slack', teamId: 'T0OTHER99' }))).rejects.toMatchObject({ response: { code: 'CONFLICT' } });
  });

  test('Jira: a webhook secret is made, stored encrypted and returned once', async () => {
    const { service, conns } = make();
    const out = await asOrg('org-a', () => service.connect({ provider: 'jira' }));
    expect(out.connection).toMatchObject({ provider: 'jira', status: 'PENDING' });
    expect(out.webhookSecret).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(JSON.parse(conns[0]!.encryptedTokens)).toEqual({ webhookSecret: out.webhookSecret });
    // The stored connection that is listed carries no secret.
    expect(JSON.stringify(out.connection)).not.toContain(out.webhookSecret!);
  });

  test('a provider with nothing behind it is refused — it used to be stored as "connected"', async () => {
    const { service, conns } = make();
    for (const provider of ['teams', 'webhooks', 'apikeys', 'emailin', 'anything']) {
      await expect(asOrg('org-a', () => service.connect({ provider }))).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    }
    expect(conns).toHaveLength(0);
  });
});

describe('IntegrationsService.rotateWebhookSecret', () => {
  test('Jira: a new secret replaces the old one and is returned once', async () => {
    const { service, conns } = make();
    const first = await asOrg('org-a', () => service.connect({ provider: 'jira' }));
    const second = await asOrg('org-a', () => service.rotateWebhookSecret(first.connection.id));
    expect(second.webhookSecret).not.toBe(first.webhookSecret);
    expect(JSON.parse(conns[0]!.encryptedTokens)).toEqual({ webhookSecret: second.webhookSecret });
  });

  test('only a Jira connection has a webhook secret', async () => {
    const { service } = make([slack('org-a', 'T0ABC123')]);
    await expect(asOrg('org-a', () => service.rotateWebhookSecret('s-org-a'))).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
  });
});
