'use client';

import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  type AuthUser,
  type MfaEnrollResult,
  type SessionSummary,
  changeMyPassword,
  confirmMfa,
  disableMfa,
  enrollMfa,
  listMySessions,
  revokeAllOtherSessions,
  revokeSession,
} from '../../lib/api-client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Skeleton,
} from '../ui';

interface SecurityTabProps {
  user: AuthUser;
  /** Reload the signed-in user after MFA enable/disable so status reflects. */
  onRefreshUser: () => Promise<void>;
}

export function SecurityTab({ user, onRefreshUser }: SecurityTabProps) {
  return (
    <div className="grid gap-5" data-testid="security-section">
      <ChangePasswordCard />
      <MfaCard user={user} onRefreshUser={onRefreshUser} />
      <SessionsCard />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change password
// ---------------------------------------------------------------------------

function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit =
    current.length > 0 && next.length > 0 && confirm.length > 0 && next === confirm;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      await changeMyPassword({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setSuccess('Password changed. You may need to sign in again on other devices.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="grid max-w-md gap-4"
          data-testid="change-password-form"
        >
          <div className="grid gap-2">
            <Label htmlFor="current-password" required>
              Current password
            </Label>
            <Input
              id="current-password"
              data-testid="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password" required>
              New password
            </Label>
            <Input
              id="new-password"
              data-testid="new-password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-password" required>
              Confirm new password
            </Label>
            <Input
              id="confirm-password"
              data-testid="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={saving}
              aria-invalid={mismatch || undefined}
            />
            {mismatch && (
              <p role="alert" className="text-xs text-status-critical">
                Passwords do not match.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              data-testid="save-password"
              isLoading={saving}
              disabled={!canSubmit}
            >
              {saving ? 'Saving…' : 'Update password'}
            </Button>
          </div>

          {success && (
            <p role="status" data-testid="password-success" className="text-sm text-status-success">
              {success}
            </p>
          )}
          {error && (
            <p role="alert" data-testid="password-error" className="text-sm text-status-critical">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Multi-factor authentication — preserves the original flow + all data-testids
// ---------------------------------------------------------------------------

function MfaCard({ user, onRefreshUser }: SecurityTabProps) {
  const [enrollment, setEnrollment] = useState<MfaEnrollResult | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [disableCode, setDisableCode] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  async function handleEnroll() {
    setEnrolling(true);
    setEnrollError(null);
    try {
      setEnrollment(await enrollMfa());
    } catch (err) {
      setEnrollError(err instanceof ApiError ? err.message : 'Failed to start enrollment');
    } finally {
      setEnrolling(false);
    }
  }

  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await confirmMfa({ code: confirmCode.trim(), recoveryCodes: enrollment.recoveryCodes });
      setEnrollment(null);
      setConfirmCode('');
      await onRefreshUser();
    } catch (err) {
      setConfirmError(
        err instanceof ApiError ? err.message : 'Confirmation failed — check your code',
      );
    } finally {
      setConfirming(false);
    }
  }

  async function handleDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDisabling(true);
    setDisableError(null);
    try {
      await disableMfa({ code: disableCode.trim() });
      setDisableCode('');
      await onRefreshUser();
    } catch (err) {
      setDisableError(err instanceof ApiError ? err.message : 'Disable failed — check your code');
    } finally {
      setDisabling(false);
    }
  }

  function cancelEnrollment() {
    setEnrollment(null);
    setConfirmCode('');
    setConfirmError(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Multi-factor authentication</CardTitle>
        <span data-testid="mfa-status">
          {user.mfaEnabled ? (
            <Badge tone="success">Enabled</Badge>
          ) : (
            <Badge tone="neutral">Not enabled</Badge>
          )}
        </span>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-content-muted">
          Multi-factor authentication adds a one-time code from your authenticator app on every
          sign-in.
        </p>

        {!user.mfaEnabled && !enrollment && (
          <div>
            <Button
              type="button"
              data-testid="enable-mfa-button"
              onClick={() => void handleEnroll()}
              isLoading={enrolling}
            >
              {enrolling ? 'Starting…' : 'Enable MFA'}
            </Button>
          </div>
        )}

        {enrollError && (
          <p role="alert" data-testid="mfa-enroll-error" className="text-sm text-status-critical">
            {enrollError}
          </p>
        )}

        {enrollment && (
          <div
            className="grid gap-5 rounded-lg border border-border bg-surface-1 p-4"
            data-testid="mfa-enrollment-panel"
          >
            <div>
              <h4 className="text-sm font-semibold text-content-strong">
                1. Add this secret to your authenticator app
              </h4>
              <p className="mt-1 text-xs text-content-muted">
                Scan the otpauth URL or copy the secret directly.
              </p>
              <p
                className="mt-2 break-all rounded bg-surface-bg px-2 py-1 font-mono text-xs text-content-strong"
                data-testid="mfa-secret"
              >
                {enrollment.secret}
              </p>
              <a
                href={enrollment.otpauthUrl}
                data-testid="mfa-otpauth-url"
                className="mt-1 block break-all text-xs text-accent-primary underline"
              >
                {enrollment.otpauthUrl}
              </a>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-content-strong">
                2. Save these recovery codes
              </h4>
              <p className="mt-1 text-xs text-content-muted">
                Each code can be used once if you lose access to your authenticator.
              </p>
              <ul
                className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-xs"
                data-testid="mfa-recovery-codes"
              >
                {enrollment.recoveryCodes.map((c) => (
                  <li
                    key={c}
                    className="rounded bg-surface-bg px-2 py-1 text-content-strong"
                    data-testid="mfa-recovery-code"
                  >
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-content-strong">
                3. Confirm with the 6-digit code from your app
              </h4>
              <form onSubmit={handleConfirm} className="mt-2 flex items-end gap-3">
                <div className="flex-1">
                  <Label htmlFor="mfa-confirm-code" className="sr-only">
                    6-digit code
                  </Label>
                  <Input
                    id="mfa-confirm-code"
                    required
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={confirmCode}
                    onChange={(e) => setConfirmCode(e.target.value)}
                    disabled={confirming}
                    data-testid="mfa-confirm-code"
                    placeholder="123456"
                    className="max-w-[12rem] font-mono"
                  />
                </div>
                <Button
                  type="submit"
                  data-testid="mfa-confirm-button"
                  isLoading={confirming}
                  disabled={confirmCode.length < 6}
                >
                  {confirming ? 'Confirming…' : 'Confirm'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="mfa-cancel-button"
                  onClick={cancelEnrollment}
                >
                  Cancel
                </Button>
              </form>
              {confirmError && (
                <p
                  role="alert"
                  data-testid="mfa-confirm-error"
                  className="mt-2 text-sm text-status-critical"
                >
                  {confirmError}
                </p>
              )}
            </div>
          </div>
        )}

        {user.mfaEnabled && (
          <form
            onSubmit={handleDisable}
            className="grid max-w-md gap-2"
            data-testid="mfa-disable-form"
          >
            <Label htmlFor="mfa-disable-code">
              Disable MFA — enter your 6-digit code or a recovery code
            </Label>
            <div className="flex items-end gap-3">
              <Input
                id="mfa-disable-code"
                required
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                disabled={disabling}
                data-testid="mfa-disable-code"
                className="flex-1 font-mono"
              />
              <Button
                type="submit"
                variant="danger"
                data-testid="mfa-disable-button"
                isLoading={disabling}
              >
                {disabling ? 'Disabling…' : 'Disable MFA'}
              </Button>
            </div>
            {disableError && (
              <p
                role="alert"
                data-testid="mfa-disable-error"
                className="text-sm text-status-critical"
              >
                {disableError}
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Active sessions (inline)
// ---------------------------------------------------------------------------

function SessionsCard() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setSessions(await listMySessions());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRevoke(id: string) {
    setRevoking(id);
    setError(null);
    setSuccess(null);
    try {
      await revokeSession(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to revoke session');
    } finally {
      setRevoking(null);
    }
  }

  async function handleRevokeAll() {
    setRevokingAll(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await revokeAllOtherSessions();
      setSuccess(
        result.revoked === 0
          ? 'No other sessions to revoke.'
          : `Revoked ${result.revoked} other session${result.revoked === 1 ? '' : 's'}.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to revoke sessions');
    } finally {
      setRevokingAll(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="revoke-all-button"
          onClick={() => void handleRevokeAll()}
          isLoading={revokingAll}
          disabled={loading}
        >
          {revokingAll ? 'Revoking…' : 'Sign out of all other sessions'}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-content-muted">
          Devices currently signed in to your account. Revoking a session signs that device out
          immediately.{' '}
          <Link
            href="/me/sessions"
            data-testid="manage-sessions-link"
            className="text-accent-primary hover:underline"
          >
            Open full session manager
          </Link>
          .
        </p>

        {error && (
          <p role="alert" data-testid="sessions-error" className="text-sm text-status-critical">
            {error}
          </p>
        )}
        {success && (
          <p role="status" data-testid="sessions-success" className="text-sm text-status-success">
            {success}
          </p>
        )}

        {loading ? (
          <div className="grid gap-2" data-testid="sessions-loading">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : sessions.length === 0 ? (
          <div data-testid="sessions-empty">
            <EmptyState title="No active sessions found." />
          </div>
        ) : (
          <ul className="grid gap-2" data-testid="sessions-list">
            {sessions.map((s) => (
              <li
                key={s.id}
                data-testid={`session-row-${s.id}`}
                className="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface-1 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-content-strong">
                    {s.deviceInfo ?? s.userAgent ?? 'Unknown device'}
                  </p>
                  {s.ipAddress && (
                    <p className="mt-0.5 text-xs text-content-muted">IP: {s.ipAddress}</p>
                  )}
                  <p className="mt-0.5 text-xs text-content-muted">
                    Started {new Date(s.createdAt).toLocaleString()} · Expires{' '}
                    {new Date(s.expiresAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid={`revoke-session-${s.id}`}
                  onClick={() => void handleRevoke(s.id)}
                  isLoading={revoking === s.id}
                >
                  {revoking === s.id ? 'Revoking…' : 'Revoke'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
