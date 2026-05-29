import { describe, expect, it } from 'vitest';

import { PRICING, priceCall } from './pricing.js';

describe('priceCall (USD cost from token usage)', () => {
  it('prices a Claude Opus call with input + output, no cache', () => {
    // 1M input @ $15 + 1M output @ $75 = $90
    const cost = priceCall('claude-opus-4-7', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(90, 6);
  });

  it('discounts cached input tokens at the cached rate', () => {
    // 1M input of which 1M cached → cachedInputPerMTok $1.5 (not $15); no output.
    const cost = priceCall('claude-opus-4-7', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(1.5, 6);
  });

  it('splits partially-cached input between full and cached rates', () => {
    // 1M input, 400k cached → 600k @ $15/M + 400k @ $1.5/M = 9 + 0.6 = $9.6
    const cost = priceCall('claude-opus-4-7', {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedTokens: 400_000,
    });
    expect(cost).toBeCloseTo(9.6, 6);
  });

  it('prices Gemini free tier at $0', () => {
    expect(
      priceCall('gemini-2.5-flash', { inputTokens: 5_000_000, outputTokens: 5_000_000 }),
    ).toBe(0);
  });

  it('prices any Ollama model at $0 via the wildcard tier', () => {
    expect(
      priceCall('ollama:llama3.1', { inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    ).toBe(0);
  });

  it('fails open (returns 0) on an unknown model', () => {
    expect(priceCall('some-future-model', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(
      0,
    );
  });

  it('prices OpenAI gpt-4o input + output', () => {
    // 1M input @ $2.5 + 1M output @ $10 = $12.5
    expect(priceCall('openai-gpt-4o', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(
      12.5,
      6,
    );
  });

  it('treats absent cachedTokens as zero cached', () => {
    const withUndef = priceCall('claude-haiku-4-5', { inputTokens: 2_000_000, outputTokens: 0 });
    const withZero = priceCall('claude-haiku-4-5', {
      inputTokens: 2_000_000,
      outputTokens: 0,
      cachedTokens: 0,
    });
    // 2M input @ $1/M = $2
    expect(withUndef).toBeCloseTo(2, 6);
    expect(withUndef).toBe(withZero);
  });

  it('exposes a non-empty pricing table keyed by model id', () => {
    expect(PRICING['gemini-2.5-flash']).toEqual({ inputPerMTok: 0, outputPerMTok: 0 });
    expect(Object.keys(PRICING).length).toBeGreaterThan(0);
  });
});
