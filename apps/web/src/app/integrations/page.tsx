'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';

import { AppShell } from '../../components/app-shell';
import { AnyPermissionGuard } from '../../components/auth/permission-guard';
import { RequireAnyPermission } from '../../components/auth/require-permission';
import { CopyButton } from '../../components/copy-button';
import { Badge, Button, Card, CardContent, CardFooter, CardHeader, CardTitle, Input, Label, PageHeader, Skeleton } from '../../components/ui';
import { ApiError, apiBaseUrl } from '../../lib/api-client';
import { useFormat } from '../../lib/format-context';
import {
  connectIntegration,
  disconnectIntegration,
  listIntegrations,
  rotateIntegrationSecret,
  type IntegrationConnection,
} from '../../lib/integrations-client';
import { useConfirm } from '../../lib/use-confirm';
import { usePermissions } from '../../lib/use-permissions';

/** The keys the integrations API accepts — either one (UI-013: the page asked for ORG_SETTINGS only, so the sidebar link led to "no access"). */
const INTEGRATIONS_KEYS = ['INTEGRATIONS_MANAGE', 'ORG_SETTINGS'];

/**
 * What can be set up from here. Two are connections this page makes (Slack,
 * Jira); the rest are set up on a page of their own, and the card says where.
 * A card used to store a "connection" with no credentials for any of them.
 */
type Item =
  | { key: 'slack' | 'jira'; kind: 'connection'; name: string; description: string; icon: string }
  | { key: string; kind: 'link'; name: string; description: string; icon: string; href: string; action: string };

const CATALOG: Item[] = [
  { key: 'slack', kind: 'connection', name: 'Slack', description: 'Use /kpi and acknowledge alerts from Slack.', icon: '\u{1F4AC}' },
  { key: 'jira', kind: 'connection', name: 'Jira', description: 'Keep linked tasks in step with Jira issues.', icon: '\u{1F9E9}' },
  { key: 'teams', kind: 'link', name: 'Microsoft Teams', description: 'Post alerts to a Teams channel.', icon: '\u{1F465}', href: '/alerts/channels', action: 'Set up an alert channel' },
  { key: 'connectors', kind: 'link', name: 'Connectors', description: 'Pull KPI values from REST and GraphQL sources.', icon: '\u{1F50C}', href: '/connectors', action: 'Manage' },
  { key: 'webhooks', kind: 'link', name: 'Webhooks', description: 'Send events to your own systems, signed.', icon: '\u{1FA9D}', href: '/settings/webhooks', action: 'Manage' },
  { key: 'apikeys', kind: 'link', name: 'API keys', description: 'Let your own programs read and record.', icon: '\u{1F511}', href: '/settings/api-keys', action: 'Manage' },
  { key: 'plugins', kind: 'link', name: 'Plugins', description: 'A catalogue of add-on widgets and panels.', icon: '\u{1F9F1}', href: '/plugins', action: 'Open' },
];

const SLACK_COMMANDS_URL = `${apiBaseUrl}/integrations/slack/commands`;
const SLACK_INTERACTIVE_URL = `${apiBaseUrl}/integrations/slack/interactive`;

function statusOf(connection: IntegrationConnection | undefined, name: string): { label: string; tone: 'success' | 'warning' | 'error' | 'neutral' } {
  if (!connection) return { label: 'Not connected', tone: 'neutral' };
  if (connection.status === 'CONNECTED') return { label: 'Connected', tone: 'success' };
  if (connection.status === 'ERROR') return { label: 'Error', tone: 'error' };
  return { label: `Waiting for ${name}`, tone: 'warning' };
}

/** An address to paste somewhere else, with a button that copies it. */
function Address({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-[11px] font-medium text-content-muted">{label}</span>
      <div className="flex items-center gap-2">
        <code data-testid={testId} className="min-w-0 flex-1 break-all rounded border border-border bg-surface-bg px-2 py-1 text-[11px] text-content-strong">
          {value}
        </code>
        <CopyButton value={value} className="shrink-0 rounded-md border border-border bg-surface-1 px-2 py-1 text-[11px] hover:bg-surface-2" />
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const fmt = useFormat();
  const confirm = useConfirm();
  const [connections, setConnections] = useState<Record<string, IntegrationConnection>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Slack: the form is open, and what is typed in it.
  const [slackOpen, setSlackOpen] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [slackError, setSlackError] = useState<string | null>(null);
  // Jira: the webhook secret, shown once after connecting or rotating.
  const [jiraSecret, setJiraSecret] = useState<string | null>(null);

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

  // Load only once the page gate passes (FE-014).
  const { ready, hasAny } = usePermissions();
  const allowed = ready && hasAny(INTEGRATIONS_KEYS);
  useEffect(() => {
    if (allowed) void refresh().finally(() => setLoading(false));
  }, [allowed]);

  const connectSlack = async (event: FormEvent) => {
    event.preventDefault();
    const id = teamId.trim();
    if (!/^T[A-Z0-9]{2,20}$/.test(id)) {
      setSlackError('The workspace ID starts with T, for example T0ABC123.');
      return;
    }
    setSlackError(null);
    setBusy('slack');
    try {
      await connectIntegration({ provider: 'slack', teamId: id });
      setSlackOpen(false);
      setTeamId('');
      await refresh();
    } catch (e) {
      setSlackError(e instanceof ApiError ? e.message : 'Slack could not be connected');
    } finally {
      setBusy(null);
    }
  };

  const connectJira = async () => {
    setBusy('jira');
    try {
      const { webhookSecret } = await connectIntegration({ provider: 'jira' });
      setJiraSecret(webhookSecret ?? null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Jira could not be connected');
    } finally {
      setBusy(null);
    }
  };

  const rotateJira = (id: string) =>
    void confirm({
      title: 'Make a new Jira webhook secret?',
      description: 'The current address stops working at once. Jira must be given the new one, or it will be refused.',
      confirmLabel: 'Make a new secret',
      tone: 'danger',
      testId: 'jira-rotate-confirm',
      action: async () => {
        const { webhookSecret } = await rotateIntegrationSecret(id);
        setJiraSecret(webhookSecret);
      },
    });

  const disconnect = async (provider: string, id: string, name: string) => {
    const ok = await confirm({
      title: `Disconnect ${name}?`,
      description: provider === 'slack' ? 'Commands and buttons from that Slack workspace stop working until it is connected again.' : 'Updates from Jira are refused until it is connected again, with a new address.',
      confirmLabel: 'Disconnect',
      tone: 'danger',
      testId: 'integration-disconnect-confirm',
    });
    if (!ok) return;
    setBusy(provider);
    try {
      await disconnectIntegration(id);
      if (provider === 'jira') setJiraSecret(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect');
    } finally {
      setBusy(null);
    }
  };

  return (
    <RequireAnyPermission permissions={INTEGRATIONS_KEYS}>
      <AppShell title="Integrations" crumbs={[{ label: 'Home', href: '/' }, { label: 'Integrations' }]}>
        <PageHeader title="Integrations" subtitle="Connect KPI Nexus to chat, issue trackers, data sources, and more." />

        {loading && (
          <div data-testid="integrations-loading" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        )}

        {error && (
          <div role="alert" data-testid="integrations-error" className="mt-6 rounded-lg border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical">
            {error}
          </div>
        )}

        {!loading && (
          <div data-testid="integrations-grid" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATALOG.map((item) => {
              const connection = item.kind === 'connection' ? connections[item.key] : undefined;
              const status = statusOf(connection, item.name);
              const isBusy = busy === item.key;
              return (
                <Card key={item.key} data-testid={`integration-card-${item.key}`} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-bg text-xl" aria-hidden>
                        {item.icon}
                      </div>
                      {item.kind === 'connection' && (
                        <Badge tone={status.tone} data-testid={`integration-status-${item.key}`}>
                          {status.label}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="mt-3">{item.name}</CardTitle>
                    <p className="text-[13px] text-content-muted">{item.description}</p>
                  </CardHeader>

                  <CardContent className="flex-1 space-y-3">
                    {connection?.status === 'CONNECTED' && connection.lastSyncAt && (
                      <p className="text-[11px] tabular-nums text-content-muted">Last heard from {fmt.dateTime(connection.lastSyncAt)}</p>
                    )}

                    {item.key === 'slack' && connection && (
                      <div className="space-y-2" data-testid="slack-setup">
                        <p className="text-xs text-content-muted">
                          {connection.status === 'CONNECTED'
                            ? 'In your Slack app these two addresses are in use:'
                            : 'Paste these two addresses into your Slack app. The connection is confirmed the first time Slack calls one of them.'}
                        </p>
                        <Address label="Slash command — Request URL" value={SLACK_COMMANDS_URL} testId="slack-commands-url" />
                        <Address label="Interactivity — Request URL" value={SLACK_INTERACTIVE_URL} testId="slack-interactive-url" />
                        <p className="text-[11px] text-content-muted">The app&apos;s signing secret is set on the server by whoever runs it, not here.</p>
                      </div>
                    )}

                    {item.key === 'slack' && !connection && slackOpen && (
                      <form onSubmit={connectSlack} className="space-y-2" data-testid="slack-form">
                        <Label htmlFor="slack-team-id">Slack workspace ID</Label>
                        <Input id="slack-team-id" data-testid="slack-team-id" value={teamId} onChange={(e) => setTeamId(e.target.value.toUpperCase())} placeholder="T0ABC123" autoComplete="off" />
                        <p className="text-[11px] text-content-muted">In Slack: the workspace name → Settings &amp; administration → the address ends in the ID.</p>
                        {slackError && (
                          <p role="alert" data-testid="slack-form-error" className="text-xs text-status-critical">
                            {slackError}
                          </p>
                        )}
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" isLoading={isBusy} data-testid="slack-connect-submit">
                            Connect
                          </Button>
                          <Button type="button" size="sm" variant="secondary" onClick={() => setSlackOpen(false)}>
                            Cancel
                          </Button>
                        </div>
                      </form>
                    )}

                    {item.key === 'jira' && connection && jiraSecret && (
                      <div className="space-y-2 rounded-lg border border-status-warning/40 bg-status-warning/10 p-3" data-testid="jira-secret">
                        <p className="text-xs font-medium text-content-strong">Copy this address into a Jira webhook now — the secret in it is not shown again.</p>
                        <Address label="Jira webhook — URL" value={`${apiBaseUrl}/integrations/jira/webhook/${connection.id}?secret=${jiraSecret}`} testId="jira-webhook-url" />
                        <Button type="button" size="sm" variant="secondary" onClick={() => setJiraSecret(null)} data-testid="jira-secret-dismiss">
                          Done
                        </Button>
                      </div>
                    )}
                    {item.key === 'jira' && connection && !jiraSecret && connection.status !== 'CONNECTED' && (
                      <p className="text-xs text-content-muted">Waiting for the first update from Jira. If the address was not copied, make a new secret.</p>
                    )}
                  </CardContent>

                  <CardFooter>
                    {item.kind === 'link' ? (
                      <Link href={item.href} className="w-full" data-testid={`integration-link-${item.key}`}>
                        <Button variant="secondary" size="sm" className="w-full">
                          {item.action}
                        </Button>
                      </Link>
                    ) : (
                      <AnyPermissionGuard permissions={INTEGRATIONS_KEYS}>
                        {connection ? (
                          <div className="flex w-full gap-2">
                            {item.key === 'jira' && (
                              <Button variant="secondary" size="sm" className="flex-1" disabled={isBusy} data-testid="jira-rotate" onClick={() => rotateJira(connection.id)}>
                                New secret
                              </Button>
                            )}
                            <Button variant="secondary" size="sm" className="flex-1" disabled={isBusy} data-testid={`disconnect-${item.key}`} onClick={() => void disconnect(item.key, connection.id, item.name)}>
                              {isBusy ? 'Disconnecting…' : 'Disconnect'}
                            </Button>
                          </div>
                        ) : item.key === 'slack' ? (
                          !slackOpen && (
                            <Button variant="primary" size="sm" className="w-full" data-testid="connect-slack" onClick={() => setSlackOpen(true)}>
                              Connect
                            </Button>
                          )
                        ) : (
                          <Button variant="primary" size="sm" className="w-full" isLoading={isBusy} data-testid="connect-jira" onClick={() => void connectJira()}>
                            Connect
                          </Button>
                        )}
                      </AnyPermissionGuard>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </AppShell>
    </RequireAnyPermission>
  );
}
