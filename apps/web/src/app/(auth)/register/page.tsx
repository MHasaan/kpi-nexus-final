'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, registerRequest, setTokens } from '../../../lib/api-client';

export default function RegisterPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await registerRequest({
        orgName,
        slug,
        adminFullName,
        adminEmail,
        adminPassword,
      });
      setTokens(result.accessToken, result.refreshToken);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function slugifyOrgName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-content-strong">
        Create your organization
      </h2>
      <p className="mt-1 text-sm text-content-muted">
        You'll be the first admin and can invite others after.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field
          label="Organization name"
          autoComplete="organization"
          required
          value={orgName}
          onChange={(v) => {
            setOrgName(v);
            if (!slug || slug === slugifyOrgName(orgName)) {
              setSlug(slugifyOrgName(v));
            }
          }}
          disabled={submitting}
        />
        <Field
          label="URL slug"
          required
          value={slug}
          onChange={(v) =>
            setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))
          }
          disabled={submitting}
          helperText="Lowercase letters, digits, hyphens — used in your workspace URL."
        />
        <Field
          label="Your full name"
          autoComplete="name"
          required
          value={adminFullName}
          onChange={(v) => setAdminFullName(v)}
          disabled={submitting}
        />
        <Field
          label="Your email"
          type="email"
          autoComplete="email"
          required
          value={adminEmail}
          onChange={(v) => setAdminEmail(v)}
          disabled={submitting}
        />
        <div>
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={adminPassword}
            onChange={(v) => setAdminPassword(v)}
            disabled={submitting}
            helperText="At least 8 characters."
          />
          {adminPassword.length > 0 && (
            <PasswordStrengthMeter password={adminPassword} />
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-status-critical"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create organization'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-content-muted">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-accent-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

type StrengthLevel = 0 | 1 | 2 | 3 | 4;

const STRENGTH_META: Record<
  Exclude<StrengthLevel, 0>,
  { label: string; bar: string; text: string }
> = {
  1: { label: 'Weak', bar: 'bg-status-critical', text: 'text-status-critical' },
  2: { label: 'Fair', bar: 'bg-status-warning', text: 'text-status-warning' },
  3: { label: 'Good', bar: 'bg-accent-primary', text: 'text-accent-primary' },
  4: { label: 'Strong', bar: 'bg-status-positive', text: 'text-status-positive' },
};

/**
 * Lightweight client-side heuristic — purely advisory. The backend password
 * policy remains the source of truth for acceptance.
 */
function scorePassword(password: string): StrengthLevel {
  if (password.length === 0) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password),
  ).length;
  if (classes >= 2) score += 1;
  if (classes >= 3) score += 1;
  return Math.min(4, Math.max(1, score)) as StrengthLevel;
}

function PasswordStrengthMeter({ password }: { password: string }) {
  const level = scorePassword(password);
  if (level === 0) return null;
  const meta = STRENGTH_META[level];
  return (
    <div className="mt-2" data-testid="register-password-strength">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <span
            key={segment}
            className={`h-1.5 flex-1 rounded-full ${
              segment <= level ? meta.bar : 'bg-surface-2'
            }`}
          />
        ))}
      </div>
      <span
        className={`mt-1 block text-xs font-medium ${meta.text}`}
        data-testid="register-password-strength-label"
      >
        Password strength: {meta.label}
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  helperText,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helperText?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-content-default">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
      />
      {helperText && (
        <span className="mt-1 block text-xs text-content-muted">
          {helperText}
        </span>
      )}
    </label>
  );
}
