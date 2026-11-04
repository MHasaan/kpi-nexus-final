'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Copy, Link2 } from 'lucide-react';

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
import { AppShell } from '../../../../components/app-shell';
import { RequirePermission } from '../../../../components/auth/require-permission';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from '../../../../components/ui';
import { currentLoginRedirect } from '../../../../lib/auth-redirect';

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
      router.replace(currentLoginRedirect());
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
        router.replace(currentLoginRedirect());
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
    <RequirePermission permission="DASHBOARD_MANAGE">
    <AppShell>
      <PageHeader
        title={
          <span data-testid="share-heading">Share {dashboard?.name ?? 'Dashboard'}</span>
        }
        subtitle="Create public links to share this dashboard with anyone. Links can be password-protected and expire automatically."
        actions={
          <Link href={`/dashboards/${dashboardId}`}>
            <Button variant="ghost" size="sm">
              Back to dashboard
            </Button>
          </Link>
        }
      />

      <div className="mt-6 max-w-4xl space-y-8">
        {loadError && (
          <div
            role="alert"
            data-testid="share-load-error"
            className="rounded-md border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            data-testid="share-error"
            className="rounded-md border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {actionError}
          </div>
        )}

        {/* Create link form */}
        <Card data-testid="share-create-section">
          <CardContent>
            <h2 className="mb-4 text-base font-semibold text-content-strong">Create link</h2>
            <form
              onSubmit={(e) => void handleCreate(e)}
              className="space-y-4"
              data-testid="share-create"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="share-expires">
                    Expires at{' '}
                    <span className="font-normal text-content-muted">(optional)</span>
                  </Label>
                  <Input
                    id="share-expires"
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    disabled={creating}
                    data-testid="share-expiry"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="share-password">
                    Password{' '}
                    <span className="font-normal text-content-muted">(optional)</span>
                  </Label>
                  <Input
                    id="share-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={creating}
                    data-testid="share-password"
                    placeholder="Leave blank for no password"
                  />
                </div>
              </div>

              {createError && (
                <p
                  role="alert"
                  data-testid="share-create-error"
                  className="text-sm text-status-critical"
                >
                  {createError}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                disabled={creating}
                isLoading={creating}
                data-testid="share-create-submit"
                leftIcon={!creating ? <Link2 className="h-4 w-4" /> : undefined}
              >
                {creating ? 'Creating…' : 'Create link'}
              </Button>
            </form>

            {/* Show newly created link */}
            {newLink && (
              <div
                data-testid="share-new-link-result"
                className="mt-4 rounded-lg border border-border bg-accent-bg p-4"
              >
                <p className="mb-2 text-sm font-medium text-content-strong">
                  Link created! Share this URL:
                </p>
                <div className="flex items-center gap-2">
                  <code
                    className="flex-1 overflow-x-auto rounded bg-surface-bg px-3 py-2 font-mono text-xs text-content"
                    data-testid="share-new-link-url"
                  >
                    {publicUrl(newLink.token)}
                  </code>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleCopy(publicUrl(newLink.token), newLink.id + '-new')}
                    data-testid="share-copy"
                    leftIcon={<Copy className="h-4 w-4" />}
                  >
                    {copiedId === newLink.id + '-new' ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active links list */}
        <section data-testid="share-links-section">
          <h2 className="mb-4 text-base font-semibold text-content-strong">
            Active links (<span className="tabular-nums">{activeLinks.length}</span>)
          </h2>

          {activeLinks.length === 0 ? (
            <Card data-testid="share-links-empty">
              <EmptyState
                icon={Link2}
                title="No active share links"
                description="Create a link above to share this dashboard publicly."
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {activeLinks.map((link) => {
                const url = publicUrl(link.token);
                return (
                  <Card key={link.id} data-testid="share-link-row">
                    <CardContent>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge tone="success">active</Badge>
                            {link.hasPassword && (
                              <Badge tone="neutral">password protected</Badge>
                            )}
                            {link.expiresAt && (
                              <Badge tone="neutral">
                                expires{' '}
                                {new Date(link.expiresAt).toLocaleDateString()}
                              </Badge>
                            )}
                            <span className="tabular-nums text-content-muted">
                              {link.viewCount} view{link.viewCount === 1 ? '' : 's'}
                            </span>
                            {link.lastViewedAt && (
                              <span className="text-content-muted">
                                last viewed{' '}
                                {new Date(link.lastViewedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <code
                              className="min-w-0 flex-1 truncate rounded bg-surface-1 px-2 py-1 font-mono text-xs text-content"
                              data-testid="share-link-url"
                            >
                              {url}
                            </code>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => void handleCopy(url, link.id)}
                              data-testid={`share-link-copy-${link.id}`}
                              leftIcon={<Copy className="h-4 w-4" />}
                            >
                              {copiedId === link.id ? 'Copied!' : 'Copy'}
                            </Button>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => void handleRevoke(link.id)}
                          disabled={revokingId === link.id}
                          isLoading={revokingId === link.id}
                          data-testid={`share-revoke-${link.id}`}
                        >
                          {revokingId === link.id ? 'Revoking…' : 'Revoke'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
    </RequirePermission>
  );
}
