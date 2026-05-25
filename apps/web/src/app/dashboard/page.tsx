'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  logoutRequest,
  meRequest,
  type AuthUser,
} from '../../lib/api-client';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const token = getAccessToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    meRequest()
      .then((res) => {
        if (!cancelled) {
          setUser(res.user);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace('/login');
        } else if (err instanceof ApiError) {
          setError(err.message);
          setLoading(false);
        } else {
          setError('Failed to load your account.');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    await logoutRequest();
    router.push('/login');
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-lg font-semibold text-content-strong">
            KPI Nexus
          </h1>
          {user && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-content-muted">{user.email}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-content-default transition hover:bg-surface-2"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {loading && (
          <p className="text-sm text-content-muted">Loading your account…</p>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {error}
          </div>
        )}
        {user && (
          <div>
            <h2 className="text-2xl font-semibold text-content-strong">
              Welcome back, {user.fullName.split(' ')[0]}.
            </h2>
            <p className="mt-1 text-sm text-content-muted">
              This is your placeholder dashboard — the real one ships with P3.
            </p>

            <dl className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card label="Email" value={user.email} />
              <Card label="Name" value={user.fullName} />
              <Card label="User ID" value={user.id} mono />
              <Card label="Organization ID" value={user.organizationId} mono />
              <Card label="Role ID" value={user.roleId ?? '(no role assigned)'} mono />
            </dl>
          </div>
        )}
      </div>
    </main>
  );
}

function Card({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-content-muted">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm text-content-strong ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}
