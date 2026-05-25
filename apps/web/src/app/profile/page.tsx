'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  confirmMfa,
  disableMfa,
  enrollMfa,
  getAccessToken,
  meRequest,
  type AuthUser,
  type MfaEnrollResult,
} from '../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../lib/terminology-context';

export default function ProfilePage() {
  return (
    <TerminologyProvider>
      <ProfilePageInner />
    </TerminologyProvider>
  );
}

function ProfilePageInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // MFA enrollment ephemeral state
  const [enrollment, setEnrollment] = useState<MfaEnrollResult | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Disable flow
  const [disableCode, setDisableCode] = useState('');
  const [disabling, setDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router]);

  async function refresh() {
    setLoadError(null);
    try {
      const res = await meRequest();
      setUser(res.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load profile');
    }
  }

  async function handleEnroll() {
    setEnrolling(true);
    setEnrollError(null);
    try {
      const result = await enrollMfa();
      setEnrollment(result);
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
      await confirmMfa({
        code: confirmCode.trim(),
        recoveryCodes: enrollment.recoveryCodes,
      });
      // Success: clear enrollment state, reload user
      setEnrollment(null);
      setConfirmCode('');
      await refresh();
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
      await refresh();
    } catch (err) {
      setDisableError(
        err instanceof ApiError ? err.message : 'Disable failed — check your code',
      );
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
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-lg font-semibold text-content-strong hover:text-accent-primary"
            >
              KPI Nexus
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="text-content-muted hover:text-content-strong">
                Dashboard
              </Link>
              <Link href="/users" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.memberLabel)}
              </Link>
              <Link href="/roles" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.roleLabel)}
              </Link>
              <Link href="/positions" className="text-content-muted hover:text-content-strong">
                Positions
              </Link>
              <Link
                href="/profile"
                className="font-medium text-accent-primary"
                data-testid="nav-profile"
              >
                Profile
              </Link>
              <Link
                href="/settings/organization"
                className="text-content-muted hover:text-content-strong"
              >
                Settings
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1
          className="mb-6 text-2xl font-semibold text-content-strong"
          data-testid="profile-heading"
        >
          My profile
        </h1>

        {loadError && (
          <div
            role="alert"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {user && (
          <>
            <section className="mb-8 rounded-lg border border-border bg-surface-1 p-6">
              <h2 className="text-lg font-semibold text-content-strong">Account</h2>
              <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Row label="Name" value={user.fullName} />
                <Row label="Email" value={user.email} />
                <Row label="User ID" value={user.id} mono />
                <Row label="Status" value={user.status ?? 'ACTIVE'} />
              </dl>
            </section>

            <section
              className="rounded-lg border border-border bg-surface-1 p-6"
              data-testid="security-section"
            >
              <h2 className="text-lg font-semibold text-content-strong">Security</h2>
              <p className="mt-1 text-sm text-content-muted">
                Multi-factor authentication adds a one-time code from your
                authenticator app on every sign-in.
              </p>

              <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-surface-bg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-content-default">
                    Multi-factor authentication
                  </p>
                  <p
                    className="mt-0.5 text-sm"
                    data-testid="mfa-status"
                  >
                    {user.mfaEnabled ? (
                      <span className="text-status-success">Enabled</span>
                    ) : (
                      <span className="text-content-muted">Not enabled</span>
                    )}
                  </p>
                </div>
                {!user.mfaEnabled && !enrollment && (
                  <button
                    type="button"
                    onClick={() => void handleEnroll()}
                    disabled={enrolling}
                    data-testid="enable-mfa-button"
                    className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {enrolling ? 'Starting…' : 'Enable MFA'}
                  </button>
                )}
              </div>

              {enrollError && (
                <p
                  role="alert"
                  data-testid="mfa-enroll-error"
                  className="mt-3 text-sm text-status-critical"
                >
                  {enrollError}
                </p>
              )}

              {enrollment && (
                <div
                  className="mt-4 rounded-lg border border-border bg-surface-bg p-4"
                  data-testid="mfa-enrollment-panel"
                >
                  <h3 className="text-sm font-semibold text-content-strong">
                    1. Add this secret to your authenticator app
                  </h3>
                  <p className="mt-1 text-xs text-content-muted">
                    Scan the otpauth URL or copy the secret directly.
                  </p>
                  <p
                    className="mt-2 break-all rounded bg-surface-1 px-2 py-1 font-mono text-xs"
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

                  <h3 className="mt-5 text-sm font-semibold text-content-strong">
                    2. Save these recovery codes
                  </h3>
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
                        className="rounded bg-surface-1 px-2 py-1"
                        data-testid="mfa-recovery-code"
                      >
                        {c}
                      </li>
                    ))}
                  </ul>

                  <h3 className="mt-5 text-sm font-semibold text-content-strong">
                    3. Confirm with the 6-digit code from your app
                  </h3>
                  <form onSubmit={handleConfirm} className="mt-2 flex items-end gap-3">
                    <label className="flex-1">
                      <span className="sr-only">6-digit code</span>
                      <input
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
                        className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 font-mono text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={confirming || confirmCode.length < 6}
                      data-testid="mfa-confirm-button"
                      className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {confirming ? 'Confirming…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEnrollment}
                      data-testid="mfa-cancel-button"
                      className="rounded-md border border-border px-3 py-2 text-sm text-content-default transition hover:bg-surface-2"
                    >
                      Cancel
                    </button>
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
              )}

              {user.mfaEnabled && (
                <form
                  onSubmit={handleDisable}
                  className="mt-4 flex items-end gap-3"
                  data-testid="mfa-disable-form"
                >
                  <label className="flex-1">
                    <span className="text-sm font-medium text-content-default">
                      Disable MFA — enter your 6-digit code or a recovery code
                    </span>
                    <input
                      required
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value)}
                      disabled={disabling}
                      data-testid="mfa-disable-code"
                      className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 font-mono text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={disabling}
                    data-testid="mfa-disable-button"
                    className="rounded-md border border-status-critical px-4 py-2 text-sm font-medium text-status-critical transition hover:bg-status-critical/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {disabling ? 'Disabling…' : 'Disable MFA'}
                  </button>
                </form>
              )}
              {disableError && (
                <p
                  role="alert"
                  data-testid="mfa-disable-error"
                  className="mt-2 text-sm text-status-critical"
                >
                  {disableError}
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-content-muted">
        {label}
      </dt>
      <dd className={`mt-1 text-sm text-content-strong ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
