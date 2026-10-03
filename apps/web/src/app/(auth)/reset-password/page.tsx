'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';

import { ApiError, confirmPasswordReset } from '../../../lib/api-client';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-sm text-content-muted">Loading…</p>}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const token = (useSearchParams().get('token') ?? '').trim();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        // Policy violations come back as details.violations — show them, not just the summary.
        const violations = (err.details as { violations?: string[] } | undefined)?.violations;
        setError(violations?.length ? `${err.message}: ${violations.join('; ')}` : err.message);
      } else {
        setError('Could not reset your password. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-content-strong">Reset link is missing its token</h2>
        <p className="mt-3 text-sm text-content-muted">
          Open the link from your reset email in full, or{' '}
          <Link href="/forgot-password" className="font-medium text-accent-primary hover:underline">
            request a new link
          </Link>
          .
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div data-testid="reset-done">
        <h2 className="text-xl font-semibold text-content-strong">Password updated</h2>
        <p className="mt-3 text-sm text-content-muted">
          You&apos;ve been signed out everywhere else. Use your new password to sign in.
        </p>
        <Link
          href="/login"
          className="mt-6 block w-full rounded-md bg-accent-primary px-4 py-2 text-center text-sm font-medium text-white shadow-sm transition hover:bg-accent-primary/90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-content-strong">Choose a new password</h2>
      <p className="mt-1 text-sm text-content-muted">This link can be used once and expires an hour after it was sent.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <PasswordField label="New password" value={password} onChange={setPassword} disabled={submitting} testId="reset-password" />
        <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} disabled={submitting} testId="reset-confirm" />

        {error && (
          <div
            role="alert"
            className="rounded-md border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-status-critical"
          >
            {error}{' '}
            {/invalid|expired|already used/i.test(error) && (
              <Link href="/forgot-password" className="font-medium underline">
                Request a new link
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  testId: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-content-default">{label}</span>
      <input
        type="password"
        autoComplete="new-password"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        data-testid={testId}
        className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
      />
    </label>
  );
}
