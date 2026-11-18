import { ApiError } from './api-client';

/**
 * What to tell someone whose new password was refused. The API lists the rules
 * that were broken as `details.violations: [{ field, message }]`; this joins
 * them into one sentence. Any other failure gives the API's message, or
 * `fallback` when the failure is not from the API.
 */
export function passwordRefusal(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  const violations = (err.details as { violations?: Array<{ message?: unknown }> } | null | undefined)?.violations;
  const rules = Array.isArray(violations)
    ? violations.map((v) => v?.message).filter((m): m is string => typeof m === 'string' && m.length > 0)
    : [];
  if (rules.length === 0) return err.message;
  const last = rules[rules.length - 1];
  const joined = rules.length === 1 ? last : `${rules.slice(0, -1).join(', ')} and ${last}`;
  return `The password ${joined}.`;
}

/** Why a password policy cannot be saved as typed, or null when it can. Mirrors the API's limits. */
export function passwordPolicyProblem(policy: { minLength: number; maxAgeDays: number }): string | null {
  if (!Number.isInteger(policy.minLength) || policy.minLength < 6 || policy.minLength > 128) {
    return 'Minimum length must be a whole number from 6 to 128.';
  }
  if (!Number.isInteger(policy.maxAgeDays) || policy.maxAgeDays < 0) {
    return 'Max age must be a whole number of days, 0 or more. 0 means passwords never expire.';
  }
  return null;
}
