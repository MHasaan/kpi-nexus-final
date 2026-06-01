'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  ApiError,
} from '../../lib/api-client';
import {
  type CachedDraft,
  type TemplateSummary,
  applyTemplate,
  cacheDraft,
  listTemplates,
  readCachedDraft,
  startOnboarding,
} from '../../lib/onboarding-client';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState<CachedDraft | null>(null);

  useEffect(() => {
    setResume(readCachedDraft());
  }, []);

  const beginSession = async (entryMode: string): Promise<CachedDraft | null> => {
    setError(null);
    if (!email.trim() || !orgName.trim()) {
      setError('Enter your email and an organization name first.');
      return null;
    }
    setBusy(true);
    try {
      const started = await startOnboarding(email.trim(), orgName.trim(), entryMode);
      const handle: CachedDraft = { ...started, organizationName: orgName.trim() };
      cacheDraft(handle);
      return handle;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start onboarding');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const pickQuickOrFull = async (mode: 'quick' | 'full') => {
    const handle = await beginSession(mode);
    if (handle) router.push('/signup/wizard');
  };

  const openGallery = async () => {
    setShowGallery(true);
    if (!templates) {
      try {
        setTemplates(await listTemplates());
      } catch {
        setTemplates([]);
      }
    }
  };

  const useTemplate = async (slug: string) => {
    const handle = await beginSession(`template:${slug}`);
    if (!handle) return;
    setBusy(true);
    try {
      await applyTemplate(handle.sessionId, handle.draftToken, slug);
      router.push('/signup/wizard');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not apply template');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Set up your organization</span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {resume && (
          <div data-testid="resume-banner" className="mb-6 flex items-center justify-between rounded-lg border border-accent-primary/40 bg-accent-primary/10 p-4">
            <span className="text-sm text-content-strong">Resume your setup for <strong>{resume.organizationName}</strong>?</span>
            <button type="button" data-testid="resume-button" onClick={() => router.push('/signup/wizard')} className="rounded bg-accent-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
              Resume
            </button>
          </div>
        )}

        <h1 className="text-2xl font-semibold text-content-strong">Welcome — let&apos;s build your KPI workspace</h1>
        {error && <p className="mt-3 text-sm text-status-critical" data-testid="signup-error">{error}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-xs text-content-muted">
            Your email
            <input data-testid="signup-email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full rounded border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong" placeholder="you@company.com" />
          </label>
          <label className="text-xs text-content-muted">
            Organization name
            <input data-testid="signup-org" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="mt-1 block w-full rounded border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong" placeholder="Acme Inc." />
          </label>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <button type="button" data-testid="entry-quick" onClick={() => pickQuickOrFull('quick')} disabled={busy} className="rounded-lg border border-border bg-surface-1 p-6 text-left transition-colors duration-150 hover:border-accent-primary disabled:opacity-50">
            <h3 className="text-sm font-semibold text-content-strong">Quick start</h3>
            <p className="mt-1 text-xs text-content-muted">5–10 minutes. Minimal setup, add detail later.</p>
            <EffortDots level={1} label="Lowest effort, fastest" />
          </button>
          <button type="button" data-testid="entry-full" onClick={() => pickQuickOrFull('full')} disabled={busy} className="rounded-lg border border-accent-primary bg-surface-1 p-6 text-left ring-2 ring-accent-primary/40 transition-colors duration-150 hover:border-accent-primary disabled:opacity-50">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-content-strong">Full setup</h3>
              <span className="rounded-full bg-accent-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-primary">Recommended</span>
            </div>
            <p className="mt-1 text-xs text-content-muted">Express your full org depth with the AI co-pilot.</p>
            <EffortDots level={3} label="Most effort, deepest setup" />
          </button>
          <button type="button" data-testid="entry-template" onClick={openGallery} disabled={busy} className="rounded-lg border border-border bg-surface-1 p-6 text-left transition-colors duration-150 hover:border-accent-primary disabled:opacity-50">
            <h3 className="text-sm font-semibold text-content-strong">Template gallery</h3>
            <p className="mt-1 text-xs text-content-muted">Start from a ready-made org and customize.</p>
            <EffortDots level={2} label="Medium effort, ready-made start" />
          </button>
        </div>

        {showGallery && (
          <div className="mt-8" data-testid="template-gallery">
            <h2 className="text-sm font-semibold text-content-strong">Templates</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(templates ?? []).map((t) => (
                <div key={t.slug} data-testid={`template-${t.slug}`} className="rounded-lg border border-border bg-surface-1 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-content-strong">{t.name}</h3>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-content-muted">{t.tier}</span>
                  </div>
                  <p className="mt-1 text-xs text-content-muted">{t.description}</p>
                  <p className="mt-2 text-xs text-content-muted">{t.counts.roles} roles · {t.counts.orgUnits} units · {t.counts.kpis} KPIs</p>
                  <button type="button" data-testid={`use-template-${t.slug}`} onClick={() => useTemplate(t.slug)} disabled={busy} className="mt-3 w-full rounded bg-accent-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                    Use this template
                  </button>
                </div>
              ))}
              {templates && templates.length === 0 && <p className="text-sm text-content-muted">No templates available.</p>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function EffortDots({ level, label }: { level: 1 | 2 | 3; label: string }) {
  return (
    <div className="mt-4 flex items-center gap-1.5" aria-label={label} title={label}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${i <= level ? 'bg-accent-primary' : 'bg-surface-2'}`}
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
