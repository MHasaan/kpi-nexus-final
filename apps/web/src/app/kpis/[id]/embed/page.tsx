'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Code2, Copy, Check, ShieldCheck, ShieldOff, CircleCheck } from 'lucide-react';

import { AppShell } from '../../../../components/app-shell';
import { RequirePermission } from '../../../../components/auth/require-permission';
import { PermissionGuard } from '../../../../components/auth/permission-guard';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  EmptyState,
} from '../../../../components/ui';
import {
  ApiError,
  clearTokens,
  getAccessToken,
  mintEmbedToken,
  revokeEmbedToken,
} from '../../../../lib/api-client';
import { currentLoginRedirect } from '../../../../lib/auth-redirect';

// Shared analytics navigation strip — lets users move between the KPI's
// analytics surfaces and back to the detail page.
function AnalyticsNav({ kpiId, active }: { kpiId: string; active: string }) {
  const links: Array<{ key: string; label: string; href: string }> = [
    { key: 'detail', label: 'Overview', href: `/kpis/${kpiId}` },
    { key: 'forecast', label: 'Forecast', href: `/kpis/${kpiId}/forecast` },
    { key: 'anomalies', label: 'Anomalies', href: `/kpis/${kpiId}/anomalies` },
    { key: 'whatif', label: 'What-if', href: `/kpis/${kpiId}/whatif` },
    { key: 'embed', label: 'Embed', href: `/kpis/${kpiId}/embed` },
  ];
  return (
    <nav
      aria-label="KPI analytics"
      data-testid="analytics-nav"
      className="mt-4 flex flex-wrap gap-1 rounded-lg border border-border bg-surface-1 p-1"
    >
      {links.map((l) => {
        const isActive = l.key === active;
        return (
          <Link
            key={l.key}
            href={l.href}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? 'rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-md px-3 py-1.5 text-sm font-medium text-content-muted hover:bg-surface-2 hover:text-content-strong'
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function KpiEmbedPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const kpiId = params.id;

  const [token, setToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeNote, setRevokeNote] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
    }
  }, [router]);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    setRevokeNote(null);
    setToken(null);
    try {
      const result = await mintEmbedToken(kpiId);
      setToken(result.token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace(currentLoginRedirect());
        return;
      }
      setGenerateError(err instanceof ApiError ? err.message : 'Failed to generate token');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke() {
    const confirmed = window.confirm(
      'Revoke all existing embed tokens for this KPI? Embedded views using old tokens will stop working.',
    );
    if (!confirmed) return;
    setRevoking(true);
    setGenerateError(null);
    setRevokeNote(null);
    try {
      await revokeEmbedToken(kpiId);
      // Any token currently shown is now invalid — clear it so the UI doesn't
      // present a dead token. The user can regenerate to mint a fresh one.
      setToken(null);
      setRevokeNote('All existing embed tokens revoked — regenerate to get a fresh one');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace(currentLoginRedirect());
        return;
      }
      setGenerateError(err instanceof ApiError ? err.message : 'Failed to revoke tokens');
    } finally {
      setRevoking(false);
    }
  }

  function embedUrl(t: string): string {
    if (typeof window === 'undefined') return `/embed/kpi/${t}`;
    return `${window.location.origin}/embed/kpi/${t}`;
  }

  function iframeSnippet(t: string): string {
    return `<iframe src="${embedUrl(t)}" width="320" height="180" frameborder="0"></iframe>`;
  }

  async function copyText(text: string, which: 'token' | 'iframe') {
    await navigator.clipboard.writeText(text);
    if (which === 'token') {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else {
      setCopiedIframe(true);
      setTimeout(() => setCopiedIframe(false), 2000);
    }
  }

  const crumbs = useMemo(() => ['KPIs', 'Embed'], []);

  return (
    <AppShell title="Embed" crumbs={crumbs}>
     <RequirePermission permission="ANALYTICS_VIEW">
      <div data-testid="embed-generator-heading">
        <PageHeader
          title="KPI Embed Generator"
          subtitle="Generate a signed, read-only embed token that respects scope. Use the iframe snippet to embed a live KPI card in any external page."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <PermissionGuard permission="KPI_VIEW">
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => void handleRevoke()}
                  isLoading={revoking}
                  disabled={generating}
                  data-testid="embed-revoke"
                  leftIcon={<ShieldOff className="h-4 w-4" />}
                >
                  Revoke tokens
                </Button>
              </PermissionGuard>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleGenerate()}
                isLoading={generating}
                disabled={revoking}
                data-testid="embed-generate-btn"
              >
                {token ? 'Regenerate token' : 'Generate token'}
              </Button>
            </div>
          }
        />
      </div>

      <AnalyticsNav kpiId={kpiId} active="embed" />

      {generateError && (
        <p
          role="alert"
          data-testid="embed-generate-error"
          className="mt-4 rounded-md border border-status-critical-bg bg-status-critical-bg px-3 py-2 text-sm text-status-critical"
        >
          {generateError}
        </p>
      )}

      {revokeNote && (
        <p
          role="status"
          data-testid="embed-revoke-note"
          className="mt-4 flex items-center gap-2 rounded-md border border-status-success/40 bg-status-success-bg px-3 py-2 text-sm text-status-success"
        >
          <CircleCheck aria-hidden className="h-4 w-4 shrink-0" />
          {revokeNote}
        </p>
      )}

      <Card className="mt-6 border-status-info-bg bg-status-info-bg/40">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-status-info" />
          <p className="text-sm text-content">
            Embed tokens are <strong className="text-content-strong">HMAC-signed</strong>,
            read-only, and respect the KPI&apos;s scope and permissions. Regenerate to rotate the
            token; old tokens stop working.
          </p>
        </CardContent>
      </Card>

      <div className="mt-6">
        {token ? (
          <div className="space-y-6" data-testid="embed-token-output">
            {/* Token */}
            <Card>
              <CardHeader>
                <CardTitle>Embed token</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <code
                    className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-surface-1 px-3 py-2 font-mono text-xs text-content"
                    data-testid="embed-token-value"
                  >
                    {token}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void copyText(token, 'token')}
                    data-testid="embed-copy-token-btn"
                    leftIcon={copiedToken ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  >
                    {copiedToken ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="text-xs text-content-muted">
                  Public URL: <span className="font-mono text-content">{embedUrl(token)}</span>
                </p>
              </CardContent>
            </Card>

            {/* iframe snippet */}
            <Card>
              <CardHeader>
                <CardTitle>iframe snippet</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-2">
                  <code
                    className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-md border border-border bg-surface-1 px-3 py-2 font-mono text-xs text-content"
                    data-testid="embed-iframe-snippet"
                  >
                    {iframeSnippet(token)}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void copyText(iframeSnippet(token), 'iframe')}
                    data-testid="embed-copy-iframe-btn"
                    leftIcon={copiedIframe ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  >
                    {copiedIframe ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Live preview */}
            <Card>
              <CardHeader>
                <CardTitle>Live preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="inline-block overflow-hidden rounded-lg border border-border">
                  <iframe
                    src={embedUrl(token)}
                    width="320"
                    height="180"
                    data-testid="embed-preview-iframe"
                    title="KPI embed preview"
                    className="block"
                  />
                </div>
                <p className="text-xs text-content-muted">
                  This is how the KPI card will appear when embedded.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent>
              <EmptyState
                icon={Code2}
                title="No token generated yet"
                description="Generate a signed embed token to get a copy-ready iframe snippet and live preview."
                action={
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => void handleGenerate()}
                    isLoading={generating}
                  >
                    Generate token
                  </Button>
                }
              />
            </CardContent>
          </Card>
        )}
      </div>
     </RequirePermission>
    </AppShell>
  );
}
