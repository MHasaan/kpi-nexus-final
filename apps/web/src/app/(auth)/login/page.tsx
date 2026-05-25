'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, loginRequest, setTokens } from '../../../lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await loginRequest({
        email,
        password,
        mfaCode: mfaRequired ? mfaCode : undefined,
      });
      setTokens(result.accessToken, result.refreshToken);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MFA_REQUIRED') {
        setMfaRequired(true);
        setError('Enter your 6-digit authenticator code.');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Login failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-content-strong">Sign in</h2>
      <p className="mt-1 text-sm text-content-muted">
        Access your organization's KPI workspace.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(v) => setEmail(v)}
          disabled={submitting}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(v) => setPassword(v)}
          disabled={submitting}
        />
        {mfaRequired && (
          <Field
            label="Authenticator code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            required
            value={mfaCode}
            onChange={(v) => setMfaCode(v)}
            disabled={submitting}
          />
        )}

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
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-content-muted">
        New here?{' '}
        <Link
          href="/register"
          className="font-medium text-accent-primary hover:underline"
        >
          Create an organization
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
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
    </label>
  );
}
