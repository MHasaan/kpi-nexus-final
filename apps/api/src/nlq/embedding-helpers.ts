/**
 * Pure helpers for NLQ catalog embeddings. Kept free of Prisma/Nest so the
 * text-building, column selection, and vector formatting are unit-testable.
 */

/** Per-provider embedding column, keyed by the vector dimension it produces. */
const DIM_TO_COLUMN: Record<number, 'embedding_openai' | 'embedding_gemini' | 'embedding_voyage'> = {
  1536: 'embedding_openai',
  768: 'embedding_gemini',
  1024: 'embedding_voyage',
};

export type EmbeddingColumn = (typeof DIM_TO_COLUMN)[keyof typeof DIM_TO_COLUMN];

/** The text we embed for a KPI: name + description + tags. */
export function sourceTextForKpi(kpi: { name: string; description?: string | null; tags?: string[] }): string {
  return [kpi.name, kpi.description ?? '', (kpi.tags ?? []).join(' ')]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join('. ');
}

/** Resolve the storage/search column for a produced embedding's dimension. */
export function columnForDim(dim: number): EmbeddingColumn {
  const col = DIM_TO_COLUMN[dim];
  if (!col) throw new Error(`Unsupported embedding dimension: ${dim}`);
  return col;
}

/** Format a vector as a pgvector literal `[a,b,c]`. Rejects non-finite values. */
export function toVectorLiteral(vec: number[]): string {
  for (const v of vec) {
    if (!Number.isFinite(v)) throw new Error('Embedding contains a non-finite value');
  }
  return `[${vec.join(',')}]`;
}
