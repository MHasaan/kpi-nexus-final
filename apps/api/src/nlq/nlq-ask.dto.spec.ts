import { describe, expect, it } from 'vitest';

import { AskSchema, MAX_HISTORY_TURNS } from './nlq-ask.dto.js';

describe('AskSchema — the body of POST /nlq/ask', () => {
  it('a question alone is enough', () => {
    expect(AskSchema.parse({ question: ' How are we doing? ' })).toEqual({ question: 'How are we doing?' });
  });

  it('accepts the earlier turns of the conversation', () => {
    const body = { question: 'and last month?', history: [{ question: 'How is Revenue?', answer: 'Revenue is 10.' }] };
    expect(AskSchema.parse(body).history).toEqual(body.history);
  });

  it('refuses more earlier turns than the model is given', () => {
    const turn = { question: 'q', answer: 'a' };
    expect(AskSchema.safeParse({ question: 'q', history: Array.from({ length: MAX_HISTORY_TURNS }, () => turn) }).success).toBe(true);
    expect(AskSchema.safeParse({ question: 'q', history: Array.from({ length: MAX_HISTORY_TURNS + 1 }, () => turn) }).success).toBe(false);
  });

  it('refuses an over-long earlier answer and unknown fields', () => {
    expect(AskSchema.safeParse({ question: 'q', history: [{ question: 'q', answer: 'x'.repeat(8001) }] }).success).toBe(false);
    expect(AskSchema.safeParse({ question: 'q', history: [{ question: 'q', answer: 'a', role: 'system' }] }).success).toBe(false);
  });
});
