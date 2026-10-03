import { timingSafeEqual } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { TaskStatus } from '@kpi-nexus/db';

import { PrismaService } from '../../prisma/prisma.service.js';
import { IntegrationCryptoService } from '../integration-crypto.service.js';
import { mapJiraStatusToTask } from './jira-map.js';

export interface JiraWebhookPayload {
  issue?: { key?: string; fields?: { status?: { name?: string } } };
}

/**
 * Receives Jira issue-update webhooks for ONE Jira IntegrationConnection and
 * mirrors the issue status onto the linked Task in that connection's org.
 *
 * The caller must present the connection's `webhookSecret` (stored in its
 * encrypted tokens). Unknown connections, connections without a secret and
 * wrong secrets are all rejected the same way (401) — fail closed, no
 * existence oracle. The issue key must match the task's externalRef exactly:
 * the bare key, or a URL ending in `/browse/<KEY>`.
 */
@Injectable()
export class JiraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: IntegrationCryptoService,
  ) {}

  async handleWebhook(
    connectionId: string,
    presentedSecret: string | undefined,
    payload: JiraWebhookPayload,
  ): Promise<{ updated: boolean }> {
    const organizationId = await this.authenticate(connectionId, presentedSecret);

    const key = payload.issue?.key?.trim();
    const statusName = payload.issue?.fields?.status?.name;
    if (!key || !statusName) return { updated: false };

    const mapped = mapJiraStatusToTask(statusName);
    if (!mapped) return { updated: false };

    const task = await this.prisma.task.findFirst({
      where: {
        organizationId,
        OR: [{ externalRef: key }, { externalRef: { endsWith: `/browse/${key}` } }],
      },
      select: { id: true },
    });
    if (!task) return { updated: false };

    await this.prisma.task.update({ where: { id: task.id }, data: { status: mapped as TaskStatus } });
    return { updated: true };
  }

  /** Returns the connection's org when the presented secret matches; throws 401 otherwise. */
  private async authenticate(connectionId: string, presentedSecret: string | undefined): Promise<string> {
    const reject = () => new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid webhook credentials' });
    if (!presentedSecret) throw reject();

    const conn = await this.prisma.integrationConnection.findFirst({
      where: { id: connectionId, provider: 'jira' },
      select: { organizationId: true, encryptedTokens: true },
    });
    if (!conn) throw reject();

    let expected: unknown;
    try {
      expected = this.crypto.decrypt<{ webhookSecret?: unknown }>(conn.encryptedTokens as unknown as string).webhookSecret;
    } catch {
      throw reject();
    }
    if (typeof expected !== 'string' || expected.length === 0) throw reject();

    const a = Buffer.from(presentedSecret);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw reject();
    return conn.organizationId;
  }
}
