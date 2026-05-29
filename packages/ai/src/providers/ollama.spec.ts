import { describe, expect, it, vi } from 'vitest';

import { OllamaProvider } from './ollama.js';

function jsonFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe('OllamaProvider (local, always $0)', () => {
  it('posts to {baseUrl}/api/chat and maps the message', async () => {
    const fetchImpl = jsonFetch(200, {
      message: { role: 'assistant', content: 'local answer' },
      done_reason: 'stop',
      prompt_eval_count: 40,
      eval_count: 9,
    });
    const p = new OllamaProvider({ baseUrl: 'http://localhost:11434', fetchImpl });
    const r = await p.complete({
      model: 'ollama:llama3.1',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(r.content).toBe('local answer');
    expect(r.usage).toEqual({ inputTokens: 40, outputTokens: 9 });
    expect(r.actualCost).toBe(0); // local inference is free
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain('/api/chat');
  });

  it('embeds via /api/embed and returns the vectors', async () => {
    const fetchImpl = jsonFetch(200, { embeddings: [[0.1, 0.2]] });
    const p = new OllamaProvider({ baseUrl: 'http://localhost:11434', fetchImpl });
    const vectors = await p.embed({ texts: ['x'], model: 'ollama:nomic-embed-text' });
    expect(vectors).toEqual([[0.1, 0.2]]);
  });

  it('reports $0 cost regardless of token volume', async () => {
    const p = new OllamaProvider({
      baseUrl: 'http://localhost:11434',
      fetchImpl: jsonFetch(200, {
        message: { content: 'x' },
        prompt_eval_count: 1_000_000,
        eval_count: 1_000_000,
      }),
    });
    const r = await p.complete({ model: 'ollama:llama3.1', messages: [{ role: 'user', content: 'q' }] });
    expect(r.actualCost).toBe(0);
  });
});
