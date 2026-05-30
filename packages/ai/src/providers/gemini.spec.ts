import { describe, expect, it, vi } from 'vitest';

import { AiProviderError } from '../types.js';
import { GeminiProvider } from './gemini.js';

/** Build a fetch stub returning a JSON body with a given status. */
function jsonFetch(status: number, body: unknown) {
  return vi.fn(async (_url: string, _init?: unknown) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

const okCompletion = {
  candidates: [
    { content: { parts: [{ text: 'the answer' }] }, finishReason: 'STOP' },
  ],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5 },
};

describe('GeminiProvider', () => {
  it('posts to the model:generateContent URL with the api key and returns mapped result', async () => {
    const fetchImpl = jsonFetch(200, okCompletion);
    const p = new GeminiProvider({ apiKeys: ['key-1'], fetchImpl });
    const r = await p.complete({
      model: 'gemini-2.5-flash',
      systemPrompt: 'be terse',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(r.content).toBe('the answer');
    expect(r.finishReason).toBe('stop');
    expect(r.usage).toEqual({ inputTokens: 12, outputTokens: 5 });
    expect(r.actualCost).toBe(0); // gemini free tier

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toContain('gemini-2.5-flash:generateContent');
    expect(url).toContain('key=key-1');
    const sent = JSON.parse((init as { body: string }).body);
    expect(sent.system_instruction.parts[0].text).toBe('be terse');
    expect(sent.contents[0].role).toBe('user');
  });

  it('maps assistant role to gemini "model" role', async () => {
    const fetchImpl = jsonFetch(200, okCompletion);
    const p = new GeminiProvider({ apiKeys: ['k'], fetchImpl });
    await p.complete({
      model: 'gemini-2.5-flash',
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a' },
      ],
    });
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as { body: string };
    const sent = JSON.parse(init.body);
    expect(sent.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model']);
  });

  it('throws a retryable AiProviderError on HTTP 429', async () => {
    const p = new GeminiProvider({ apiKeys: ['k'], fetchImpl: jsonFetch(429, { error: 'quota' }) });
    await expect(
      p.complete({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ retryable: true, statusCode: 429 });
  });

  it('throws a non-retryable AiProviderError on HTTP 400', async () => {
    const p = new GeminiProvider({ apiKeys: ['k'], fetchImpl: jsonFetch(400, { error: 'bad' }) });
    await expect(
      p.complete({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ retryable: false, statusCode: 400 });
    await expect(
      p.complete({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toBeInstanceOf(AiProviderError);
  });

  it('extracts a functionCall part as a normalized tool call', async () => {
    const fetchImpl = jsonFetch(200, {
      candidates: [
        {
          content: { parts: [{ functionCall: { name: 'query_timeseries', args: { kpiId: 'k1' } } }] },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 },
    });
    const p = new GeminiProvider({ apiKeys: ['k'], fetchImpl });
    const r = await p.completeWithTools({
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'q' }],
      tools: [{ name: 'query_timeseries', description: 'd', parameters: {} }],
    });
    expect(r.finishReason).toBe('tool_use');
    expect(r.toolCalls?.[0]).toMatchObject({ name: 'query_timeseries', input: { kpiId: 'k1' } });
  });

  it('round-robins across the key pool on successive calls', async () => {
    const fetchImpl = jsonFetch(200, okCompletion);
    const p = new GeminiProvider({ apiKeys: ['a', 'b', 'c'], fetchImpl });
    for (let i = 0; i < 3; i += 1) {
      await p.complete({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'x' }] });
    }
    const urls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(urls[0]).toContain('key=a');
    expect(urls[1]).toContain('key=b');
    expect(urls[2]).toContain('key=c');
  });

  it('embeds via batchEmbedContents using the model id verbatim + a fixed 768 dim', async () => {
    const fetchImpl = jsonFetch(200, {
      embeddings: [{ values: [0.1, 0.2, 0.3] }, { values: [0.4, 0.5, 0.6] }],
    });
    const p = new GeminiProvider({ apiKeys: ['k'], fetchImpl });
    const vectors = await p.embed({ texts: ['a', 'b'], model: 'gemini-embedding-001' });
    expect(vectors).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    // Model id used as-is (NOT stripped) — gemini-embedding-001 is the real API model.
    expect(url).toContain('models/gemini-embedding-001:batchEmbedContents');
    const sent = JSON.parse((init as { body: string }).body);
    expect(sent.requests[0].model).toBe('models/gemini-embedding-001');
    expect(sent.requests[0].outputDimensionality).toBe(768); // fits the gemini pgvector column
  });

  it('throws if no api keys are configured', async () => {
    const p = new GeminiProvider({ apiKeys: [], fetchImpl: jsonFetch(200, okCompletion) });
    await expect(
      p.complete({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ retryable: false });
  });
});
