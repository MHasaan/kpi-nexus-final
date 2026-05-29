import { describe, expect, it, vi } from 'vitest';

import { ClaudeProvider } from './claude.js';

function jsonFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

const okMsg = {
  content: [{ type: 'text', text: 'claude says hi' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 20, output_tokens: 8, cache_read_input_tokens: 5 },
};

describe('ClaudeProvider', () => {
  it('posts to /v1/messages with anthropic headers + system prompt and maps result', async () => {
    const fetchImpl = jsonFetch(200, okMsg);
    const p = new ClaudeProvider({ apiKey: 'sk-ant-xxx', fetchImpl });
    const r = await p.complete({
      model: 'claude-haiku-4-5',
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 100,
    });

    expect(r.content).toBe('claude says hi');
    expect(r.finishReason).toBe('stop');
    // 20 input (5 cached) + 8 output on haiku → priced > 0
    expect(r.usage).toEqual({ inputTokens: 20, outputTokens: 8, cachedTokens: 5 });
    expect(r.actualCost).toBeGreaterThan(0);

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toContain('api.anthropic.com/v1/messages');
    const headers = (init as { headers: Record<string, string> }).headers;
    expect(headers['x-api-key']).toBe('sk-ant-xxx');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const sent = JSON.parse((init as { body: string }).body);
    expect(sent.system).toBe('sys');
    expect(sent.max_tokens).toBe(100);
  });

  it('maps a tool_use stop reason and tool_use block to a normalized tool call', async () => {
    const p = new ClaudeProvider({
      apiKey: 'k',
      fetchImpl: jsonFetch(200, {
        content: [{ type: 'tool_use', id: 'tu_1', name: 'get_metadata', input: { kpiId: 'k1' } }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 5, output_tokens: 3 },
      }),
    });
    const r = await p.completeWithTools({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'q' }],
      tools: [{ name: 'get_metadata', description: 'd', parameters: {} }],
    });
    expect(r.finishReason).toBe('tool_use');
    expect(r.toolCalls?.[0]).toMatchObject({ id: 'tu_1', name: 'get_metadata', input: { kpiId: 'k1' } });
  });

  it('throws retryable on 503 and non-retryable on 401', async () => {
    await expect(
      new ClaudeProvider({ apiKey: 'k', fetchImpl: jsonFetch(503, {}) }).complete({
        model: 'claude-haiku-4-5',
        messages: [{ role: 'user', content: 'x' }],
      }),
    ).rejects.toMatchObject({ retryable: true });
    await expect(
      new ClaudeProvider({ apiKey: 'k', fetchImpl: jsonFetch(401, {}) }).complete({
        model: 'claude-haiku-4-5',
        messages: [{ role: 'user', content: 'x' }],
      }),
    ).rejects.toMatchObject({ retryable: false });
  });

  it('does not support embeddings (throws non-retryable)', async () => {
    const p = new ClaudeProvider({ apiKey: 'k', fetchImpl: jsonFetch(200, okMsg) });
    expect(p.capabilities().embeddings).toBe(false);
    await expect(p.embed({ texts: ['x'], model: 'whatever' })).rejects.toMatchObject({
      retryable: false,
    });
  });
});
