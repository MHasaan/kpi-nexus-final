'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../../lib/api-client';
import { type ScimTokenRow, listScimTokens, mintScimToken, revokeScimToken } from '../../../lib/polish-client';

export default function ScimSettingsPage() {
  const router = useRouter();
  const [tokens, setTokens] = useState<ScimTokenRow[]>([]);
  const [label, setLabel] = useState('');
  const [minted, setMinted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTokens(await listScimTokens());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load SCIM tokens');
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [load, router]);

  const mint = async () => {
    if (!label.trim()) return;
    try {
      const res = await mintScimToken(label.trim());
      setMinted(res.token);
      setLabel('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Mint failed');
    }
  };

  const revoke = async (id: string) => {
    try {
      await revokeScimToken(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Revoke failed');
    }
  };

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-4">
          <Link href="/settings" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">SCIM provisioning</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">SCIM tokens</h1>
        <p className="mt-1 text-sm text-content-muted">Bearer tokens your IdP (Okta/Azure AD) uses to provision users at <code>/scim/v2</code>.</p>
        {error && <p className="mt-2 text-sm text-status-critical" data-testid="scim-error">{error}</p>}

        {minted && (
          <div data-testid="scim-minted" className="mt-4 rounded-lg border border-status-positive/40 bg-status-positive/10 p-4">
            <p className="text-sm font-medium text-content-strong">Copy this token now — it won&apos;t be shown again:</p>
            <code className="mt-1 block break-all rounded bg-surface-bg px-2 py-1 text-xs text-content-strong" data-testid="scim-token-value">{minted}</code>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <input data-testid="scim-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Okta production)" className="flex-1 rounded border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong" />
          <button type="button" data-testid="scim-mint" onClick={mint} className="rounded bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">Mint token</button>
        </div>

        <div className="mt-6 space-y-2" data-testid="scim-token-list">
          {tokens.map((tk) => (
            <div key={tk.id} data-testid={`scim-token-${tk.id}`} className="flex items-center justify-between rounded-lg border border-border bg-surface-1 p-4 text-sm">
              <div>
                <span className="font-medium text-content-strong">{tk.label}</span>
                <span className="ml-2 text-xs text-content-muted">{tk.revokedAt ? 'revoked' : tk.lastUsedAt ? `last used ${new Date(tk.lastUsedAt).toLocaleDateString()}` : 'never used'}</span>
              </div>
              {!tk.revokedAt && <button type="button" data-testid={`scim-revoke-${tk.id}`} onClick={() => revoke(tk.id)} className="text-xs text-status-critical hover:underline">Revoke</button>}
            </div>
          ))}
          {tokens.length === 0 && <p className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted" data-testid="scim-empty">No SCIM tokens yet.</p>}
        </div>
      </div>
    </main>
  );
}
