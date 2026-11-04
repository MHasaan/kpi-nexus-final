'use client';

import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, loginRequest, setTokens } from '../../../lib/api-client';
import { safeNextPath } from '../../../lib/auth-redirect';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      // Back to the page that sent the user here (FE-009) — same-origin paths only.
      router.push(safeNextPath(new URLSearchParams(window.location.search).get('next')) ?? '/dashboard');
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
        {/* The label names ONLY the input; the show/hide toggle sits outside it, so
            the field is announced as "Password", not "Password Show password" (FE-008). */}
        <div className="block">
          <label htmlFor="login-password" className="text-sm font-medium text-content-default">
            Password
          </label>
          <div className="relative mt-1">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className="w-full rounded-md border border-border bg-surface-bg px-3 py-2 pr-10 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={submitting}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              data-testid="login-password-toggle"
              className="absolute inset-y-0 right-0 flex items-center px-3 text-content-muted transition hover:text-content-strong focus:outline-none focus-visible:text-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
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
        <p className="text-right text-sm">
          <Link href="/forgot-password" className="font-medium text-accent-primary hover:underline">
            Forgot password?
          </Link>
        </p>
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
