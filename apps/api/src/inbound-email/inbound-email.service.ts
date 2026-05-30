import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';

import { CommentsService } from '../comments/comments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import {
  type InboundEntityType,
  extractEmailAddress,
  parseInboundAddress,
  stripQuotedReply,
  verifyInboundSignature,
} from './inbound-email-parse.js';

export interface InboundEmailPayload {
  to: string;
  from: string;
  subject?: string;
  text: string;
  html?: string;
}

/**
 * Turns an inbound email (delivered by an email service webhook) into a comment
 * on the addressed entity. Public + unauthenticated — integrity is enforced by
 * the HMAC signature; the acting principal is synthesized from the resolved
 * entity org + sender lookup so CommentsService runs with a real tenant context.
 */
@Injectable()
export class InboundEmailService {
  private readonly secret: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly comments: CommentsService,
    @Optional() env?: Record<string, string | undefined>,
  ) {
    this.secret = (env ?? process.env).EMAIL_INBOUND_SECRET;
  }

  async handle(payload: InboundEmailPayload, opts: { rawBody: string; signature: string }): Promise<{ commentId: string }> {
    // 1. Integrity. In dev (no secret) we pass through.
    if (this.secret && !verifyInboundSignature(this.secret, opts.rawBody, opts.signature)) {
      throw new UnauthorizedException({ code: 'BAD_SIGNATURE', message: 'Invalid inbound signature' });
    }

    // 2. Route via plus-addressing.
    const target = parseInboundAddress(payload.to);
    if (!target) {
      throw new BadRequestException({ code: 'UNROUTABLE', message: 'Email recipient is not a routable inbound address' });
    }

    // 3. Resolve the entity's org (cross-tenant lookup — owner connection).
    const organizationId = await this.resolveOrg(target);
    if (!organizationId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `${target.type} ${target.id} not found` });
    }

    // 4. Sender must be a member of that org.
    const senderEmail = extractEmailAddress(payload.from);
    const sender = await this.prisma.user.findFirst({
      where: { organizationId, email: senderEmail },
      select: { id: true },
    });
    if (!sender) {
      throw new ForbiddenException({ code: 'UNKNOWN_SENDER', message: 'Sender is not a member of the target organization' });
    }

    // 5. Persist as a comment within a synthesized tenant context.
    const body = stripQuotedReply(payload.text) || '(empty message)';
    const comment = await (RequestContextStore.run(
      { userId: sender.id, organizationId, roleId: null, principalType: 'user' },
      () => this.comments.create({ entityType: target.type, entityId: target.id, body }),
    ) as Promise<{ id: string }>);

    return { commentId: comment.id };
  }

  private async resolveOrg(target: { type: InboundEntityType; id: string }): Promise<string | null> {
    if (target.type === 'kpi') {
      return (await this.prisma.kPI.findUnique({ where: { id: target.id }, select: { organizationId: true } }))?.organizationId ?? null;
    }
    if (target.type === 'alert') {
      return (await this.prisma.alert.findUnique({ where: { id: target.id }, select: { organizationId: true } }))?.organizationId ?? null;
    }
    return (await this.prisma.task.findUnique({ where: { id: target.id }, select: { organizationId: true } }))?.organizationId ?? null;
  }
}
