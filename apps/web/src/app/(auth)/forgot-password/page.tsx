'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { ApiError, requestPasswordReset } from '../../../lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the reset link. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div data-testid="forgot-sent">
        <h2 className="text-xl font-semibold text-content-strong">Check your email</h2>
        <p className="mt-3 text-sm text-content-muted">
          If an account exists for <span className="font-medium text-content-default">{email.trim()}</span>, we&apos;ve
          sent a link to reset its password. The link expires in an hour.
        </p>
        <p className="mt-6 text-center text-sm text-content-muted">
          <Link href="/login" className="font-medium text-accent-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-content-strong">Forgot your password?</h2>
      <p className="mt-1 text-sm text-content-muted">
        Enter your account email and we&apos;ll send you a link to choose a new one.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-content-default">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
          />
        </label>

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
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-content-muted">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-accent-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
