/**
 * Thin client for the AI layer (insights / recommendations) used by the
 * dashboard preview cards and the dedicated AI pages. Mirrors the other
 * domain-client modules (collab-client, polish-client).
 */
import { api } from './api-client';

export interface Insight {
  id: string;
  kpiId: string;
  narrative: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  generatedAt: string;
  status: string;
  /** 0–1 model confidence (point count + change magnitude). */
  confidence: number;
}

/**
 * Latest non-dismissed AI insights for the org (newest first per the API).
 * Visibility-scoped server-side; a 403/empty simply yields no preview.
 */
export function listInsights(params: { kpiId?: string } = {}): Promise<Insight[]> {
  const q = new URLSearchParams(params as Record<string, string>).toString();
  return api(`/insights${q ? `?${q}` : ''}`);
}
