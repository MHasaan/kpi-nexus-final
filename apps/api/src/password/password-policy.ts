import { z } from 'zod';

/**
 * Per-org password policy (stored as Json on Organization.passwordPolicy).
 * Defaults are conservative; orgs override via /settings/password endpoint.
 */
export const PasswordPolicySchema = z.object({
  minLength: z.number().int().min(6).max(128).default(8),
  requireUppercase: z.boolean().default(false),
  requireLowercase: z.boolean().default(false),
  requireDigit: z.boolean().default(false),
  requireSpecial: z.boolean().default(false),
  /** Max age in days. 0 = no expiry. */
  maxAgeDays: z.number().int().min(0).default(0),
});

export type PasswordPolicy = z.infer<typeof PasswordPolicySchema>;

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: false,
  requireLowercase: false,
  requireDigit: false,
  requireSpecial: false,
  maxAgeDays: 0,
};

export interface PasswordPolicyViolation {
  field: string;
  message: string;
}

/**
 * Apply the policy; return any violations. Empty array = OK.
 *
 * Caller throws `ValidationException` / `BadRequestException` if non-empty.
 */
export function checkPasswordPolicy(
  password: string,
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
): PasswordPolicyViolation[] {
  const violations: PasswordPolicyViolation[] = [];
  if (password.length < policy.minLength) {
    violations.push({
      field: 'password',
      message: `must be at least ${policy.minLength} characters`,
    });
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    violations.push({ field: 'password', message: 'must contain an uppercase letter' });
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    violations.push({ field: 'password', message: 'must contain a lowercase letter' });
  }
  if (policy.requireDigit && !/\d/.test(password)) {
    violations.push({ field: 'password', message: 'must contain a digit' });
  }
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) {
    violations.push({ field: 'password', message: 'must contain a special character' });
  }
  return violations;
}

/** What a password needs under `policy`, in words — for a page to show before a password is typed. */
export function describePasswordPolicy(policy: PasswordPolicy): string[] {
  return [
    `at least ${policy.minLength} characters`,
    ...(policy.requireUppercase ? ['an uppercase letter'] : []),
    ...(policy.requireLowercase ? ['a lowercase letter'] : []),
    ...(policy.requireDigit ? ['a digit'] : []),
    ...(policy.requireSpecial ? ['a special character'] : []),
  ];
}

/**
 * Whether a password set at `changedAt` is older than the policy allows.
 * A maximum age of 0 means passwords do not expire; a password with no
 * recorded date has not expired (its clock has not started).
 */
export function passwordExpired(policy: PasswordPolicy, changedAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (policy.maxAgeDays <= 0 || !changedAt) return false;
  return now.getTime() - changedAt.getTime() > policy.maxAgeDays * 24 * 60 * 60 * 1000;
}

/**
 * Resolve an org's policy by parsing the Json field, falling back to defaults
 * on missing/invalid input so the caller never gets `null`.
 */
export function resolvePasswordPolicy(stored: unknown): PasswordPolicy {
  if (!stored || typeof stored !== 'object') return DEFAULT_PASSWORD_POLICY;
  const parsed = PasswordPolicySchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_PASSWORD_POLICY;
}
