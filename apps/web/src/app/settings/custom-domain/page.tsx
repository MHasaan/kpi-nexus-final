'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { PermissionGuard } from '../../../components/auth/permission-guard';
import {
  ApiError,
  deleteCustomDomain,
  getAccessToken,
  listCustomDomains,
  registerCustomDomain,
  verifyCustomDomain,
  type CustomDomain,
} from '../../../lib/api-client';

export default function CustomDomainSettingsPage() {
  const router = useRouter();
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDomains(await listCustomDomains());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load custom domains');
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [load, router]);

  const add = async () => {
    if (!input.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await registerCustomDomain(input.trim());
      setInput('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Register failed');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (id: string) => {
    setError(null);
    try {
      await verifyCustomDomain(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Verify failed');
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteCustomDomain(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed');
    }
  };

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-4">
          <Link href="/settings" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Custom domain</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong" data-testid="custom-domain-heading">Custom domain</h1>
        <p className="mt-1 text-sm text-content-muted">
          Serve KPI Nexus from your own domain. Add a domain, then create the DNS TXT record we generate and click Verify.
        </p>
        {error && <p className="mt-2 text-sm text-status-critical" data-testid="custom-domain-error">{error}</p>}

        <PermissionGuard permission="ORG_SETTINGS">
          <div className="mt-5 flex gap-2">
            <input
              data-testid="custom-domain-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="dashboards.acme.com"
              className="flex-1 rounded border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong"
            />
            <button
              type="button"
              data-testid="custom-domain-add"
              onClick={add}
              disabled={busy}
              className="rounded bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? 'Adding…' : 'Add domain'}
            </button>
          </div>
        </PermissionGuard>

        <div className="mt-6 space-y-3" data-testid="custom-domain-list">
          {domains.map((d) => (
            <div key={d.id} data-testid={`custom-domain-${d.id}`} className="rounded-lg border border-border bg-surface-1 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-content-strong">{d.domain}</span>
                {d.verifiedAt ? (
                  <span className="rounded bg-status-success/10 px-2 py-0.5 text-xs text-status-success" data-testid={`custom-domain-status-${d.id}`}>
                    verified
                  </span>
                ) : (
                  <span className="rounded bg-status-warning/10 px-2 py-0.5 text-xs text-status-warning" data-testid={`custom-domain-status-${d.id}`}>
                    pending
                  </span>
                )}
              </div>

              {!d.verifiedAt && (
                <div className="mt-3 rounded border border-border bg-surface-bg p-3">
                  <p className="text-xs font-medium text-content-strong">Add this DNS TXT record:</p>
                  <dl className="mt-1 space-y-1">
                    <div className="flex gap-2">
                      <dt className="w-12 shrink-0 text-content-muted">Name</dt>
                      <dd className="break-all text-content-strong"><code>{d.txtChallengeKey}</code></dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-12 shrink-0 text-content-muted">Value</dt>
                      <dd className="break-all text-content-strong"><code>{d.txtChallengeValue}</code></dd>
                    </div>
                  </dl>
                  {d.lastCheckError && (
                    <p className="mt-2 text-xs text-status-critical" data-testid={`custom-domain-checkerror-${d.id}`}>{d.lastCheckError}</p>
                  )}
                </div>
              )}

              <PermissionGuard permission="ORG_SETTINGS">
                <div className="mt-3 flex items-center gap-3">
                  {!d.verifiedAt && (
                    <button
                      type="button"
                      data-testid={`custom-domain-verify-${d.id}`}
                      onClick={() => verify(d.id)}
                      className="rounded border border-border px-3 py-1 text-xs text-content-default hover:bg-surface-2"
                    >
                      Verify
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid={`custom-domain-delete-${d.id}`}
                    onClick={() => remove(d.id)}
                    className="text-xs text-status-critical hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </PermissionGuard>
            </div>
          ))}
          {domains.length === 0 && (
            <p className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted" data-testid="custom-domain-empty">
              No custom domains yet.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
