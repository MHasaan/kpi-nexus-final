/**
 * Flow walk (the invited person): the invitation email gave its expiry as a raw
 * "Thu, 26 Nov 2026 08:53:40 GMT". It is now written on the organisation's
 * clock, in its date format, and says which clock that is.
 */
import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import type { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { UsersService } from './users.service.js';

const ctx = { organizationId: 'org-1', userId: 'caller' } as RequestContext;

function make(org: Record<string, unknown>) {
  const tx = {
    user: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'u-1', ...data })) },
    emailVerificationToken: { create: vi.fn(async () => ({})) },
  };
  const prisma = {
    position: { findFirst: vi.fn(async () => null) },
    user: {
      // Asked twice: is the address taken (no), and who is inviting.
      findUnique: vi.fn(async ({ where }: { where: { id?: string } }) => (where.id === 'caller' ? { fullName: 'Omar Founder' } : null)),
      findFirst: vi.fn(async () => null),
    },
    organization: { findUnique: vi.fn(async () => org) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const send = vi.fn(async (_mail: { to: string; subject: string; html: string; text: string }) => undefined);
  const service = new UsersService(
    prisma as unknown as PrismaService,
    { record: vi.fn(async () => undefined) } as unknown as AuditService,
    {} as PermissionResolverService,
    { resolveForCurrentPrincipal: vi.fn(async () => ({ isAdmin: true })) } as unknown as AccessContextService,
    { send } as never,
    { assertWithinQuota: vi.fn(async () => undefined) } as never,
  );
  const invite = () => RequestContextStore.run(ctx, () => service.invite({ email: 'bilal@example.test', fullName: 'Bilal Sales' }));
  return { invite, send };
}

describe('UsersService.invite — when the link runs out, in the email', () => {
  test("is written on the organisation's clock, in its date format, and names the clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T08:53:40.000Z'));
    try {
      const { invite, send } = make({ name: 'Walk Four Foods', timezone: 'Asia/Karachi', locale: 'en-US', dateFormat: 'DD/MM/YYYY', numberFormat: 'en-US', currency: 'PKR' });
      await invite();
      const mail = send.mock.calls[0]![0];
      // Seven days on, 08:53 UTC is 13:53 in Karachi.
      expect(mail.text).toContain('Expires: 26/11/2026 13:53 (Asia/Karachi)');
      expect(mail.html).toContain('This link expires on 26/11/2026 13:53 (Asia/Karachi).');
      expect(mail.text).not.toContain('GMT');
      expect(mail.html).not.toContain('GMT');
    } finally {
      vi.useRealTimers();
    }
  });

  test('an organisation with nothing set gets UTC, and is told it is UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T08:53:40.000Z'));
    try {
      const { invite, send } = make({ name: 'Org' });
      await invite();
      expect(send.mock.calls[0]![0].text).toContain('Expires: 2026-11-26 08:53 (UTC)');
    } finally {
      vi.useRealTimers();
    }
  });
});
