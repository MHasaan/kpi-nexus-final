'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  listIntegrations,
  connectIntegration,
  disconnectIntegration,
  type IntegrationConnection,
} from '../../lib/integrations-client';
import { RequirePermission } from '../../components/auth/require-permission';
import { PermissionGuard } from '../../components/auth/permission-guard';
import { AppShell } from '../../components/app-shell';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Badge,
  Button,
  Skeleton,
} from '../../components/ui';

const CATALOG: Array<{ key: string; name: string; description: string; icon: string; href?: string }> = [
  { key: 'slack', name: 'Slack', description: 'Post alerts and digests to channels.', icon: '\u{1F4AC}' },
  { key: 'teams', name: 'Microsoft Teams', description: 'Post alerts and digests to Teams.', icon: '\u{1F465}' },
  { key: 'jira', name: 'Jira', description: 'Create issues from alerts; sync status.', icon: '\u{1F9E9}' },
  { key: 'connectors', name: 'Connectors', description: 'REST/SQL/CSV data sources.', icon: '\u{1F50C}', href: '/connectors' },
  { key: 'webhooks', name: 'Webhooks', description: 'Outbound event delivery with HMAC.', icon: '\u{1FA9D}' },
  { key: 'apikeys', name: 'API Keys', description: 'Programmatic access tokens.', icon: '\u{1F511}' },
  { key: 'emailin', name: 'Email-in', description: 'Inbound email to KPI updates.', icon: '\u{1F4E7}' },
  { key: 'plugins', name: 'Plugins', description: 'Extend with custom widgets/panels.', icon: '\u{1F9F1}', href: '/plugins' },
];

export default function IntegrationsPage() {
  const [connections, setConnections] = useState<Record<string, IntegrationConnection>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const data = await listIntegrations();
      const byProvider: Record<string, IntegrationConnection> = {};
      for (const conn of data) byProvider[conn.provider] = conn;
      setConnections(byProvider);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  };

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, []);

  const connect = async (provider: string, displayName: string) => {
    setBusy(provider);
    try {
      await connectIntegration({ provider, displayName, tokens: {} });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect');
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (provider: string, id: string) => {
    setBusy(provider);
    try {
      await disconnectIntegration(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect');
    } finally {
      setBusy(null);
    }
  };

  return (
    <RequirePermission permission="ORG_SETTINGS">
      <AppShell title="Integrations" crumbs={[{ label: 'Home', href: '/' }, { label: 'Integrations' }]}>
        <PageHeader
          title="Integrations"
          subtitle="Connect KPI Nexus to chat, issue trackers, data sources, and more."
        />

        {loading && (
          <div
            data-testid="integrations-loading"
            className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        )}

        {error && (
          <div
            role="alert"
            data-testid="integrations-error"
            className="mt-6 rounded-lg border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {error}
          </div>
        )}

        {!loading && !error && (
          <div
            data-testid="integrations-grid"
            className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {CATALOG.map((item) => {
              const connection = connections[item.key];
              const connected = connection?.status === 'CONNECTED';
              const isBusy = busy === item.key;
              return (
                <Card key={item.key} data-testid={`integration-card-${item.key}`} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-bg text-xl" aria-hidden>
                        {item.icon}
                      </div>
                      <Badge
                        tone={connected ? 'success' : 'neutral'}
                        data-testid={`integration-status-${item.key}`}
                      >
                        <span
                          className={connected ? 'h-1.5 w-1.5 rounded-full bg-status-success' : 'h-1.5 w-1.5 rounded-full bg-status-neutral'}
                          aria-hidden
                        />
                        {connected ? 'Connected' : 'Not connected'}
                      </Badge>
                    </div>
                    <CardTitle className="mt-3">{item.name}</CardTitle>
                    <p className="text-[13px] text-content-muted">{item.description}</p>
                  </CardHeader>
                  <CardContent className="flex-1">
                    {connected && connection?.lastSyncAt && (
                      <p className="text-[11px] tabular-nums text-content-muted">
                        Last sync {new Date(connection.lastSyncAt).toLocaleString()}
                      </p>
                    )}
                  </CardContent>
                  <CardFooter>
                    {item.href ? (
                      <Link href={item.href} className="w-full">
                        <Button variant={connected ? 'secondary' : 'primary'} size="sm" className="w-full">
                          Manage
                        </Button>
                      </Link>
                    ) : (
                      <PermissionGuard permission="ORG_SETTINGS">
                        {connected && connection ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            disabled={isBusy}
                            data-testid={`disconnect-${item.key}`}
                            onClick={() => void disconnect(item.key, connection.id)}
                          >
                            {isBusy ? 'Disconnecting…' : 'Disconnect'}
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            className="w-full"
                            disabled={isBusy}
                            data-testid={`connect-${item.key}`}
                            onClick={() => void connect(item.key, item.name)}
                          >
                            {isBusy ? 'Connecting…' : 'Connect'}
                          </Button>
                        )}
                      </PermissionGuard>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </AppShell>
    </RequirePermission>
  );
}
