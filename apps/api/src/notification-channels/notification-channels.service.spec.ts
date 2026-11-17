/**
 * Plan 4.7: "Send test" answered 202 { sent: true } whenever the adapter did
 * not throw — including an email channel with no recipients and SMS, which
 * send nothing — and a 500 with no explanation when it did throw.
 */
import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import { NonRetryableDeliveryError, type NotificationAdaptersService } from '../notifications/notification-adapters.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { NotificationChannelsService } from './notification-channels.service.js';
import { decryptConfig, encryptConfig } from './notification-crypto.js';

const ORG = 'org_1';

interface Row {
  id: string;
  organizationId: string;
  name: string;
  kind: string;
  isActive: boolean;
  config: string;
  createdAt: Date;
  updatedAt: Date;
}

function make(rows: Array<Partial<Omit<Row, 'config'>> & { id: string; kind: string; config: Record<string, unknown> }> = []) {
  const store: Row[] = rows.map((r) => ({
    organizationId: ORG,
    name: r.id,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...r,
    config: encryptConfig(r.config),
  }));
  const prisma = {
    notificationChannel: {
      findMany: vi.fn(async ({ where }: { where: { organizationId: string } }) => store.filter((r) => r.organizationId === where.organizationId)),
      findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) => store.find((r) => r.id === where.id && r.organizationId === where.organizationId) ?? null),
      create: vi.fn(async ({ data }: { data: { organizationId: string; name: string; kind: string; config: string } }) => {
        const row: Row = { id: `ch_${store.length + 1}`, isActive: true, createdAt: new Date(), updatedAt: new Date(), ...data };
        store.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = store.find((r) => r.id === where.id)!;
        for (const [key, value] of Object.entries(data)) if (value !== undefined) (row as unknown as Record<string, unknown>)[key] = value;
        return row;
      }),
    },
  };
  const audit = { record: vi.fn(async () => {}) };
  const adapters = { send: vi.fn(async (_kind: string, _config: Record<string, unknown>, _payload: unknown) => {}) };
  const service = new NotificationChannelsService(prisma as unknown as PrismaService, audit as unknown as AuditService, adapters as unknown as NotificationAdaptersService);
  return { service, adapters, store };
}

const asAdmin = <T>(fn: () => Promise<T>): Promise<T> =>
  Promise.resolve(RequestContextStore.run({ userId: 'u1', organizationId: ORG, roleId: 'r1', principalType: 'user' }, fn));

describe('NotificationChannelsService.test', () => {
  test('a message that left is reported as sent', async () => {
    const { service, adapters } = make([{ id: 'ch_mail', kind: 'EMAIL', config: { recipients: ['ops@acme.test'] } }]);
    expect(await asAdmin(() => service.test('ch_mail'))).toEqual({ sent: true });
    expect(adapters.send).toHaveBeenCalledOnce();
  });

  test('a delivery the other side refused is an answer with the reason, not an exception', async () => {
    const { service, adapters } = make([{ id: 'ch_hook', kind: 'WEBHOOK', config: { url: 'https://hooks.acme.test/in' } }]);
    adapters.send.mockRejectedValueOnce(new NonRetryableDeliveryError('Delivery rejected with 404'));
    expect(await asAdmin(() => service.test('ch_hook'))).toEqual({ sent: false, error: 'Delivery rejected with 404' });
  });

  test('a network failure is an answer too', async () => {
    const { service, adapters } = make([{ id: 'ch_hook', kind: 'WEBHOOK', config: { url: 'https://hooks.acme.test/in' } }]);
    adapters.send.mockRejectedValueOnce(new Error('Delivery network error: ECONNREFUSED'));
    expect(await asAdmin(() => service.test('ch_hook'))).toEqual({ sent: false, error: 'Delivery network error: ECONNREFUSED' });
  });

  test('an email channel with nobody to send to does not claim it sent', async () => {
    const { service, adapters } = make([{ id: 'ch_empty', kind: 'EMAIL', config: {} }]);
    const result = await asAdmin(() => service.test('ch_empty'));
    expect(result).toEqual({ sent: false, error: 'Add at least one email address for this channel to send to.' });
    expect(adapters.send).not.toHaveBeenCalled();
  });

  test('SMS says it is not connected', async () => {
    const { service, adapters } = make([{ id: 'ch_sms', kind: 'SMS', config: { fromNumber: '+15551234567' } }]);
    const result = await asAdmin(() => service.test('ch_sms'));
    expect(result.sent).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining('SMS is not connected') });
    expect(adapters.send).not.toHaveBeenCalled();
  });

  test("another organisation's channel is not found", async () => {
    const { service } = make([{ id: 'ch_theirs', kind: 'IN_APP', config: {}, organizationId: 'org_2' }]);
    await expect(asAdmin(() => service.test('ch_theirs'))).rejects.toMatchObject({ status: 404 });
  });
});

describe('NotificationChannelsService — saving', () => {
  test('an email channel with no recipients is refused, in words', async () => {
    const { service, store } = make();
    await expect(asAdmin(() => service.create({ name: 'Ops', kind: 'EMAIL', config: { recipients: [] } }))).rejects.toMatchObject({
      status: 400,
      response: { message: 'Add at least one email address for this channel to send to.' },
    });
    expect(store).toHaveLength(0);
  });

  test('a saved channel says where it sends, and never returns its config', async () => {
    const { service } = make();
    const created = await asAdmin(() => service.create({ name: 'Ops', kind: 'EMAIL', config: { recipients: ['ops@acme.test', 'oncall@acme.test'] } }));
    expect(created.target).toBe('ops@acme.test, oncall@acme.test');
    expect('config' in created).toBe(false);
  });

  test('a webhook URL is shown as its host only — the rest is the credential', async () => {
    const { service } = make([{ id: 'ch_slack', kind: 'SLACK', config: { webhookUrl: 'https://hooks.slack.test/services/T0/B0/secret-token' } }]);
    const [listed] = await asAdmin(() => service.list());
    expect(listed!.target).toBe('hooks.slack.test');
    expect(JSON.stringify(listed)).not.toContain('secret-token');
  });

  test('changing the recipients checks them against the kind the channel already is', async () => {
    const { service, store } = make([{ id: 'ch_mail', kind: 'EMAIL', config: { recipients: ['ops@acme.test'] } }]);
    await expect(asAdmin(() => service.update('ch_mail', { config: { recipients: ['nope'] } }))).rejects.toMatchObject({ status: 400 });
    const updated = await asAdmin(() => service.update('ch_mail', { name: 'Ops team', config: { recipients: ['new@acme.test'] } }));
    expect(updated).toMatchObject({ name: 'Ops team', target: 'new@acme.test' });
    expect(decryptConfig(store[0]!.config)).toEqual({ recipients: ['new@acme.test'] });
  });

  test('renaming alone leaves where it sends untouched', async () => {
    const { service, store } = make([{ id: 'ch_mail', kind: 'EMAIL', config: { recipients: ['ops@acme.test'] } }]);
    const before = store[0]!.config;
    const updated = await asAdmin(() => service.update('ch_mail', { name: 'Renamed' }));
    expect(updated).toMatchObject({ name: 'Renamed', target: 'ops@acme.test' });
    expect(store[0]!.config).toBe(before);
  });
});
