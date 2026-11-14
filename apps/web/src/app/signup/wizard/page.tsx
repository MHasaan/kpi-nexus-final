'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AiCopilotRail } from '../../../components/onboarding/ai-copilot-rail';
import { ApiError, setTokens } from '../../../lib/api-client';
import {
  type CachedDraft,
  type DraftPayload,
  clearCachedDraft,
  completeOnboarding,
  getDraft,
  patchDraft,
  readCachedDraft,
} from '../../../lib/onboarding-client';

type SyncStatus = 'idle' | 'saving' | 'saved';

function counts(p: DraftPayload) {
  return {
    roles: p.roles?.length ?? 0,
    positions: p.positions?.length ?? 0,
    orgUnits: p.orgUnits?.length ?? 0,
    kpiCategories: p.kpiCategories?.length ?? 0,
    kpis: p.kpis?.length ?? 0,
  };
}

export default function WizardPage() {
  const router = useRouter();
  const [handle, setHandle] = useState<CachedDraft | null>(null);
  const [payload, setPayload] = useState<DraftPayload | null>(null);
  const [orgName, setOrgName] = useState('');
  const [sync, setSync] = useState<SyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // AI co-pilot rail: open by default on wide screens; Esc closes it.
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => {
    setRailOpen(window.matchMedia('(min-width: 1024px)').matches);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRailOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Complete
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [slug, setSlug] = useState('');
  const [completing, setCompleting] = useState(false);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDraft = useCallback(async (h: CachedDraft) => {
    try {
      const d = await getDraft(h.sessionId, h.draftToken);
      setPayload(d.payload);
      setOrgName(d.payload.organization?.name ?? h.organizationName);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load draft');
    }
  }, []);

  useEffect(() => {
    const h = readCachedDraft();
    if (!h) {
      router.replace('/signup');
      return;
    }
    setHandle(h);
    setSlug(h.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    setAdminEmail((prev) => prev);
    void loadDraft(h);
  }, [loadDraft, router]);

  // Debounced draft sync of the org name (the DraftSyncProvider behaviour).
  const onOrgNameChange = (value: string) => {
    setOrgName(value);
    if (!handle) return;
    setSync('saving');
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        await patchDraft(handle.sessionId, handle.draftToken, { organization: { ...(payload?.organization ?? {}), name: value } }, 'org');
        setSync('saved');
      } catch {
        setSync('idle');
      }
    }, 600);
  };

  const complete = async () => {
    if (!handle) return;
    setError(null);
    setCompleting(true);
    try {
      const res = await completeOnboarding(handle.sessionId, handle.draftToken, { adminEmail, adminPassword, adminFullName, slug });
      setTokens(res.accessToken, res.refreshToken);
      clearCachedDraft();
      router.push('/dashboard');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not finish setup');
    } finally {
      setCompleting(false);
    }
  };

  const c = payload ? counts(payload) : null;

  return (
    <main className={`min-h-screen bg-surface-bg ${railOpen ? 'lg:pr-[380px]' : ''}`}>
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Setup wizard</span>
          <span data-testid="sync-status" className="ml-auto text-xs text-content-muted">
            {sync === 'saving' ? 'Saving…' : sync === 'saved' ? 'Saved ✓' : ''}
          </span>
          <button
            type="button"
            data-testid="copilot-toggle"
            aria-expanded={railOpen}
            onClick={() => setRailOpen((o) => !o)}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-content-strong hover:border-accent-primary"
          >
            ✨ AI co-pilot
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        {error && <p className="text-sm text-status-critical" data-testid="wizard-error">{error}</p>}

        {/* Organization */}
        <section>
          <h2 className="text-sm font-semibold text-content-strong">Organization</h2>
          <label className="mt-2 block text-xs text-content-muted">
            Name
            <input data-testid="wizard-org-name" value={orgName} onChange={(e) => onOrgNameChange(e.target.value)} className="mt-1 block w-full max-w-md rounded border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong" />
          </label>
        </section>

        {/* Review */}
        <section>
          <h2 className="text-sm font-semibold text-content-strong">Review</h2>
          <div data-testid="wizard-counts" className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {c &&
              Object.entries(c).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border bg-surface-1 p-3 text-center">
                  <p className="text-lg font-semibold text-content-strong" data-testid={`count-${k}`}>{v}</p>
                  <p className="text-xs text-content-muted">{k}</p>
                </div>
              ))}
          </div>
        </section>

        {/* Finish */}
        <section className="rounded-lg border border-border bg-surface-1 p-5">
          <h2 className="text-sm font-semibold text-content-strong">Create your admin account &amp; finish</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input data-testid="admin-name" value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} placeholder="Full name" className="rounded border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
            <input data-testid="admin-email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="Admin email" className="rounded border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
            <input data-testid="admin-password" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Password (min 8)" className="rounded border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
            <input data-testid="org-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="org-slug" className="rounded border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" />
          </div>
          <button type="button" data-testid="wizard-complete" onClick={complete} disabled={completing} className="mt-4 rounded-md bg-accent-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {completing ? 'Finishing…' : 'Finish setup'}
          </button>
        </section>
      </div>

      {railOpen && handle && payload && (
        <AiCopilotRail handle={handle} payload={payload} onDraftChanged={() => loadDraft(handle)} onClose={() => setRailOpen(false)} />
      )}
    </main>
  );
}
