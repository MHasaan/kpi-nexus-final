import { describe, expect, it } from 'vitest';

import { columnForDim, sourceTextForKpi, toVectorLiteral } from './embedding-helpers.js';

describe('sourceTextForKpi', () => {
  it('concatenates name, description, and tags', () => {
    const t = sourceTextForKpi({ name: 'MRR', description: 'Monthly recurring revenue', tags: ['finance', 'saas'] });
    expect(t).toContain('MRR');
    expect(t).toContain('Monthly recurring revenue');
    expect(t).toContain('finance');
    expect(t).toContain('saas');
  });

  it('handles missing description and empty tags', () => {
    const t = sourceTextForKpi({ name: 'Churn', description: null, tags: [] });
    expect(t).toContain('Churn');
    expect(t.trim().length).toBeGreaterThan(0);
  });
});

describe('columnForDim', () => {
  it('maps known embedding dimensions to provider columns', () => {
    expect(columnForDim(1536)).toBe('embedding_openai');
    expect(columnForDim(768)).toBe('embedding_gemini');
    expect(columnForDim(1024)).toBe('embedding_voyage');
  });

  it('throws on an unsupported dimension', () => {
    expect(() => columnForDim(42)).toThrow();
  });
});

describe('toVectorLiteral', () => {
  it('formats a number array as a pgvector literal', () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
  });

  it('rejects non-finite values (would corrupt the vector literal)', () => {
    expect(() => toVectorLiteral([1, Number.NaN])).toThrow();
    expect(() => toVectorLiteral([1, Infinity])).toThrow();
  });
});
