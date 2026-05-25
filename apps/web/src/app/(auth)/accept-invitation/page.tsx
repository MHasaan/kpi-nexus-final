'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';

import {
  acceptInvitation,
  ApiError,
  setTokens,
} from '../../../lib/api-client';

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<p className="text-sm text-content-muted">Loading…</p>}>
      <AcceptInvitationInner />
    </Suspense>
  );
}

function AcceptInvitationInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);

  useEffect(() => {
    setTokenMissing(token.trim().length === 0);
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await acceptInvitation({ token, password });
      setTokens(res.accessToken, res.refreshToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not accept invitation.');
    } finally {
      setSubmitting(false);
    }
  }

  if (tokenMissing) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-content-strong">
          Invitation link is missing a token
        </h2>
        <p className="mt-3 text-sm text-content-muted">
          The link from your email should look like
          <code className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
            /auth/accept-invitation?token=…
          </code>
          . Please copy the full URL from the email and try again.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-content-strong">
        Accept your invitation
      </h2>
      <p className="mt-1 text-sm text-content-muted">
        Set a password to finish creating your account.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={setPassword}
          disabled={submitting}
          helperText="At least 8 characters."
          testId="invite-password"
        />
        <Field
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={setConfirm}
          disabled={submitting}
          testId="invite-confirm-password"
        />

        {error && (
          <div
            role="alert"
            className="rounded-md border border-status-critical/40 bg-status-critical/10 px-3 py-2 text-sm text-status-critical"
            data-testid="invite-error"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="invite-submit"
        >
          {submitting ? 'Accepting…' : 'Accept invitation'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  helperText,
  testId,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helperText?: string;
  testId?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-content-default">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
      />
      {helperText && (
        <span className="mt-1 block text-xs text-content-muted">{helperText}</span>
      )}
    </label>
  );
}
