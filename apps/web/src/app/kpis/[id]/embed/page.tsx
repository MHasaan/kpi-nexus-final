'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  mintEmbedToken,
} from '../../../../lib/api-client';

export default function KpiEmbedPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const kpiId = params.id;

  const [token, setToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    setToken(null);
    try {
      const result = await mintEmbedToken(kpiId);
      setToken(result.token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setGenerateError(err instanceof ApiError ? err.message : 'Failed to generate token');
    } finally {
      setGenerating(false);
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

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold text-content-strong hover:text-accent-primary"
          >
            KPI Nexus
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/kpis" className="text-content-muted hover:text-content-strong">
              KPIs
            </Link>
            <span className="text-content-muted">/</span>
            <span className="font-medium text-content-strong">Embed</span>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-2 text-2xl font-semibold text-content-strong" data-testid="embed-generator-heading">
          KPI Embed Generator
        </h1>
        <p className="mb-8 text-sm text-content-muted">
          Generate a public embed token for this KPI. Use the iframe snippet to embed a live
          KPI card in any website or portal.
        </p>

        <div className="mb-8">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating}
            data-testid="embed-generate-btn"
            className="inline-flex h-10 items-center rounded-md bg-accent-primary px-5 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? 'Generating…' : token ? 'Regenerate token' : 'Generate token'}
          </button>
          {generateError && (
            <p role="alert" data-testid="embed-generate-error" className="mt-2 text-sm text-status-critical">
              {generateError}
            </p>
          )}
        </div>

        {token && (
          <div className="space-y-6" data-testid="embed-token-output">
            {/* Token */}
            <section className="rounded-lg border border-border bg-surface-1 p-5">
              <h2 className="mb-3 text-sm font-semibold text-content-strong">Embed Token</h2>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 overflow-x-auto rounded bg-surface-bg px-3 py-2 font-mono text-xs text-content-default"
                  data-testid="embed-token-value"
                >
                  {token}
                </code>
                <button
                  type="button"
                  onClick={() => void copyText(token, 'token')}
                  data-testid="embed-copy-token-btn"
                  className="shrink-0 rounded-md border border-border px-3 py-2 text-xs text-content-default hover:bg-surface-2"
                >
                  {copiedToken ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="mt-2 text-xs text-content-muted">
                Public URL:{' '}
                <span className="font-mono">{embedUrl(token)}</span>
              </p>
            </section>

            {/* iframe snippet */}
            <section className="rounded-lg border border-border bg-surface-1 p-5">
              <h2 className="mb-3 text-sm font-semibold text-content-strong">iframe Snippet</h2>
              <div className="flex items-start gap-2">
                <code
                  className="flex-1 overflow-x-auto whitespace-pre rounded bg-surface-bg px-3 py-2 font-mono text-xs text-content-default"
                  data-testid="embed-iframe-snippet"
                >
                  {iframeSnippet(token)}
                </code>
                <button
                  type="button"
                  onClick={() => void copyText(iframeSnippet(token), 'iframe')}
                  data-testid="embed-copy-iframe-btn"
                  className="shrink-0 rounded-md border border-border px-3 py-2 text-xs text-content-default hover:bg-surface-2"
                >
                  {copiedIframe ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </section>

            {/* Live preview */}
            <section className="rounded-lg border border-border bg-surface-1 p-5">
              <h2 className="mb-3 text-sm font-semibold text-content-strong">Live Preview</h2>
              <div className="overflow-hidden rounded-lg border border-border">
                <iframe
                  src={embedUrl(token)}
                  width="320"
                  height="180"
                  data-testid="embed-preview-iframe"
                  title="KPI embed preview"
                  className="block"
                />
              </div>
              <p className="mt-2 text-xs text-content-muted">
                This is how the KPI card will appear when embedded.
              </p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
