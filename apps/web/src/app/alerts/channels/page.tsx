'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Inbox, Power, PowerOff, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import { usePermissions } from '../../../lib/use-permissions';
import { PermissionGuard } from '../../../components/auth/permission-guard';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui';
import {
  ApiError,
  clearTokens,
  createNotificationChannel,
  deleteNotificationChannel,
  getAccessToken,
  listNotificationChannels,
  testNotificationChannel,
  updateNotificationChannel,
  type NotificationChannel,
} from '../../../lib/api-client';
import { currentLoginRedirect } from '../../../lib/auth-redirect';

type Kind = NotificationChannel['kind'];

export default function ChannelsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<NotificationChannel[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('EMAIL');
  const [recipients, setRecipients] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setChannels(await listNotificationChannels());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace(currentLoginRedirect());
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load channels');
    }
  }, [router]);

  // FE-014: load only once the page gate passes, so users without access
  // are redirected without first drawing a 403 from the api.
  const { ready, has } = usePermissions();
  const allowed = ready && has('ORG_SETTINGS');
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    if (!allowed) return;
    void refresh();
  }, [router, refresh, allowed]);

  function buildConfig(): Record<string, unknown> {
    switch (kind) {
      case 'EMAIL':
        return {
          recipients: recipients
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean),
        };
      case 'SLACK':
      case 'TEAMS':
        return { webhookUrl: webhookUrl.trim() };
      case 'WEBHOOK':
        return { url: webhookUrl.trim() };
      case 'SMS':
        return { fromNumber: fromNumber.trim() };
      default:
        return {};
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await createNotificationChannel({ name: name.trim(), kind, config: buildConfig() });
      setName('');
      setRecipients('');
      setWebhookUrl('');
      setFromNumber('');
      await refresh();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create channel');
    } finally {
      setCreating(false);
    }
  }

  async function handleTest(id: string) {
    setBusyId(id);
    setTestMsg(null);
    try {
      await testNotificationChannel(id);
      setTestMsg('Test notification sent.');
      setTimeout(() => setTestMsg(null), 3000);
    } catch (err) {
      setTestMsg(err instanceof ApiError ? err.message : 'Test failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await deleteNotificationChannel(id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to delete channel');
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(id: string, next: boolean) {
    setBusyId(id);
    setLoadError(null);
    // Optimistic flip so the badge updates immediately.
    setChannels((prev) =>
      prev ? prev.map((c) => (c.id === id ? { ...c, isActive: next } : c)) : prev,
    );
    try {
      await updateNotificationChannel(id, { isActive: next });
      await refresh();
    } catch (err) {
      // Roll back the optimistic flip, then reconcile with the server.
      setChannels((prev) =>
        prev ? prev.map((c) => (c.id === id ? { ...c, isActive: !next } : c)) : prev,
      );
      setLoadError(err instanceof ApiError ? err.message : 'Failed to update channel');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <RequirePermission permission="ORG_SETTINGS">
      <PageHeader
        title="Notification channels"
        subtitle="Configure where alerts go — email, Slack, Teams, webhooks, or SMS."
        actions={
          <Link
            href="/alerts"
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border-strong bg-surface-bg px-4 text-sm font-semibold text-content-strong transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Back to alerts
          </Link>
        }
      />
      <h1 data-testid="channels-heading" className="sr-only">
        Notification channels
      </h1>

      {/* Create form */}
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Add channel</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4" data-testid="channel-create-form">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="channel-name" required>
                  Name
                </Label>
                <Input
                  id="channel-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  data-testid="channel-name-input"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="channel-kind">Kind</Label>
                <Select
                  id="channel-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as Kind)}
                  data-testid="channel-kind-select"
                >
                  <option value="EMAIL">Email</option>
                  <option value="SLACK">Slack</option>
                  <option value="TEAMS">Teams</option>
                  <option value="WEBHOOK">Webhook</option>
                  <option value="SMS">SMS</option>
                  <option value="IN_APP">In-app</option>
                </Select>
              </div>
            </div>
            {kind === 'EMAIL' && (
              <div className="grid gap-2">
                <Label htmlFor="channel-recipients">
                  Recipients <span className="font-normal text-content-muted">(comma-separated)</span>
                </Label>
                <Input
                  id="channel-recipients"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  data-testid="channel-recipients-input"
                  placeholder="ops@acme.com, oncall@acme.com"
                />
              </div>
            )}
            {(kind === 'SLACK' || kind === 'TEAMS' || kind === 'WEBHOOK') && (
              <div className="grid gap-2">
                <Label htmlFor="channel-url">URL</Label>
                <Input
                  id="channel-url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  type="url"
                  data-testid="channel-url-input"
                  placeholder="https://…"
                />
              </div>
            )}
            {kind === 'SMS' && (
              <div className="grid gap-2">
                <Label htmlFor="channel-fromnumber">From number</Label>
                <Input
                  id="channel-fromnumber"
                  value={fromNumber}
                  onChange={(e) => setFromNumber(e.target.value)}
                  data-testid="channel-fromnumber-input"
                  placeholder="+15551234567"
                />
              </div>
            )}
            {createError && (
              <p role="alert" data-testid="channel-create-error" className="text-sm text-status-critical">
                {createError}
              </p>
            )}
            <div>
              <Button type="submit" isLoading={creating} data-testid="channel-create-submit">
                {creating ? 'Adding…' : 'Add channel'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {testMsg && (
        <div
          role="status"
          data-testid="channel-test-msg"
          className="mt-4 rounded-lg border border-status-success/40 bg-status-success-bg px-4 py-2 text-sm text-status-success"
        >
          {testMsg}
        </div>
      )}
      {loadError && (
        <div
          role="alert"
          data-testid="channels-error"
          className="mt-4 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
        >
          {loadError}
        </div>
      )}

      {!channels && !loadError && (
        <Card className="mt-4 p-2">
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        </Card>
      )}

      {channels && channels.length === 0 && (
        <div className="mt-4" data-testid="channels-empty">
          <EmptyState
            icon={Inbox}
            title="No channels yet"
            description="Add a channel above so escalation policies have somewhere to deliver alerts."
          />
        </div>
      )}

      {channels && channels.length > 0 && (
        <Card className="mt-4 overflow-hidden p-0" data-testid="channels-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((c) => (
                <TableRow key={c.id} data-testid={`channel-row-${c.id}`}>
                  <TableCell className="font-medium text-content-strong">{c.name}</TableCell>
                  <TableCell>
                    <Badge tone="neutral">{c.kind}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge tone={c.isActive ? 'success' : 'neutral'}>
                      {c.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <PermissionGuard permission="ORG_SETTINGS">
                        <Button
                          variant="secondary"
                          size="sm"
                          isLoading={busyId === c.id}
                          onClick={() => void handleToggle(c.id, !c.isActive)}
                          data-testid={`channel-toggle-${c.id}`}
                          leftIcon={
                            c.isActive ? (
                              <PowerOff className="h-3.5 w-3.5" />
                            ) : (
                              <Power className="h-3.5 w-3.5" />
                            )
                          }
                        >
                          {c.isActive ? 'Disable' : 'Enable'}
                        </Button>
                      </PermissionGuard>
                      <Button
                        variant="secondary"
                        size="sm"
                        isLoading={busyId === c.id}
                        onClick={() => void handleTest(c.id)}
                        data-testid={`channel-test-${c.id}`}
                        leftIcon={<Send className="h-3.5 w-3.5" />}
                      >
                        Test
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        isLoading={busyId === c.id}
                        onClick={() => void handleDelete(c.id)}
                        data-testid={`channel-delete-${c.id}`}
                        className="text-status-critical hover:bg-status-critical-bg"
                        leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      </RequirePermission>
    </AppShell>
  );
}
