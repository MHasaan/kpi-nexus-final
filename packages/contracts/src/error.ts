import { z } from 'zod';

/**
 * Canonical error codes returned by the API.
 *
 * Extend as new domain modules ship; never reuse a code for a different meaning.
 */
export const ErrorCode = {
  // Generic
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // Scope (P2)
  WRONG_KPI_SCOPE_ENDPOINT: 'WRONG_KPI_SCOPE_ENDPOINT',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Shared error envelope returned by every endpoint on non-2xx responses.
 *
 * `code` is machine-readable; `message` is human-readable; `details` is
 * code-specific structured context (e.g., field validation errors).
 */
export const ErrorEnvelopeSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  requestId: z.string().optional(),
  timestamp: z.string().datetime(),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
