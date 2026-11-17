'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  ApiError,
} from '../../lib/api-client';
import {
  type CachedDraft,
  type TemplatePreview,
  type TemplateSummary,
  applyTemplate,
  cacheDraft,
  clearCachedDraft,
  listTemplates,
  previewTemplate,
  readCachedDraft,
  startOnboarding,
} from '../../lib/onboarding-client';
import { type SignupEntryErrors, signupEntryErrors } from '../../lib/signup-entry';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SignupEntryErrors>({});
  const [previewSlug, setPreviewSlug] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, TemplatePreview | 'loading' | 'error'>>({});
  const [showGallery, setShowGallery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState<CachedDraft | null>(null);

  useEffect(() => {
    setResume(readCachedDraft());
  }, []);

  const beginSession = async (entryMode: string): Promise<CachedDraft | null> => {
    setError(null);
    const problems = signupEntryErrors(email, orgName);
    setFieldErrors(problems);
    if (problems.email || problems.orgName) {
      document.getElementById(problems.email ? 'signup-email' : 'signup-org')?.focus();
      return null;
    }
    setBusy(true);
    try {
      const started = await startOnboarding(email.trim(), orgName.trim(), entryMode);
      const handle: CachedDraft = { ...started, organizationName: orgName.trim(), email: email.trim() };
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

  const loadTemplates = async () => {
    setGalleryError(null);
    try {
      setTemplates(await listTemplates());
    } catch (e) {
      // A failed load is not "no templates": say so, and let them try again.
      setGalleryError(e instanceof ApiError ? e.message : 'The templates could not be loaded. Check your connection.');
    }
  };

  const openGallery = async () => {
    setShowGallery(true);
    if (!templates) await loadTemplates();
  };

  const togglePreview = async (slug: string) => {
    if (previewSlug === slug) {
      setPreviewSlug(null);
      return;
    }
    setPreviewSlug(slug);
    const known = previews[slug];
    if (known && known !== 'error') return;
    setPreviews((p) => ({ ...p, [slug]: 'loading' }));
    try {
      const loaded = await previewTemplate(slug);
      setPreviews((p) => ({ ...p, [slug]: loaded }));
    } catch {
      setPreviews((p) => ({ ...p, [slug]: 'error' }));
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
          <span className="ml-auto text-sm text-content-muted">
            Already have an account?{' '}
            <Link href="/login" data-testid="signup-signin-link" className="font-medium text-accent-primary hover:underline">
              Sign in
            </Link>
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {resume && (
          <div data-testid="resume-banner" className="mb-6 flex items-center justify-between rounded-lg border border-accent-primary/40 bg-accent-primary/10 p-4">
            <span className="text-sm text-content-strong">Resume your setup for <strong>{resume.organizationName}</strong>?</span>
            <span className="flex shrink-0 gap-2">
              <button
                type="button"
                data-testid="resume-discard"
                onClick={() => {
                  clearCachedDraft();
                  setResume(null);
                }}
                className="rounded border border-border px-3 py-1.5 text-sm text-content-strong hover:border-accent-primary"
              >
                Start over
              </button>
              <button type="button" data-testid="resume-button" onClick={() => router.push('/signup/wizard')} className="rounded bg-accent-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
                Resume
              </button>
            </span>
          </div>
        )}

        <h1 className="text-2xl font-semibold text-content-strong">Welcome — let&apos;s build your KPI workspace</h1>
        {error && (
          <p role="alert" className="mt-3 text-sm text-status-critical" data-testid="signup-error">
            {error}
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="text-xs text-content-muted">
            <label htmlFor="signup-email">Your email</label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              data-testid="signup-email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
              }}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
              className="mt-1 block w-full rounded border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong"
              placeholder="you@company.com"
            />
            {fieldErrors.email && (
              <p id="signup-email-error" role="alert" data-testid="signup-email-error" className="mt-1 text-xs text-status-critical">
                {fieldErrors.email}
              </p>
            )}
          </div>
          <div className="text-xs text-content-muted">
            <label htmlFor="signup-org">Organization name</label>
            <input
              id="signup-org"
              autoComplete="organization"
              data-testid="signup-org"
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                if (fieldErrors.orgName) setFieldErrors((f) => ({ ...f, orgName: undefined }));
              }}
              aria-invalid={fieldErrors.orgName ? true : undefined}
              aria-describedby={fieldErrors.orgName ? 'signup-org-error' : undefined}
              className="mt-1 block w-full rounded border border-border bg-surface-1 px-3 py-2 text-sm text-content-strong"
              placeholder="Acme Inc."
            />
            {fieldErrors.orgName && (
              <p id="signup-org-error" role="alert" data-testid="signup-org-error" className="mt-1 text-xs text-status-critical">
                {fieldErrors.orgName}
              </p>
            )}
          </div>
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
                  <div className="mt-3 flex gap-2">
                    <button type="button" data-testid={`use-template-${t.slug}`} onClick={() => useTemplate(t.slug)} disabled={busy} className="flex-1 rounded bg-accent-primary px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                      Use this template
                    </button>
                    <button
                      type="button"
                      data-testid={`preview-template-${t.slug}`}
                      aria-expanded={previewSlug === t.slug}
                      onClick={() => void togglePreview(t.slug)}
                      className="rounded border border-border px-3 py-1.5 text-xs font-medium text-content-strong hover:border-accent-primary"
                    >
                      {previewSlug === t.slug ? 'Hide' : "What's inside"}
                    </button>
                  </div>
                  {previewSlug === t.slug && <TemplateContents slug={t.slug} state={previews[t.slug]} />}
                </div>
              ))}
              {templates && templates.length === 0 && !galleryError && <p className="text-sm text-content-muted">No templates available.</p>}
            </div>
            {galleryError && (
              <p role="alert" data-testid="template-gallery-error" className="mt-3 text-sm text-status-critical">
                {galleryError}{' '}
                <button type="button" onClick={() => void loadTemplates()} className="font-medium underline">
                  Try again
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

const PREVIEW_SECTIONS = [
  ['roles', 'Roles'],
  ['positions', 'Positions'],
  ['orgUnits', 'Units'],
  ['kpiCategories', 'KPI categories'],
  ['kpis', 'KPIs'],
] as const;

/** What a template would create, by name — a look, not a choice. */
function TemplateContents({ slug, state }: { slug: string; state: TemplatePreview | 'loading' | 'error' | undefined }) {
  return (
    <div data-testid={`template-preview-${slug}`} className="mt-3 border-t border-border-divider pt-3 text-xs text-content-muted">
      {(state === undefined || state === 'loading') && <p>Loading…</p>}
      {state === 'error' && <p role="alert" className="text-status-critical">This template could not be opened. Try again in a moment.</p>}
      {state && typeof state === 'object' && (
        <dl className="flex flex-col gap-2">
          {PREVIEW_SECTIONS.map(([key, label]) => {
            const items = state.payload[key] ?? [];
            if (items.length === 0) return null;
            return (
              <div key={key}>
                <dt className="font-medium text-content-strong">
                  {label} ({items.length})
                </dt>
                <dd className="mt-0.5">{items.map((item) => item.name).join(' · ')}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
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
