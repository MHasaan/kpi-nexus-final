'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  clearTokens,
  createDashboard,
  getAccessToken,
} from '../../../lib/api-client';
import {
  TerminologyProvider,
  useTerminology,
} from '../../../lib/terminology-context';
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  PageHeader,
  Textarea,
} from '../../../components/ui';

export default function NewDashboardPage() {
  return (
    <TerminologyProvider>
      <NewDashboardInner />
    </TerminologyProvider>
  );
}

function NewDashboardInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await createDashboard({
        name: name.trim(),
        description: description.trim() || undefined,
        isShared,
      });
      router.push(`/dashboards/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setError(
        err instanceof ApiError ? err.message : 'Failed to create dashboard',
      );
      setSubmitting(false);
    }
  }

  return (
    <RequirePermission permission="DASHBOARD_MANAGE">
    <AppShell>
      <PageHeader
        title={
          <span data-testid="dashboards-new-heading">
            New {terminology.dashboardLabel.toLowerCase()}
          </span>
        }
        subtitle="A dashboard is your container for widgets. You can add widgets after creating it."
      />

      <div className="mt-6 max-w-2xl">
        <Card>
          <CardContent>
            <form
              onSubmit={handleSubmit}
              data-testid="dashboards-new-form"
              className="space-y-5"
            >
              <div className="space-y-2">
                <Label htmlFor="dashboard-name" required>
                  Name
                </Label>
                <Input
                  id="dashboard-name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  data-testid="dashboards-new-name"
                  placeholder="Executive overview"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dashboard-description">
                  Description{' '}
                  <span className="font-normal text-content-muted">(optional)</span>
                </Label>
                <Textarea
                  id="dashboard-description"
                  maxLength={2000}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submitting}
                  data-testid="dashboards-new-description"
                  placeholder="What this dashboard is for"
                />
              </div>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                  disabled={submitting}
                  data-testid="dashboards-new-shared"
                  className="mt-1 h-4 w-4 rounded border-border text-accent-primary focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span className="text-sm text-content">
                  <span className="font-medium text-content-strong">
                    Share with the organization
                  </span>
                  <br />
                  <span className="text-content-muted">
                    When enabled, all org members can view this dashboard. You can
                    still change this later.
                  </span>
                </span>
              </label>

              {error && (
                <p
                  role="alert"
                  data-testid="dashboards-new-error"
                  className="rounded-md border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
                >
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={submitting || name.trim().length < 2}
                  isLoading={submitting}
                  data-testid="dashboards-new-submit"
                >
                  {submitting ? 'Creating…' : 'Create dashboard'}
                </Button>
                <Link href="/dashboards">
                  <Button type="button" variant="secondary">
                    Cancel
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
    </RequirePermission>
  );
}
