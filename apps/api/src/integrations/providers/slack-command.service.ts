import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';

import { KpiDataService } from '../../kpis/kpi-data.service.js';
import { KpisService } from '../../kpis/kpis.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AccessContextService } from '../../rbac/services/access-context.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';
import { SlackCommandProducer } from './slack-command.producer.js';
import { signSlackLinkToken, verifySlackLinkToken } from './slack-link-token.js';

export const SLACK_COMMAND_CONFIG = Symbol('SLACK_COMMAND_CONFIG');
export interface SlackCommandConfig {
  linkSecret: string;
  webAppUrl: (path: string) => string;
}

export interface SlackCommand {
  teamId: string;
  slackUserId: string;
  text: string;
  responseUrl: string;
}

export interface SlackReply {
  response_type: 'ephemeral';
  text: string;
  blocks?: unknown[];
}

const MAX_MATCHES = 5;
const ACTIVE = new Set(['ACTIVE']);
const USAGE = 'Usage: `/kpi <name>` shows KPIs matching a name · `/kpi ask <question>` asks about your KPIs · `/kpi unlink` disconnects your account.';

const reply = (text: string, blocks?: unknown[]): SlackReply => ({ response_type: 'ephemeral', text, ...(blocks ? { blocks } : {}) });
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 }));

/** True only for Slack's own delayed-reply host (response_url comes in the signed request). */
export function isSlackResponseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'hooks.slack.com';
  } catch {
    return false;
  }
}

/**
 * `/kpi` slash command. The workspace resolves the org; the Slack user must
 * have linked a KPI Nexus account (an unlinked user gets a private, signed,
 * 10-minute link instead of data); everything then runs AS that account, so
 * the KPIs and values shown are exactly what they may see in the web app.
 * Every reply is ephemeral (only the asker sees it).
 */
@Injectable()
export class SlackCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kpis: KpisService,
    private readonly kpiData: KpiDataService,
    private readonly accessContext: AccessContextService,
    private readonly producer: SlackCommandProducer,
    @Inject(SLACK_COMMAND_CONFIG) private readonly config: SlackCommandConfig,
  ) {}

  async handle(cmd: SlackCommand): Promise<SlackReply> {
    const organizationId = await this.resolveOrg(cmd.teamId);
    if (!organizationId) return reply("This Slack workspace isn't connected to KPI Nexus. An admin can connect it under Integrations.");

    const text = cmd.text.trim();
    const link = await RequestContextStore.runWithBypass('slack-command-link', () =>
      this.prisma.slackUserLink.findFirst({ where: { organizationId, slackTeamId: cmd.teamId, slackUserId: cmd.slackUserId }, select: { userId: true } }),
    );

    if (/^unlink$/i.test(text)) {
      await RequestContextStore.runWithBypass('slack-command-unlink', () =>
        this.prisma.slackUserLink.deleteMany({ where: { slackTeamId: cmd.teamId, slackUserId: cmd.slackUserId } }),
      );
      return reply('Your Slack account is unlinked from KPI Nexus.');
    }

    if (!link) {
      const token = signSlackLinkToken({ organizationId, teamId: cmd.teamId, slackUserId: cmd.slackUserId }, this.config.linkSecret);
      const url = this.config.webAppUrl(`/integrations/slack/link?token=${encodeURIComponent(token)}`);
      return reply(`Link your Slack account to KPI Nexus first: <${url}|Link my account> (the link expires in 10 minutes and works only for you).`);
    }

    const user = await RequestContextStore.runWithBypass('slack-command-user', () =>
      this.prisma.user.findFirst({ where: { id: link.userId, organizationId }, select: { id: true, roleId: true, status: true, isActive: true } }),
    );
    if (!user || !ACTIVE.has(user.status) || !user.isActive) return reply('Your linked KPI Nexus account is not active.');

    if (!text || /^help$/i.test(text)) return reply(USAGE);

    const ctx = { userId: user.id, organizationId, roleId: user.roleId, principalType: 'user' as const };
    return RequestContextStore.run(ctx, () => this.asUser(text, cmd.responseUrl)) as Promise<SlackReply>;
  }

  /** Runs in the linked user's request context. */
  private async asUser(text: string, responseUrl: string): Promise<SlackReply> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    const can = (p: PermissionKey) => profile.isAdmin || profile.capabilities.includes(p);

    const ask = /^ask\s+(.+)$/is.exec(text);
    if (ask) {
      if (!can(PermissionKey.INSIGHTS_VIEW)) return reply("You don't have permission to ask questions about KPIs.");
      if (!isSlackResponseUrl(responseUrl)) return reply("Sorry, I couldn't reply to that request.");
      await this.producer.enqueueAsk({ organizationId: ctx.organizationId, userId: ctx.userId, question: ask[1]!.trim(), responseUrl });
      return reply('Thinking… the answer will appear here shortly.');
    }

    if (!can(PermissionKey.KPI_VIEW)) return reply("You don't have permission to view KPIs.");
    const needle = text.toLowerCase();
    const matches = (await this.kpis.list()).filter((k) => k.name.toLowerCase().includes(needle)).slice(0, MAX_MATCHES);
    if (matches.length === 0) return reply(`No KPI you can see matches "${text}".`);

    const ids = new Set(matches.map((k) => k.id));
    const rows = (await this.kpiData.dashboardSummary()).filter((r) => ids.has(r.kpiId));
    const blocks = rows.flatMap((r) => [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*<${this.config.webAppUrl(`/kpis/${r.kpiId}`)}|${r.name}>*\nLatest: *${fmt(r.latestValue)}${r.unit ? ` ${r.unit}` : ''}*` +
            ` · Target: ${fmt(r.targetValue)}${r.latestRecordedAt ? ` · as of ${r.latestRecordedAt.toISOString().slice(0, 10)}` : ''}`,
        },
      },
    ]);
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Only you can see this.' }] } as never);
    return reply(rows.map((r) => `${r.name}: ${fmt(r.latestValue)}${r.unit ? ` ${r.unit}` : ''}`).join('\n'), blocks);
  }

  /**
   * POST /integrations/slack/link (signed in): bind the Slack user named in the
   * signed link to the caller's account. Only that Slack user received the link
   * (privately), and the caller has proved their KPI Nexus login, so both sides
   * agree. A link for another organization is refused.
   */
  async linkAccount(token: string): Promise<{ linked: true }> {
    const ctx = RequestContextStore.require();
    const claims = verifySlackLinkToken(token, this.config.linkSecret);
    if (!claims) throw new BadRequestException({ code: 'INVALID_LINK', message: 'This link is invalid or has expired. Run /kpi in Slack for a new one.' });
    if (claims.organizationId !== ctx.organizationId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'This link is for another organization.' });
    }
    await this.prisma.slackUserLink.upsert({
      where: { slackTeamId_slackUserId: { slackTeamId: claims.teamId, slackUserId: claims.slackUserId } },
      create: { organizationId: ctx.organizationId, slackTeamId: claims.teamId, slackUserId: claims.slackUserId, userId: ctx.userId },
      update: { organizationId: ctx.organizationId, userId: ctx.userId },
    });
    return { linked: true };
  }

  private async resolveOrg(teamId: string): Promise<string | null> {
    // Cross-tenant: the Slack team is how we learn the tenant (OT-014).
    const conn = await RequestContextStore.runWithBypass('slack-command-org', () =>
      this.prisma.integrationConnection.findFirst({
        where: { provider: 'slack', metadata: { path: ['team_id'], equals: teamId } },
        select: { organizationId: true },
      }),
    );
    return conn?.organizationId ?? null;
  }
}
