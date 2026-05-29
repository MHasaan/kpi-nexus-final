import { describe, expect, it, vi } from 'vitest';

import { OpenAiProvider } from './openai.js';

function jsonFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe('OpenAiProvider', () => {
  it('posts to /v1/chat/completions with bearer auth and maps the choice', async () => {
    const fetchImpl = jsonFetch(200, {
      choices: [{ message: { content: 'gpt answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 30, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 10 } },
    });
    const p = new OpenAiProvider({ apiKey: 'sk-openai', fetchImpl });
    const r = await p.complete({
      model: 'openai-gpt-4o',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(r.content).toBe('gpt answer');
    expect(r.finishReason).toBe('stop');
    expect(r.usage).toEqual({ inputTokens: 30, outputTokens: 12, cachedTokens: 10 });
    expect(r.actualCost).toBeGreaterThan(0);

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toContain('/v1/chat/completions');
    expect((init as { headers: Record<string, string> }).headers['authorization']).toBe('Bearer sk-openai');
    const sent = JSON.parse((init as { body: string }).body);
    // our prefixed id is stripped to the real model name
    expect(sent.model).toBe('gpt-4o');
    expect(sent.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('maps tool_calls to normalized tool calls (json-parsed arguments)', async () => {
    const p = new OpenAiProvider({
      apiKey: 'k',
      fetchImpl: jsonFetch(200, {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [{ id: 'c1', function: { name: 'forecast_kpi', arguments: '{"kpiId":"k1"}' } }],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }),
    });
    const r = await p.completeWithTools({
      model: 'openai-gpt-4o',
      messages: [{ role: 'user', content: 'q' }],
      tools: [{ name: 'forecast_kpi', description: 'd', parameters: {} }],
    });
    expect(r.finishReason).toBe('tool_use');
    expect(r.toolCalls?.[0]).toMatchObject({ id: 'c1', name: 'forecast_kpi', input: { kpiId: 'k1' } });
  });

  it('embeds via /v1/embeddings and strips the openai- prefix', async () => {
    const fetchImpl = jsonFetch(200, { data: [{ embedding: [1, 2] }, { embedding: [3, 4] }] });
    const p = new OpenAiProvider({ apiKey: 'k', fetchImpl });
    const vectors = await p.embed({ texts: ['a', 'b'], model: 'openai-text-embedding-3-small' });
    expect(vectors).toEqual([
      [1, 2],
      [3, 4],
    ]);
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as { body: string };
    expect(JSON.parse(init.body).model).toBe('text-embedding-3-small');
  });

  it('throws retryable on 500', async () => {
    await expect(
      new OpenAiProvider({ apiKey: 'k', fetchImpl: jsonFetch(500, {}) }).complete({
        model: 'openai-gpt-4o',
        messages: [{ role: 'user', content: 'x' }],
      }),
    ).rejects.toMatchObject({ retryable: true });
  });
});
