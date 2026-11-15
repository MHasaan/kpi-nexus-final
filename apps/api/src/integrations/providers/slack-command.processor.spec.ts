/** `/kpi ask` jobs: answered as the linked user, posted privately to Slack's response_url only. */
import { describe, expect, it, vi } from 'vitest';

import type { NlqService } from '../../nlq/nlq.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';
import { SlackCommandProcessor } from './slack-command.processor.js';

const posted: Array<{ url: string; body: Record<string, unknown> }> = [];
vi.mock('../../outbound/outbound-fetch.js', () => ({
  outboundFetch: vi.fn(async (url: string, init: { body: string }) => {
    posted.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200 };
  }),
}));

function make(user: { roleId: string } | null = { roleId: 'role_1' }) {
  const asWho: Array<string | undefined> = [];
  const nlq = {
    ask: vi.fn(async () => {
      asWho.push(RequestContextStore.get()?.userId);
      return { answer: 'Revenue is up 4%.' };
    }),
  };
  const prisma = { user: { findFirst: vi.fn(async () => user) } };
  return { processor: new SlackCommandProcessor(prisma as unknown as PrismaService, nlq as unknown as NlqService), nlq, asWho };
}
const job = (responseUrl = 'https://hooks.slack.com/commands/T1/1/abc') =>
  ({ data: { organizationId: 'org_1', userId: 'user_1', question: 'revenue?', responseUrl } }) as never;

describe('SlackCommandProcessor', () => {
  it('asks NLQ as the linked user and posts the answer ephemerally to the response_url', async () => {
    posted.length = 0;
    const { processor, asWho } = make();
    await processor.process(job());
    expect(asWho).toEqual(['user_1']);
    expect(posted).toEqual([{ url: 'https://hooks.slack.com/commands/T1/1/abc', body: { response_type: 'ephemeral', replace_original: false, text: 'Revenue is up 4%.' } }]);
  });

  it('an inactive user gets no answer; a non-Slack URL is never called', async () => {
    posted.length = 0;
    const inactive = make(null);
    await inactive.processor.process(job());
    expect(inactive.nlq.ask).not.toHaveBeenCalled();
    expect(posted[0]!.body.text).toMatch(/not active/);
    posted.length = 0;
    await make().processor.process(job('https://evil.example/collect'));
    expect(posted).toEqual([]);
  });
});
