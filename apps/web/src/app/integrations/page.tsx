'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../lib/api-client';
import {
  type IntegrationConnection,
  connectIntegration,
  disconnectIntegration,
  listIntegrations,
} from '../../lib/integrations-client';

const PROVIDERS = [
  { key: 'slack', label: 'Slack', blurb: 'Alerts + slash commands + acknowledge buttons' },
  { key: 'teams', label: 'Microsoft Teams', blurb: 'Adaptive Card alerts via incoming webhook' },
  { key: 'jira', label: 'Jira', blurb: 'Create issues from alerts; status syncs to tasks' },
];

export default function IntegrationsPage() {
  const router = useRouter();
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setConnections(await listIntegrations());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load integrations');
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [load, router]);

  const connected = (provider: string) => connections.find((c) => c.provider === provider);

  // Real OAuth happens via the provider; here we record a connection (the
  // token would normally arrive via the OAuth callback).
  const connect = async (provider: string) => {
    try {
      await connectIntegration({ provider, displayName: provider, tokens: { placeholder: true }, metadata: { team_id: `T-${provider}` } });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Connect failed');
    }
  };

  const disconnect = async (id: string) => {
    try {
      await disconnectIntegration(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Disconnect failed');
    }
  };

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Integrations</span>
          <Link href="/connectors" className="ml-auto text-sm text-content-muted hover:text-accent-primary">Connectors</Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">Integration marketplace</h1>
        {error && <p className="mt-2 text-sm text-status-critical" data-testid="integrations-error">{error}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-3" data-testid="provider-grid">
          {PROVIDERS.map((p) => {
            const conn = connected(p.key);
            return (
              <div key={p.key} data-testid={`provider-${p.key}`} className="rounded-lg border border-border bg-surface-1 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium text-content-strong">{p.label}</h2>
                  {conn && <span data-testid={`status-${p.key}`} className="text-xs font-semibold text-status-positive">Connected</span>}
                </div>
                <p className="mt-1 text-xs text-content-muted">{p.blurb}</p>
                {conn ? (
                  <button type="button" data-testid={`disconnect-${p.key}`} onClick={() => disconnect(conn.id)} className="mt-3 rounded border border-border px-3 py-1 text-xs text-content-strong hover:border-status-critical">
                    Disconnect
                  </button>
                ) : (
                  <button type="button" data-testid={`connect-${p.key}`} onClick={() => connect(p.key)} className="mt-3 rounded bg-accent-primary px-3 py-1 text-xs font-medium text-white hover:opacity-90">
                    Connect
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
