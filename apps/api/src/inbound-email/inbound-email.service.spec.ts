/**
 * InboundEmailService unit tests. Resolves an inbound email to a comment on the
 * targeted entity. Covers: signature gate, address parse, entity→org resolution,
 * sender lookup (reject unknown), quoted-reply stripping, CommentsService call
 * within a synthesized request context.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';

import type { CommentsService } from '../comments/comments.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { InboundEmailService } from './inbound-email.service.js';

const SECRET = 'inbound-secret';
function sign(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

function makeService(opts: { secret?: string } = {}) {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    kPI: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'kpi_1' ? { organizationId: 'org_a' } : null)) },
    alert: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === 'al_1' ? { organizationId: 'org_a' } : null)) },
    task: { findUnique: vi.fn(async () => null) },
    user: {
      findFirst: vi.fn(async ({ where }: { where: { organizationId: string; email: string } }) =>
        where.organizationId === 'org_a' && where.email === 'alice@x.test' ? { id: 'user_alice' } : null,
      ),
    },
  };
  const comments = {
    create: vi.fn(async (input: Record<string, unknown>) => {
      created.push(input);
      return { id: 'cmt_1', ...input };
    }),
  };
  const service = new InboundEmailService(
    prisma as unknown as PrismaService,
    comments as unknown as CommentsService,
    { EMAIL_INBOUND_SECRET: opts.secret },
  );
  return { service, prisma, comments, created };
}

describe('InboundEmailService.handle', () => {
  const goodPayload = {
    to: 'inbound+kpi-kpi_1@mail.host',
    from: 'Alice <alice@x.test>',
    subject: 'Re: KPI',
    text: 'Looks off this month\n> previous quoted line',
  };

  test('creates a comment on the targeted KPI from the resolved sender', async () => {
    const { service, comments, created } = makeService({ secret: SECRET });
    const raw = JSON.stringify(goodPayload);
    await service.handle(goodPayload, { rawBody: raw, signature: sign(raw) });
    expect(comments.create).toHaveBeenCalledTimes(1);
    expect(created[0]).toMatchObject({ entityType: 'kpi', entityId: 'kpi_1', body: 'Looks off this month' });
  });

  test('rejects a bad signature', async () => {
    const { service } = makeService({ secret: SECRET });
    const raw = JSON.stringify(goodPayload);
    await expect(service.handle(goodPayload, { rawBody: raw, signature: 'deadbeef' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('passes through when no secret is configured (dev)', async () => {
    const { service, comments } = makeService({}); // no secret
    const raw = JSON.stringify(goodPayload);
    await service.handle(goodPayload, { rawBody: raw, signature: 'whatever' });
    expect(comments.create).toHaveBeenCalledTimes(1);
  });

  test('rejects an unparseable address', async () => {
    const { service } = makeService({});
    const payload = { ...goodPayload, to: 'support@host' };
    await expect(service.handle(payload, { rawBody: '{}', signature: '' })).rejects.toBeInstanceOf(BadRequestException);
  });

  test('404 when the target entity does not exist', async () => {
    const { service } = makeService({});
    const payload = { ...goodPayload, to: 'inbound+task-missing@host' };
    await expect(service.handle(payload, { rawBody: '{}', signature: '' })).rejects.toBeInstanceOf(NotFoundException);
  });

  test('forbids a sender not in the entity org', async () => {
    const { service } = makeService({});
    const payload = { ...goodPayload, from: 'stranger@evil.test' };
    await expect(service.handle(payload, { rawBody: '{}', signature: '' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('routes alert addresses to the alert entity', async () => {
    const { service, created } = makeService({});
    const payload = { ...goodPayload, to: 'inbound+alert-al_1@host', text: 'ack from email' };
    await service.handle(payload, { rawBody: '{}', signature: '' });
    expect(created[0]).toMatchObject({ entityType: 'alert', entityId: 'al_1', body: 'ack from email' });
  });
});
