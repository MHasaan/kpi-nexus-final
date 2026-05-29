import type { AiProviderKey } from '@kpi-nexus/contracts';

import { AiProviderError } from '../types.js';

/** Adapters accept an injectable fetch so tests run without network. */
export type FetchImpl = typeof fetch;

export const resolveFetch = (f?: FetchImpl): FetchImpl => f ?? (globalThis.fetch as FetchImpl);

/**
 * 429 (rate limit) and 5xx (server) are transient — the router may fall back to
 * another provider. 4xx (bad request / auth) are permanent; falling back won't
 * help, so surface them as non-retryable.
 */
export const isRetryableStatus = (status: number): boolean => status === 429 || status >= 500;

/** Throw a typed transport error for a non-OK HTTP response. */
export function httpError(provider: AiProviderKey, status: number, detail: string): AiProviderError {
  return new AiProviderError(
    `${provider} request failed (${status}): ${detail}`,
    provider,
    isRetryableStatus(status),
    status,
  );
}

/** Adapters require a concrete model id (router-populated). */
export function requireModel(provider: AiProviderKey, model: string | undefined): string {
  if (!model) {
    throw new AiProviderError(`${provider} call missing model id`, provider, false);
  }
  return model;
}
