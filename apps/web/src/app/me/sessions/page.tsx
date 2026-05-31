'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AppShell } from '../../../components/app-shell';
import {
  ApiError,
  type SessionSummary,
  getAccessToken,
  listMySessions,
  revokeSession,
  revokeAllOtherSessions,
} from '../../../lib/api-client';

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null); // id of session being revoked
  const [revokingAll, setRevokingAll] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await listMySessions();
      setSessions(data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace('/login');
        return;
      }
      setError(e instanceof ApiError ? e.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [load, router]);

  async function handleRevoke(id: string) {
    setRevoking(id);
    setError(null);
    setSuccessMsg(null);
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
    setSuccessMsg(null);
    try {
      const result = await revokeAllOtherSessions();
      setSuccessMsg(
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
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1
            className="text-2xl font-semibold text-content-strong"
            data-testid="sessions-heading"
          >
            Active sessions
          </h1>
          <button
            type="button"
            onClick={() => void handleRevokeAll()}
            disabled={revokingAll || loading}
            data-testid="revoke-all-button"
            className="rounded-md border border-status-critical px-4 py-2 text-sm font-medium text-status-critical transition hover:bg-status-critical/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {revokingAll ? 'Revoking…' : 'Revoke all other sessions'}
          </button>
        </div>

        {error && (
          <div
            role="alert"
            data-testid="sessions-error"
            className="mb-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {error}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            data-testid="sessions-success"
            className="mb-4 rounded-md border border-status-success/40 bg-status-success/10 px-4 py-3 text-sm text-status-success"
          >
            {successMsg}
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-sm text-content-muted" data-testid="sessions-loading">
            Loading sessions…
          </p>
        ) : sessions.length === 0 ? (
          <div
            className="rounded-lg border border-border bg-surface-1 p-8 text-center"
            data-testid="sessions-empty"
          >
            <p className="text-content-muted">No active sessions found.</p>
          </div>
        ) : (
          <ul className="space-y-3" data-testid="sessions-list">
            {sessions.map((s) => (
              <li
                key={s.id}
                data-testid={`session-row-${s.id}`}
                className="flex items-start justify-between rounded-lg border border-border bg-surface-1 p-4"
              >
                <div className="min-w-0 flex-1 pr-4">
                  <p className="truncate text-sm font-medium text-content-strong">
                    {s.deviceInfo ?? s.userAgent ?? 'Unknown device'}
                  </p>
                  {s.ipAddress && (
                    <p className="mt-0.5 text-xs text-content-muted">IP: {s.ipAddress}</p>
                  )}
                  <p className="mt-0.5 text-xs text-content-muted">
                    Started: {new Date(s.createdAt).toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-xs text-content-muted">
                    Expires: {new Date(s.expiresAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevoke(s.id)}
                  disabled={revoking === s.id}
                  data-testid={`revoke-session-${s.id}`}
                  className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-content-default transition hover:border-status-critical hover:text-status-critical disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {revoking === s.id ? 'Revoking…' : 'Revoke'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-xs text-content-muted">
          Revoking a session signs that device out immediately. &ldquo;Revoke all other sessions&rdquo; keeps your current session active.
        </p>
      </div>
    </AppShell>
  );
}
