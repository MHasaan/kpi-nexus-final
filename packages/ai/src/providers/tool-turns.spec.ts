/**
 * Tool round-trips. A tool-use loop sends the model its own tool calls back,
 * followed by the tools' results. AiMessage used to be text-only, so no
 * adapter could express either turn. Each adapter must put them on the wire
 * in its vendor's shape: Gemini functionCall / functionResponse parts (with
 * the thought signature replayed), Claude tool_use / tool_result blocks,
 * OpenAI tool_calls + role "tool", Ollama tool_calls + role "tool".
 */
import { describe, expect, it, vi } from 'vitest';

import type { AiMessage } from '../types.js';
import { ClaudeProvider } from './claude.js';
import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';
import { OpenAiProvider } from './openai.js';

function capture(body: unknown) {
  const calls: Array<Record<string, unknown>> = [];
  const fetchImpl = vi.fn(async (_url: string, init?: { body?: string }) => {
    calls.push(JSON.parse(init?.body ?? '{}') as Record<string, unknown>);
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

/** Question → assistant calls two tools → both results. */
const conversation: AiMessage[] = [
  { role: 'user', content: 'Compare revenue and churn' },
  {
    role: 'assistant',
    content: 'Let me look.',
    toolCalls: [
      { id: 'call-1', name: 'get_kpi_history', input: { kpiId: 'rev' }, signature: 'sig-abc' },
      { id: 'call-2', name: 'get_kpi_history', input: { kpiId: 'churn' } },
    ],
  },
  { role: 'tool', toolCallId: 'call-1', toolName: 'get_kpi_history', content: '{"points":[1,2]}' },
  { role: 'tool', toolCallId: 'call-2', toolName: 'get_kpi_history', content: '{"points":[3]}' },
];

describe('tool round-trips on the wire', () => {
  it('Gemini: model turn with functionCall parts (signature replayed), then ONE user turn of functionResponse parts', async () => {
    const { calls, fetchImpl } = capture({ candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] });
    await new GeminiProvider({ apiKeys: ['k'], fetchImpl }).completeWithTools({ model: 'gemini-2.5-flash', messages: conversation });
    expect(calls[0]!.contents).toEqual([
      { role: 'user', parts: [{ text: 'Compare revenue and churn' }] },
      {
        role: 'model',
        parts: [
          { text: 'Let me look.' },
          { functionCall: { name: 'get_kpi_history', args: { kpiId: 'rev' } }, thoughtSignature: 'sig-abc' },
          { functionCall: { name: 'get_kpi_history', args: { kpiId: 'churn' } } },
        ],
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'get_kpi_history', response: { result: { points: [1, 2] } } } },
          { functionResponse: { name: 'get_kpi_history', response: { result: { points: [3] } } } },
        ],
      },
    ]);
  });

  it('Gemini: a returned functionCall keeps its thought signature for the replay', async () => {
    const { fetchImpl } = capture({
      candidates: [{ content: { parts: [{ functionCall: { name: 'get_metadata', args: { kpiId: 'k' } }, thoughtSignature: 'sig-xyz' }] }, finishReason: 'STOP' }],
    });
    const r = await new GeminiProvider({ apiKeys: ['k'], fetchImpl }).completeWithTools({ model: 'gemini-2.5-flash', messages: conversation.slice(0, 1) });
    expect(r.toolCalls).toEqual([{ id: 'gemini-tool-0', name: 'get_metadata', input: { kpiId: 'k' }, signature: 'sig-xyz' }]);
    expect(r.finishReason).toBe('tool_use');
  });

  it('Claude: assistant tool_use blocks, then ONE user turn of tool_result blocks', async () => {
    const { calls, fetchImpl } = capture({ content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
    await new ClaudeProvider({ apiKey: 'k', fetchImpl }).completeWithTools({ model: 'claude-haiku-4-5', messages: conversation });
    expect(calls[0]!.messages).toEqual([
      { role: 'user', content: 'Compare revenue and churn' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me look.' },
          { type: 'tool_use', id: 'call-1', name: 'get_kpi_history', input: { kpiId: 'rev' } },
          { type: 'tool_use', id: 'call-2', name: 'get_kpi_history', input: { kpiId: 'churn' } },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call-1', content: '{"points":[1,2]}' },
          { type: 'tool_result', tool_use_id: 'call-2', content: '{"points":[3]}' },
        ],
      },
    ]);
  });

  it('OpenAI: assistant tool_calls (arguments as JSON text), then one role "tool" message per result', async () => {
    const { calls, fetchImpl } = capture({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }], usage: {} });
    await new OpenAiProvider({ apiKey: 'k', fetchImpl }).completeWithTools({ model: 'gpt-4o-mini', messages: conversation });
    expect(calls[0]!.messages).toEqual([
      { role: 'user', content: 'Compare revenue and churn' },
      {
        role: 'assistant',
        content: 'Let me look.',
        tool_calls: [
          { id: 'call-1', type: 'function', function: { name: 'get_kpi_history', arguments: '{"kpiId":"rev"}' } },
          { id: 'call-2', type: 'function', function: { name: 'get_kpi_history', arguments: '{"kpiId":"churn"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call-1', content: '{"points":[1,2]}' },
      { role: 'tool', tool_call_id: 'call-2', content: '{"points":[3]}' },
    ]);
  });

  it('Ollama: assistant tool_calls (arguments as objects), then role "tool" messages naming the tool', async () => {
    const { calls, fetchImpl } = capture({ message: { content: 'done' }, done_reason: 'stop' });
    await new OllamaProvider({ baseUrl: 'http://ollama.test', fetchImpl }).completeWithTools({ model: 'llama3.1', messages: conversation });
    expect(calls[0]!.messages).toEqual([
      { role: 'user', content: 'Compare revenue and churn' },
      {
        role: 'assistant',
        content: 'Let me look.',
        tool_calls: [
          { function: { name: 'get_kpi_history', arguments: { kpiId: 'rev' } } },
          { function: { name: 'get_kpi_history', arguments: { kpiId: 'churn' } } },
        ],
      },
      { role: 'tool', tool_name: 'get_kpi_history', content: '{"points":[1,2]}' },
      { role: 'tool', tool_name: 'get_kpi_history', content: '{"points":[3]}' },
    ]);
  });

  it('plain text turns are unchanged on every adapter', async () => {
    const plain: AiMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const c = capture({ content: [{ type: 'text', text: 'x' }], stop_reason: 'end_turn', usage: {} });
    await new ClaudeProvider({ apiKey: 'k', fetchImpl: c.fetchImpl }).complete({ model: 'claude-haiku-4-5', messages: plain });
    expect(c.calls[0]!.messages).toEqual(plain);
    const o = capture({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }], usage: {} });
    await new OpenAiProvider({ apiKey: 'k', fetchImpl: o.fetchImpl }).complete({ model: 'gpt-4o-mini', messages: plain });
    expect(o.calls[0]!.messages).toEqual(plain);
  });
});
