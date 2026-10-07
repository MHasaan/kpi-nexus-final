/**
 * OT-014: once Postgres RLS is enforced, a query with NO tenant context sees
 * nothing. These entry points run before a request context exists (credential
 * lookups, webhooks, scheduled cleanup, platform-admin views), so each must
 * establish one explicitly:
 *  - cross-tenant lookups (credential by hash, connection by id, entity by id,
 *    draft sweep, platform-wide admin list) → RequestContextStore.runWithBypass
 *  - work for an already-resolved tenant → RequestContextStore.run({ org })
 * Each mock records the context it ran under.
 */
import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { AlertsService } from '../alerts/alerts.service.js';
import { ApiKeysService } from '../api-keys/api-keys.service.js';
import type { AuthService } from '../auth/auth.service.js';
import type { CommentsService } from '../comments/comments.service.js';
import { InboundEmailService } from '../inbound-email/inbound-email.service.js';
import { IntegrationCryptoService } from '../integrations/integration-crypto.service.js';
import { JiraService } from '../integrations/providers/jira.service.js';
import { SlackService } from '../integrations/providers/slack.service.js';
import { OnboardingService } from '../onboarding/onboarding.service.js';
import type { OrgTemplatesService } from '../org-templates/org-templates.service.js';
import { PlatformAdminService } from '../platform-admin/platform-admin.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ScimTokenService } from '../scim/scim-token.service.js';
import { RequestContextStore } from './request-context.js';

type Seen = { bypass: boolean; org: string | undefined };
const seen: Seen[] = [];
/** A prisma method mock that records the ambient context, then returns `value`. */
const spy = <T>(value: T) =>
  vi.fn(async () => {
    const ctx = RequestContextStore.get();
    seen.push({ bypass: ctx?.bypassRls === true, org: ctx?.organizationId });
    return value;
  });
const reset = () => seen.splice(0, seen.length);

describe('pre-tenant entry points establish a tenancy context (OT-014)', () => {
  test('ApiKeysService.verify — key lookup by hash runs under bypass', async () => {
    reset();
    const prisma = {
      apiKey: {
        findUnique: spy({ id: 'k1', organizationId: 'org_a', scopes: [], revokedAt: null, expiresAt: null }),
        update: spy({}),
      },
    };
    const service = new ApiKeysService(prisma as unknown as PrismaService, {} as AuditService);
    await expect(service.verify('kpinx_abc')).resolves.toMatchObject({ organizationId: 'org_a' });
    await Promise.resolve(); // let the fire-and-forget lastUsedAt bump run
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen.every((s) => s.bypass)).toBe(true);
  });

  test('ScimTokenService.verifyAndResolve — token lookup by hash runs under bypass', async () => {
    reset();
    const prisma = {
      scimToken: {
        findFirst: spy({ id: 's1', organizationId: 'org_a', revokedAt: null, expiresAt: null }),
        update: spy({}),
      },
    };
    const service = new ScimTokenService(prisma as unknown as PrismaService, {} as AuditService);
    await expect(service.verifyAndResolve('scim_abc')).resolves.toBe('org_a');
    expect(seen).toEqual([
      { bypass: true, org: expect.anything() },
      { bypass: true, org: expect.anything() },
    ]);
  });

  test('SlackService — team→org resolution under bypass, the ack in the resolved org', async () => {
    reset();
    const prisma = { integrationConnection: { findFirst: spy({ organizationId: 'org_a' }) } };
    const alerts = { acknowledge: spy({}) };
    const service = new SlackService(prisma as unknown as PrismaService, alerts as unknown as AlertsService);
    await service.handleInteractive({ team: { id: 'T1' }, actions: [{ action_id: 'acknowledge_alert', value: 'al_1' }] });
    expect(seen).toEqual([
      { bypass: true, org: expect.anything() },
      { bypass: false, org: 'org_a' },
    ]);
  });

  test('JiraService — connection lookup under bypass, task find/update in the connection\'s org', async () => {
    reset();
    const crypto = new IntegrationCryptoService({ INTEGRATION_CRYPTO_KEY: 'unit-test-key' });
    const prisma = {
      integrationConnection: {
        findFirst: spy({ organizationId: 'org_a', encryptedTokens: crypto.encrypt({ webhookSecret: 'whsec' }) }),
      },
      task: { findFirst: spy({ id: 't1' }), update: spy({}) },
    };
    const service = new JiraService(prisma as unknown as PrismaService, crypto);
    await expect(
      service.handleWebhook('conn_1', 'whsec', { issue: { key: 'KP-1', fields: { status: { name: 'Done' } } } }),
    ).resolves.toEqual({ updated: true });
    expect(seen).toEqual([
      { bypass: true, org: expect.anything() },
      { bypass: false, org: 'org_a' },
      { bypass: false, org: 'org_a' },
    ]);
  });

  test('InboundEmailService — entity→org and sender lookups under bypass', async () => {
    reset();
    const prisma = {
      kPI: { findUnique: spy({ organizationId: 'org_a' }) },
      user: { findFirst: spy({ id: 'user_alice' }) },
    };
    const comments = { create: vi.fn(async () => ({ id: 'c1' })) };
    const service = new InboundEmailService(prisma as unknown as PrismaService, comments as unknown as CommentsService, {});
    const payload = { to: 'inbound+kpi-kpi_1@mail.host', from: 'Alice <alice@x.test>', subject: 's', text: 'hi' };
    await service.handle(payload, { rawBody: JSON.stringify(payload), signature: '' });
    expect(seen).toEqual([
      { bypass: true, org: expect.anything() },
      { bypass: true, org: expect.anything() },
    ]);
  });

  test('OnboardingService.cleanupStale — the cross-tenant draft sweep runs under bypass', async () => {
    reset();
    const prisma = { onboardingSession: { updateMany: spy({ count: 2 }) } };
    const service = new OnboardingService(
      prisma as unknown as PrismaService,
      {} as AuthService,
      {} as OrgTemplatesService,
    );
    await expect(service.cleanupStale(30)).resolves.toEqual({ cleaned: 2 });
    expect(seen).toEqual([{ bypass: true, org: expect.anything() }]);
  });

  test('PlatformAdminService.list — platform-wide (admins span tenants) runs under bypass', async () => {
    reset();
    const prisma = {
      platformAdmin: {
        findMany: spy([{ userId: 'u1', user: { email: 'a@x', fullName: 'A' }, grantedAt: new Date(0), grantedBy: null }]),
      },
    };
    const service = new PlatformAdminService(prisma as unknown as PrismaService);
    await expect(service.list()).resolves.toHaveLength(1);
    expect(seen).toEqual([{ bypass: true, org: expect.anything() }]);
  });
});
