'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Inbox, Pencil, Power, PowerOff, Send, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
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
  createNotificationChannel,
  deleteNotificationChannel,
  getAccessToken,
  listNotificationChannels,
  testNotificationChannel,
  updateNotificationChannel,
  type NotificationChannel,
} from '../../../lib/api-client';
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import {
  CHANNEL_KINDS,
  CHANNEL_KIND_LABELS,
  EMPTY_CHANNEL_FORM,
  type ChannelForm,
  type ChannelKind,
  channelCreateBody,
  channelEditBody,
  channelEditForm,
  channelFormProblem,
  needsUrl,
} from '../../../lib/channel-form';
import { useAsyncData } from '../../../lib/use-async-data';
import { useConfirm } from '../../../lib/use-confirm';
import { usePermissions } from '../../../lib/use-permissions';
import { useToast } from '../../../lib/use-toast';

/** What "Send test" came back with, shown until the next test. */
interface TestOutcome {
  channelName: string;
  sent: boolean;
  detail: string;
}

export default function ChannelsPage() {
  const router = useRouter();
  // FE-014: load only once the page gate passes, so users without access
  // are redirected without first drawing a 403 from the api.
  const { ready, has } = usePermissions();
  const allowed = ready && has('ORG_SETTINGS');
  const channels = useAsyncData(() => listNotificationChannels(), [], { enabled: allowed });
  const confirm = useConfirm();
  const toast = useToast();

  const [form, setForm] = useState<ChannelForm>(EMPTY_CHANNEL_FORM);
  const [editing, setEditing] = useState<NotificationChannel | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<TestOutcome | null>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace(currentLoginRedirect());
  }, [router]);

  const set = (key: 'name' | 'recipients' | 'url') => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const reset = () => {
    setForm(EMPTY_CHANNEL_FORM);
    setEditing(null);
    setFormError(null);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = channelFormProblem(form, editing !== null);
    setFormError(problem);
    if (problem) return;
    setSaving(true);
    try {
      if (editing) {
        await updateNotificationChannel(editing.id, channelEditBody(editing, form));
        toast.success('Channel saved');
      } else {
        await createNotificationChannel(channelCreateBody(form));
        toast.success('Channel added', 'Send a test to check it reaches you.');
      }
      reset();
      channels.reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'The channel was not saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(channel: NotificationChannel) {
    setBusyId(channel.id);
    setOutcome(null);
    try {
      const result = await testNotificationChannel(channel.id);
      setOutcome(
        result.sent
          ? { channelName: channel.name, sent: true, detail: channel.target ? `Sent to ${channel.target}.` : 'Sent.' }
          : { channelName: channel.name, sent: false, detail: result.error ?? 'The test message could not be delivered.' },
      );
    } catch (err) {
      setOutcome({ channelName: channel.name, sent: false, detail: err instanceof ApiError ? err.message : 'The test could not be run. Try again.' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(channel: NotificationChannel) {
    setBusyId(channel.id);
    try {
      await updateNotificationChannel(channel.id, { isActive: !channel.isActive });
      toast.success(channel.isActive ? 'Channel disabled' : 'Channel enabled', channel.isActive ? 'Alerts will not be sent through it until it is enabled again.' : undefined);
      channels.reload();
    } catch (err) {
      toast.error('That did not work', err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  }

  const remove = (channel: NotificationChannel) =>
    confirm({
      title: `Delete “${channel.name}”?`,
      description: 'Alert rules that send through this channel will stop sending there. Their other steps are not affected.',
      confirmLabel: 'Delete channel',
      tone: 'danger',
      testId: 'channel-delete-confirm',
      action: async () => {
        await deleteNotificationChannel(channel.id);
        if (editing?.id === channel.id) reset();
        setOutcome(null);
        channels.reload();
        toast.success('Channel deleted');
      },
    });

  const kindAbout = CHANNEL_KINDS.find((k) => k.value === form.kind)?.about;
  const rows = channels.data;

  return (
    <AppShell>
      <RequirePermission permission="ORG_SETTINGS">
      <PageHeader
        title="Notification channels"
        subtitle="Where alerts are sent besides the app — email, Slack, Teams or your own webhook."
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

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>{editing ? `Edit “${editing.name}”` : 'Add channel'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="grid gap-4" data-testid="channel-create-form">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="channel-name" required>
                  Name
                </Label>
                <Input id="channel-name" value={form.name} onChange={set('name')} data-testid="channel-name-input" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="channel-kind">Sends by</Label>
                {editing ? (
                  <p className="flex h-10 items-center text-sm text-content-strong" data-testid="channel-kind-fixed">
                    {CHANNEL_KIND_LABELS[editing.kind]}
                  </p>
                ) : (
                  <Select id="channel-kind" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as ChannelKind }))} data-testid="channel-kind-select">
                    {CHANNEL_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            </div>
            {kindAbout && <p className="-mt-2 text-xs text-content-muted">{kindAbout}</p>}
            {form.kind === 'EMAIL' && (
              <div className="grid gap-2">
                <Label htmlFor="channel-recipients" required>
                  Send to <span className="font-normal text-content-muted">(addresses separated by commas)</span>
                </Label>
                <Input id="channel-recipients" value={form.recipients} onChange={set('recipients')} data-testid="channel-recipients-input" placeholder="ops@acme.com, oncall@acme.com" />
              </div>
            )}
            {needsUrl(form.kind) && (
              <div className="grid gap-2">
                <Label htmlFor="channel-url" required={!editing}>
                  {editing ? 'New URL' : 'URL'}
                </Label>
                <Input id="channel-url" value={form.url} onChange={set('url')} type="url" data-testid="channel-url-input" placeholder="https://…" />
                {editing && (
                  <p className="text-xs text-content-muted">
                    It posts to {editing.target ?? 'the saved URL'} now. The full address is kept secret, so it is not shown; leave this blank to keep it.
                  </p>
                )}
              </div>
            )}
            {formError && (
              <p role="alert" data-testid="channel-create-error" className="text-sm text-status-critical">
                {formError}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" isLoading={saving} data-testid="channel-create-submit">
                {editing ? 'Save changes' : 'Add channel'}
              </Button>
              {editing && (
                <Button type="button" variant="ghost" onClick={reset} data-testid="channel-edit-cancel">
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {outcome && (
        <div
          role={outcome.sent ? 'status' : 'alert'}
          data-testid="channel-test-msg"
          data-outcome={outcome.sent ? 'sent' : 'failed'}
          className={
            outcome.sent
              ? 'mt-4 rounded-lg border border-status-success/40 bg-status-success-bg px-4 py-2 text-sm text-status-success'
              : 'mt-4 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-2 text-sm text-status-critical'
          }
        >
          <span className="font-semibold">
            {outcome.sent ? `Test sent through “${outcome.channelName}”.` : `The test through “${outcome.channelName}” was not sent.`}
          </span>{' '}
          {outcome.detail}
        </div>
      )}
      {channels.error && (
        <div role="alert" data-testid="channels-error" className="mt-4 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical">
          {channels.error}{' '}
          <button type="button" className="underline" onClick={channels.reload}>
            Try again
          </button>
        </div>
      )}

      {!rows && !channels.error && (
        <Card className="mt-4 p-2">
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        </Card>
      )}

      {rows && rows.length === 0 && (
        <div className="mt-4" data-testid="channels-empty">
          <EmptyState icon={Inbox} title="No channels yet" description="Add one above, then choose it on an alert rule's notification steps." />
        </div>
      )}

      {rows && rows.length > 0 && (
        <Card className="mt-4 overflow-hidden p-0" data-testid="channels-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Sends by</TableHead>
                <TableHead>Sends to</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} data-testid={`channel-row-${c.id}`}>
                  <TableCell className="font-medium text-content-strong">{c.name}</TableCell>
                  <TableCell>
                    <Badge tone="neutral">{CHANNEL_KIND_LABELS[c.kind]}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[18rem] truncate text-sm text-content" title={c.target ?? undefined}>
                    {c.target ?? (c.kind === 'IN_APP' ? 'The app' : '—')}
                  </TableCell>
                  <TableCell>
                    <Badge tone={c.isActive ? 'success' : 'neutral'}>{c.isActive ? 'Active' : 'Disabled'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" disabled={busyId === c.id} onClick={() => void handleTest(c)} data-testid={`channel-test-${c.id}`} leftIcon={<Send className="h-3.5 w-3.5" />}>
                        Send test
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyId === c.id}
                        onClick={() => {
                          setEditing(c);
                          setForm(channelEditForm(c));
                          setFormError(null);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        data-testid={`channel-edit-${c.id}`}
                        leftIcon={<Pencil className="h-3.5 w-3.5" />}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyId === c.id}
                        onClick={() => void handleToggle(c)}
                        data-testid={`channel-toggle-${c.id}`}
                        leftIcon={c.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                      >
                        {c.isActive ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === c.id}
                        onClick={() => void remove(c)}
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
