import { describe, expect, it } from 'vitest';

import { MockProvider } from './mock.js';

describe('MockProvider (deterministic, zero-cost, no network)', () => {
  it('echoes a canned response with usage and zero cost', async () => {
    const p = new MockProvider({ cannedResponse: 'hello world' });
    const r = await p.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(r.content).toBe('hello world');
    expect(r.finishReason).toBe('stop');
    expect(r.actualCost).toBe(0);
    expect(r.usage.inputTokens).toBeGreaterThan(0);
    expect(r.usage.outputTokens).toBeGreaterThan(0);
  });

  it('defaults to echoing the last user message when no canned response', async () => {
    const p = new MockProvider();
    const r = await p.complete({ messages: [{ role: 'user', content: 'the question' }] });
    expect(r.content).toContain('the question');
  });

  it('impersonates the configured provider key', () => {
    expect(new MockProvider({ key: 'CLAUDE' }).key).toBe('CLAUDE');
    expect(new MockProvider().key).toBe('GEMINI');
  });

  it('streams the response as deltas then a final usage chunk', async () => {
    const p = new MockProvider({ cannedResponse: 'one two three' });
    const chunks = [];
    for await (const c of p.stream({ messages: [{ role: 'user', content: 'go' }] })) {
      chunks.push(c);
    }
    const text = chunks.map((c) => c.delta ?? '').join('');
    expect(text).toBe('one two three');
    const last = chunks[chunks.length - 1]!;
    expect(last.finishReason).toBe('stop');
    expect(last.usage).toBeDefined();
  });

  it('returns deterministic embeddings of the requested dimension', async () => {
    const p = new MockProvider({ embeddingDim: 768 });
    const [a] = await p.embed({ texts: ['same text'], model: 'mock' });
    const [b] = await p.embed({ texts: ['same text'], model: 'mock' });
    expect(a).toHaveLength(768);
    expect(a).toEqual(b); // deterministic
    const [c] = await p.embed({ texts: ['different'], model: 'mock' });
    expect(c).not.toEqual(a); // different input → different vector
  });

  it('returns a parsed tool call when configured', async () => {
    const p = new MockProvider({
      cannedToolCall: { id: 't1', name: 'query_timeseries', input: { kpiId: 'k1' } },
    });
    const r = await p.completeWithTools({
      messages: [{ role: 'user', content: 'q' }],
      tools: [{ name: 'query_timeseries', description: '', parameters: {} }],
    });
    expect(r.finishReason).toBe('tool_use');
    expect(r.toolCalls?.[0]?.name).toBe('query_timeseries');
  });

  it('reports healthy on ping and full capabilities', async () => {
    const p = new MockProvider();
    expect((await p.ping()).ok).toBe(true);
    expect(p.capabilities()).toEqual({
      tools: true,
      streaming: true,
      embeddings: true,
      promptCaching: true,
    });
  });
});
