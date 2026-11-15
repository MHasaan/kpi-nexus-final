/**
 * `/kpi` in Slack. Answers come only from a Slack user who has linked their
 * KPI Nexus account, and run AS that account: the KPIs and values shown are
 * the ones they may see in the web app. Everything is ephemeral (only the
 * asker sees it). An unknown workspace or unlinked user learns nothing.
 */
import { describe, expect, it, vi } from 'vitest';

import type { KpiDataService } from '../../kpis/kpi-data.service.js';
import type { KpisService } from '../../kpis/kpis.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AccessContextService } from '../../rbac/services/access-context.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';
import { SlackCommandService } from './slack-command.service.js';
import { signSlackLinkToken, verifySlackLinkToken } from './slack-link-token.js';
import type { SlackCommandProducer } from './slack-command.producer.js';

const SECRET = 'link-secret';

function make(opts: { linked?: boolean; userStatus?: string; capabilities?: string[]; teamKnown?: boolean } = {}) {
  const seen: Array<string | undefined> = [];
  const prisma = {
    integrationConnection: { findFirst: vi.fn(async () => ((opts.teamKnown ?? true) ? { organizationId: 'org_1' } : null)) },
    slackUserLink: {
      findFirst: vi.fn(async () => ((opts.linked ?? true) ? { userId: 'user_1' } : null)),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    user: { findFirst: vi.fn(async () => ({ id: 'user_1', roleId: 'role_1', status: opts.userStatus ?? 'ACTIVE', isActive: true })) },
  };
  const kpis = {
    list: vi.fn(async () => {
      seen.push(RequestContextStore.get()?.userId);
      return [
        { id: 'k1', name: 'Monthly Recurring Revenue' },
        { id: 'k2', name: 'Churn Rate' },
      ];
    }),
  };
  const kpiData = {
    dashboardSummary: vi.fn(async () => [
      { kpiId: 'k1', name: 'Monthly Recurring Revenue', unit: 'USD', latestValue: 498000, targetValue: 450000, latestRecordedAt: new Date('2026-11-01') },
      { kpiId: 'k2', name: 'Churn Rate', unit: '%', latestValue: 2.1, targetValue: 2, latestRecordedAt: new Date('2026-11-01') },
    ]),
  };
  const accessContext = { resolveForCurrentPrincipal: vi.fn(async () => ({ isAdmin: false, capabilities: opts.capabilities ?? ['KPI_VIEW', 'INSIGHTS_VIEW'] })) };
  const producer = { enqueueAsk: vi.fn(async () => {}) };
  const svc = new SlackCommandService(
    prisma as unknown as PrismaService,
    kpis as unknown as KpisService,
    kpiData as unknown as KpiDataService,
    accessContext as unknown as AccessContextService,
    producer as unknown as SlackCommandProducer,
    { linkSecret: SECRET, webAppUrl: (p: string) => `https://app.example.test${p}` },
  );
  return { svc, prisma, kpis, producer, seen };
}

const cmd = (text: string) => ({ teamId: 'T1', slackUserId: 'U1', text, responseUrl: 'https://hooks.slack.com/commands/T1/1/abc' });

describe('SlackCommandService', () => {
  it('an unconnected workspace learns nothing', async () => {
    const { svc, kpis } = make({ teamKnown: false });
    const res = await svc.handle(cmd('revenue'));
    expect(res).toMatchObject({ response_type: 'ephemeral' });
    expect(res.text).toMatch(/isn't connected to KPI Nexus/);
    expect(kpis.list).not.toHaveBeenCalled();
  });

  it('an unlinked Slack user gets a private, signed, expiring link, and no data', async () => {
    const { svc, kpis } = make({ linked: false });
    const res = await svc.handle(cmd('revenue'));
    expect(res.response_type).toBe('ephemeral');
    expect(kpis.list).not.toHaveBeenCalled();
    const url = /https:\/\/app\.example\.test\/integrations\/slack\/link\?token=([^|>]+)/.exec(res.text)?.[1];
    expect(url).toBeDefined();
    expect(verifySlackLinkToken(decodeURIComponent(url!), SECRET)).toEqual({ organizationId: 'org_1', teamId: 'T1', slackUserId: 'U1' });
  });

  it('a linked user\'s /kpi <name> runs as that user and shows matching KPIs with their values, privately', async () => {
    const { svc, seen } = make();
    const res = await svc.handle(cmd('revenue'));
    expect(seen).toEqual(['user_1']);
    expect(res.response_type).toBe('ephemeral');
    const json = JSON.stringify(res);
    expect(json).toContain('Monthly Recurring Revenue');
    expect(json).toContain('498,000');
    expect(json).not.toContain('Churn Rate');
  });

  it('no match says so', async () => {
    const { svc } = make();
    const res = await svc.handle(cmd('headcount'));
    expect(res.text).toMatch(/No KPI you can see matches "headcount"/);
  });

  it('a user without KPI_VIEW, or no longer active, gets no data', async () => {
    const noPerm = make({ capabilities: [] });
    expect((await noPerm.svc.handle(cmd('revenue'))).text).toMatch(/permission/);
    expect(noPerm.kpis.list).not.toHaveBeenCalled();
    const suspended = make({ userStatus: 'SUSPENDED' });
    expect((await suspended.svc.handle(cmd('revenue'))).text).toMatch(/not active/);
    expect(suspended.kpis.list).not.toHaveBeenCalled();
  });

  it('/kpi ask <question> is queued (NLQ takes longer than Slack waits) and needs INSIGHTS_VIEW', async () => {
    const { svc, producer } = make();
    const res = await svc.handle(cmd('ask how is revenue trending?'));
    expect(res.text).toMatch(/Thinking/);
    expect(producer.enqueueAsk).toHaveBeenCalledWith({
      organizationId: 'org_1', userId: 'user_1', question: 'how is revenue trending?', responseUrl: 'https://hooks.slack.com/commands/T1/1/abc',
    });
    const noInsights = make({ capabilities: ['KPI_VIEW'] });
    expect((await noInsights.svc.handle(cmd('ask anything'))).text).toMatch(/permission/);
    expect(noInsights.producer.enqueueAsk).not.toHaveBeenCalled();
  });

  it('refuses a response_url that is not Slack\'s', async () => {
    const { svc, producer } = make();
    const res = await svc.handle({ ...cmd('ask hi'), responseUrl: 'https://evil.example/collect' });
    expect(res.text).toMatch(/couldn't/i);
    expect(producer.enqueueAsk).not.toHaveBeenCalled();
  });

  it('/kpi unlink removes the link; /kpi help (or nothing) shows usage', async () => {
    const { svc, prisma } = make();
    expect((await svc.handle(cmd('unlink'))).text).toMatch(/unlinked/i);
    expect(prisma.slackUserLink.deleteMany).toHaveBeenCalledWith({ where: { slackTeamId: 'T1', slackUserId: 'U1' } });
    expect((await svc.handle(cmd(''))).text).toMatch(/\/kpi <name>/);
  });
});

describe('SlackCommandService.linkAccount', () => {
  const as = <T>(userId: string, organizationId: string, fn: () => Promise<T>) =>
    RequestContextStore.run({ userId, organizationId, roleId: 'r', principalType: 'user' }, fn) as Promise<T>;
  const token = () => signSlackLinkToken({ organizationId: 'org_1', teamId: 'T1', slackUserId: 'U1' }, SECRET);

  it('links the Slack user to the signed-in account of the same org', async () => {
    const { svc, prisma } = make({ linked: false });
    (prisma.slackUserLink as unknown as Record<string, unknown>).upsert = vi.fn(async () => ({}));
    await expect(as('user_7', 'org_1', () => svc.linkAccount(token()))).resolves.toEqual({ linked: true });
    expect((prisma.slackUserLink as unknown as { upsert: ReturnType<typeof vi.fn> }).upsert).toHaveBeenCalledWith({
      where: { slackTeamId_slackUserId: { slackTeamId: 'T1', slackUserId: 'U1' } },
      create: { organizationId: 'org_1', slackTeamId: 'T1', slackUserId: 'U1', userId: 'user_7' },
      update: { organizationId: 'org_1', userId: 'user_7' },
    });
  });

  it('refuses a token for another organization (403) or a bad / expired one (400)', async () => {
    const { svc } = make({ linked: false });
    await expect(as('user_7', 'org_2', () => svc.linkAccount(token()))).rejects.toMatchObject({ status: 403 });
    await expect(as('user_7', 'org_1', () => svc.linkAccount('garbage'))).rejects.toMatchObject({ status: 400 });
  });
});
