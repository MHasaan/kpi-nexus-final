'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../../lib/api-client';
import { type SsoConfig, getSsoConfig, upsertSsoConfig } from '../../../lib/polish-client';
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import { usePermissions } from '../../../lib/use-permissions';

export default function SsoSettingsPage() {
  const router = useRouter();
  const [config, setConfig] = useState<SsoConfig | null>(null);
  const [protocol, setProtocol] = useState<'SAML' | 'OIDC'>('SAML');
  const [idpSsoUrl, setIdpSsoUrl] = useState('');
  const [idpEntityId, setIdpEntityId] = useState('');
  const [jit, setJit] = useState(true);
  const [active, setActive] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const c = await getSsoConfig();
      if (c) {
        setConfig(c);
        setProtocol(c.protocol);
        setIdpSsoUrl(c.idpSsoUrl ?? '');
        setIdpEntityId(c.idpEntityId ?? '');
        setJit(c.allowJitProvisioning);
        setActive(c.isActive);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load SSO config');
    }
  }, []);

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
    void load();
  }, [load, router, allowed]);

  const save = async () => {
    setSaved(false);
    try {
      const c = await upsertSsoConfig({
        protocol,
        idpSsoUrl: idpSsoUrl.trim() || undefined,
        idpEntityId: idpEntityId.trim() || undefined,
        allowJitProvisioning: jit,
        isActive: active,
      });
      setConfig(c);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
    }
  };

  // FE-014: same permission the page's API enforces — no broken 403 screens.
  return (
    <AppShell title="Single sign-on" crumbs={[{ label: 'Settings', href: '/settings' }, { label: 'Single sign-on' }]}>
    <RequirePermission permission="ORG_SETTINGS">

      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-content-strong">Single sign-on</h1>
        <p className="mt-1 text-sm text-content-muted">Configure SAML/OIDC. Users authenticate at your IdP; JIT provisioning auto-creates accounts on first login.</p>
        {/* Nothing signs anyone in through an identity provider yet (UI-014, waiting for ADR-002). Say so:
            an administrator could tick "Active" below and believe it was on. */}
        <div role="note" data-testid="sso-not-on-yet" className="mt-3 rounded-lg border border-status-warning-bg bg-status-warning-bg px-4 py-3 text-sm text-status-warning">
          <span className="font-medium">Not switched on yet.</span> What you save here is kept, but nobody can sign in through an
          identity provider in this version: the sign-in page takes an email and password only.
        </div>
        {error && <p className="mt-2 text-sm text-status-critical" data-testid="sso-error">{error}</p>}
        {saved && <p className="mt-2 text-sm text-status-positive" data-testid="sso-saved">Saved{config?.isActive ? ' · active' : ''}.</p>}

        <div className="mt-5 space-y-3 rounded-lg border border-border bg-surface-1 p-5">
          <label className="block text-xs text-content-muted">Protocol
            <select data-testid="sso-protocol" value={protocol} onChange={(e) => setProtocol(e.target.value as 'SAML' | 'OIDC')} className="mt-1 block w-full rounded border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong">
              <option value="SAML">SAML</option>
              <option value="OIDC">OIDC</option>
            </select>
          </label>
          <label className="block text-xs text-content-muted">IdP SSO URL
            <input data-testid="sso-url" value={idpSsoUrl} onChange={(e) => setIdpSsoUrl(e.target.value)} placeholder="https://idp.example.com/sso" className="mt-1 block w-full rounded border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
          </label>
          <label className="block text-xs text-content-muted">IdP Entity ID
            <input data-testid="sso-entity" value={idpEntityId} onChange={(e) => setIdpEntityId(e.target.value)} placeholder="urn:idp:entity" className="mt-1 block w-full rounded border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
          </label>
          <label className="flex items-center gap-2 text-sm text-content-muted">
            <input type="checkbox" data-testid="sso-jit" checked={jit} onChange={(e) => setJit(e.target.checked)} /> Allow JIT provisioning
          </label>
          <label className="flex items-center gap-2 text-sm text-content-muted">
            <input type="checkbox" data-testid="sso-active" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
          </label>
          <button type="button" data-testid="sso-save" onClick={save} className="rounded bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90">Save SSO config</button>
        </div>
      </div>
    </RequirePermission>
    </AppShell>
  );
}
