'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AppShell } from '../../../../components/app-shell';
import { RequirePermission } from '../../../../components/auth/require-permission';
import { Button, Card, CardContent, PageHeader } from '../../../../components/ui';
import { ApiError, linkSlackAccount } from '../../../../lib/api-client';

/**
 * Opened from the private link `/kpi` sends an unlinked Slack user. Signing in
 * (if needed) and confirming binds that Slack user to this account, so `/kpi`
 * then answers with what this account may see.
 */
export default function SlackLinkPage() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token'));
  }, []);

  const confirm = async () => {
    if (!token) return;
    setError(null);
    setState('busy');
    try {
      await linkSlackAccount(token);
      setState('done');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not link your Slack account');
      setState('idle');
    }
  };

  return (
    <RequirePermission permission="KPI_VIEW">
      <AppShell title="Link Slack" crumbs={[{ label: 'Home', href: '/' }, { label: 'Integrations', href: '/integrations' }, { label: 'Link Slack' }]}>
        <PageHeader title="Link Slack" subtitle="Use /kpi in Slack with your KPI Nexus account." />
        <Card className="max-w-xl">
          <CardContent className="space-y-3">
            {state === 'done' ? (
              <p className="text-sm text-content-strong" data-testid="slack-link-done">
                Linked. Go back to Slack and run <code>/kpi</code> again. It shows only the KPIs and values this account can see.
              </p>
            ) : (
              <>
                <p className="text-sm text-content-muted">
                  Link the Slack user who opened this page to your KPI Nexus account. <code>/kpi</code> will then answer with what this account can see.
                </p>
                <Button onClick={() => void confirm()} disabled={!token || state === 'busy'} data-testid="slack-link-confirm">
                  {state === 'busy' ? 'Linking…' : 'Link my Slack account'}
                </Button>
                {!token && <p className="text-sm text-status-critical">This page needs the link from <code>/kpi</code> in Slack.</p>}
              </>
            )}
            {error && <p className="text-sm text-status-critical" role="alert" data-testid="slack-link-error">{error}</p>}
            <p>
              <Link href="/integrations" className="text-sm text-content-muted hover:text-content-strong">Back to integrations</Link>
            </p>
          </CardContent>
        </Card>
      </AppShell>
    </RequirePermission>
  );
}
