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
