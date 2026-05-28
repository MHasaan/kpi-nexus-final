'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  createShareLink,
  getAccessToken,
  getDashboard,
  listShareLinks,
  revokeShareLink,
  type Dashboard,
  type ShareLink,
} from '../../../../lib/api-client';

function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export default function DashboardSharePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const dashboardId = params.id;

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create form
  const [expiresAt, setExpiresAt] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<ShareLink | null>(null);

  // Revoke
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router, dashboardId]);

  async function refresh() {
    setLoadError(null);
    try {
      const [dash, linkList] = await Promise.all([
        getDashboard(dashboardId),
        listShareLinks(dashboardId),
      ]);
      setDashboard(dash);
      setLinks(linkList);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load share links');
    }
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setNewLink(null);
    try {
      const link = await createShareLink(dashboardId, {
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        password: password.trim() || undefined,
      });
      setNewLink(link);
      setExpiresAt('');
      setPassword('');
      await refresh();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create share link');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(linkId: string) {
    if (!window.confirm('Revoke this share link? It will no longer be accessible.')) return;
    setRevokingId(linkId);
    setActionError(null);
    try {
      await revokeShareLink(linkId);
      if (newLink?.id === linkId) setNewLink(null);
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to revoke link');
    } finally {
      setRevokingId(null);
    }
  }

  async function handleCopy(text: string, id: string) {
    await copyToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
  }

  function publicUrl(token: string): string {
    if (typeof window === 'undefined') return `/share/${token}`;
    return `${window.location.origin}/share/${token}`;
  }

  const activeLinks = links.filter((l) => !l.revokedAt);

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold text-content-strong hover:text-accent-primary"
          >
            KPI Nexus
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboards" className="text-content-muted hover:text-content-strong">
              Dashboards
            </Link>
            {dashboard && (
              <>
                <span className="text-content-muted">/</span>
                <Link
                  href={`/dashboards/${dashboardId}`}
                  className="text-content-muted hover:text-content-strong"
                >
                  {dashboard.name}
                </Link>
              </>
            )}
            <span className="text-content-muted">/</span>
            <span className="font-medium text-content-strong">Share</span>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-2 text-2xl font-semibold text-content-strong" data-testid="share-heading">
          Share {dashboard?.name ?? 'Dashboard'}
        </h1>
        <p className="mb-8 text-sm text-content-muted">
          Create public links to share this dashboard with anyone. Links can be
          password-protected and expire automatically.
        </p>

        {loadError && (
          <div
            role="alert"
            data-testid="share-load-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            data-testid="share-action-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {actionError}
          </div>
        )}

        {/* Create link form */}
        <section className="mb-8 rounded-lg border border-border bg-surface-1 p-6" data-testid="share-create-section">
          <h2 className="mb-4 text-lg font-semibold text-content-strong">Create Link</h2>
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-content-default">
                  Expires at <span className="text-content-muted">(optional)</span>
                </span>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  disabled={creating}
                  data-testid="share-expires-input"
                  className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-content-default">
                  Password <span className="text-content-muted">(optional)</span>
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={creating}
                  data-testid="share-password-input"
                  placeholder="Leave blank for no password"
                  className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                />
              </label>
            </div>

            {createError && (
              <p role="alert" data-testid="share-create-error" className="text-sm text-status-critical">
                {createError}
              </p>
            )}

            <button
              type="submit"
              disabled={creating}
              data-testid="share-create-submit"
              className="inline-flex h-10 items-center rounded-md bg-accent-primary px-5 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create link'}
            </button>
          </form>

          {/* Show newly created link */}
          {newLink && (
            <div
              data-testid="share-new-link-result"
              className="mt-4 rounded-lg border border-accent-primary/30 bg-accent-primary/5 p-4"
            >
              <p className="mb-2 text-sm font-medium text-content-strong">
                Link created! Share this URL:
              </p>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 overflow-x-auto rounded bg-surface-bg px-3 py-2 font-mono text-xs text-content-default"
                  data-testid="share-new-link-url"
                >
                  {publicUrl(newLink.token)}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy(publicUrl(newLink.token), newLink.id + '-new')}
                  data-testid="share-new-link-copy"
                  className="shrink-0 rounded-md border border-border px-3 py-2 text-xs text-content-default hover:bg-surface-2"
                >
                  {copiedId === newLink.id + '-new' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Active links list */}
        <section data-testid="share-links-section">
          <h2 className="mb-4 text-lg font-semibold text-content-strong">
            Active Links ({activeLinks.length})
          </h2>

          {activeLinks.length === 0 ? (
            <div
              data-testid="share-links-empty"
              className="rounded-lg border border-dashed border-border bg-surface-1 p-6 text-center"
            >
              <p className="text-sm text-content-muted">No active share links.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeLinks.map((link) => {
                const url = publicUrl(link.token);
                return (
                  <div
                    key={link.id}
                    data-testid="share-link-row"
                    className="rounded-lg border border-border bg-surface-1 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="rounded bg-status-success/10 px-1.5 py-0.5 font-medium text-status-success">
                            active
                          </span>
                          {link.hasPassword && (
                            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium text-content-muted">
                              password protected
                            </span>
                          )}
                          {link.expiresAt && (
                            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-content-muted">
                              expires {new Date(link.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                          <span className="text-content-muted">
                            {link.viewCount} view{link.viewCount === 1 ? '' : 's'}
                          </span>
                          {link.lastViewedAt && (
                            <span className="text-content-muted">
                              last viewed {new Date(link.lastViewedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <code className="min-w-0 flex-1 truncate rounded bg-surface-bg px-2 py-1 font-mono text-xs text-content-default">
                            {url}
                          </code>
                          <button
                            type="button"
                            onClick={() => void handleCopy(url, link.id)}
                            data-testid={`share-link-copy-${link.id}`}
                            className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs text-content-default hover:bg-surface-2"
                          >
                            {copiedId === link.id ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleRevoke(link.id)}
                        disabled={revokingId === link.id}
                        data-testid={`share-link-revoke-${link.id}`}
                        className="rounded-md border border-status-critical/40 px-3 py-1.5 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-50"
                      >
                        {revokingId === link.id ? 'Revoking…' : 'Revoke'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
