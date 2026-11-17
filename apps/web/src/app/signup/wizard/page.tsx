'use client';

import { type DraftProblem, type OnboardingDraftInput, validateOnboardingDraft } from '@kpi-nexus/contracts';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { AiCopilotRail } from '../../../components/onboarding/ai-copilot-rail';
import { DraftStatusBadge, OfflineBanner, useDraftSync } from '../../../components/onboarding/draft-sync-ui';
import { KpisStep } from '../../../components/onboarding/wizard/kpis-step';
import { OrganizationStep } from '../../../components/onboarding/wizard/organization-step';
import { type AdminAccount, ReviewStep } from '../../../components/onboarding/wizard/review-step';
import { RolesStep } from '../../../components/onboarding/wizard/roles-step';
import { StepRail } from '../../../components/onboarding/wizard/step-rail';
import { StructureStep } from '../../../components/onboarding/wizard/structure-step';
import { TeamStep } from '../../../components/onboarding/wizard/team-step';
import { ApiError, setTokens } from '../../../lib/api-client';
import {
  type CachedDraft,
  type DraftPayload,
  clearCachedDraft,
  completeOnboarding,
  getDraft,
  readCachedDraft,
} from '../../../lib/onboarding-client';
import {
  WIZARD_STEPS,
  type WizardStepId,
  draftCounts,
  problemsByStep,
  slugFromName,
  stepFromParam,
  stepNeighbours,
  wizardMode,
} from '../../../lib/wizard-steps';
import { type AdminAccountErrors, adminAccountErrors, finishMessage, firstInvalidField } from '../../../lib/wizard-finish';
import { retargetManager } from '../../../lib/wizard-team';
import { useToast } from '../../../lib/use-toast';

export default function WizardPage() {
  // `useSearchParams` needs a Suspense boundary for the static shell.
  return (
    <Suspense fallback={null}>
      <Wizard />
    </Suspense>
  );
}

function Wizard() {
  const router = useRouter();
  const step = stepFromParam(useSearchParams().get('step'));
  const [handle, setHandle] = useState<CachedDraft | null>(null);
  const [payload, setPayload] = useState<DraftPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverProblems, setServerProblems] = useState<DraftProblem[] | null>(null);

  // AI co-pilot rail: open by default on wide screens; Esc closes it.
  const [railOpen, setRailOpen] = useState(false);
  useEffect(() => {
    setRailOpen(window.matchMedia('(min-width: 1280px)').matches);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRailOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [admin, setAdmin] = useState<AdminAccount>({ fullName: '', email: '', password: '', confirm: '', slug: '' });
  const [adminErrors, setAdminErrors] = useState<AdminAccountErrors>({});
  const [completing, setCompleting] = useState(false);
  const toast = useToast();

  const loadDraft = useCallback(async (h: CachedDraft) => {
    try {
      const d = await getDraft(h.sessionId, h.draftToken);
      setPayload(d.payload);
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
    // The email sign-up started with is the administrator's, unless they change it.
    setAdmin((prev) => ({ ...prev, slug: prev.slug || slugFromName(h.organizationName), email: prev.email || h.email || '' }));
    void loadDraft(h);
  }, [loadDraft, router]);

  // Debounced draft autosave; a failed save is kept and retried (offline banner).
  const { state: sync, edit, flush } = useDraftSync(handle);

  /** Replace whole draft sections: shown at once, saved shortly after. */
  const update = useCallback(
    (patch: Partial<OnboardingDraftInput>) => {
      setServerProblems(null);
      setPayload((current) => ({ ...(current ?? {}), ...patch }));
      edit(patch);
    },
    [edit],
  );

  const go = useCallback(
    (next: WizardStepId) => {
      router.push(`/signup/wizard?step=${next}`, { scroll: false });
      window.scrollTo({ top: 0 });
    },
    [router],
  );

  const draft: OnboardingDraftInput = payload ?? {};

  /** The administrator's account. When their email changes, the people who report to "me" follow it. */
  const changeAdmin = (next: AdminAccount) => {
    if (next.email !== admin.email) {
      const team = retargetManager(draft.team ?? [], admin.email, next.email);
      if (team) update({ team });
    }
    setAdmin(next);
    // Once Finish has been tried, each field's message follows what is typed.
    if (Object.keys(adminErrors).length > 0) setAdminErrors(adminAccountErrors(next));
  };
  // The same check the server runs on Finish, so the list here is the list there.
  const problems = useMemo(
    () => serverProblems ?? (payload ? validateOnboardingDraft(payload, { adminEmail: admin.email || undefined }) : []),
    [serverProblems, payload, admin.email],
  );
  const grouped = useMemo(() => problemsByStep(problems), [problems]);
  const counts = draftCounts(draft);
  const mode = wizardMode(handle?.entryMode);
  const { prev, next } = stepNeighbours(step, mode);
  const current = WIZARD_STEPS.find((s) => s.id === step)!;

  const saveAndContinue = async () => {
    setError(null);
    if (!(await flush())) {
      setError('Your latest changes are not saved yet. Retry saving, then continue.');
      return;
    }
    if (next) go(next);
  };

  const FIELD_IDS = { fullName: 'admin-name', email: 'admin-email', password: 'admin-password', confirm: 'admin-password-confirm', slug: 'org-slug' } as const;

  const complete = async () => {
    if (!handle) return;
    setError(null);
    // The form first: nothing is sent while a field is wrong.
    const formErrors = adminAccountErrors(admin);
    setAdminErrors(formErrors);
    const invalid = firstInvalidField(formErrors);
    if (invalid) {
      document.getElementById(FIELD_IDS[invalid])?.focus();
      return;
    }
    setCompleting(true);
    // Completion builds the org from the saved draft: an unsaved edit would be lost.
    if (!(await flush())) {
      setError('Your latest changes are not saved yet. Retry saving, then finish setup.');
      setCompleting(false);
      return;
    }
    if (problems.length > 0) {
      setError('Fix what is listed above first — setup cannot be finished until then.');
      setCompleting(false);
      return;
    }
    try {
      const res = await completeOnboarding(handle.sessionId, handle.draftToken, {
        adminEmail: admin.email.trim(),
        adminPassword: admin.password,
        adminFullName: admin.fullName.trim(),
        slug: admin.slug.trim(),
      });
      setTokens(res.accessToken, res.refreshToken);
      clearCachedDraft();
      const message = finishMessage(res.organization?.name ?? draft.organization?.name ?? '', res);
      if (message.tone === 'success') toast.success(message.title, message.description);
      else toast.error(message.title, message.description);
      router.push('/dashboard');
    } catch (e) {
      if (e instanceof ApiError) {
        const details = e.details as { problems?: DraftProblem[]; violations?: Array<{ message: string }> } | undefined;
        if (details?.problems?.length) setServerProblems(details.problems);
        if (details?.violations?.length) {
          // The server's own password rule, on the password field.
          setAdminErrors({ password: `Password ${details.violations.map((v) => v.message).join(', ')}.` });
          document.getElementById(FIELD_IDS.password)?.focus();
        } else if (e.status === 409) {
          setAdminErrors({ slug: 'That web address is already in use. Choose another.' });
          document.getElementById(FIELD_IDS.slug)?.focus();
        } else {
          setError(e.message);
        }
      } else {
        setError('Could not finish setup');
      }
    } finally {
      setCompleting(false);
    }
  };

  return (
    <main className={`min-h-screen bg-surface-bg ${railOpen ? 'xl:pr-[380px]' : ''}`}>
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-content-strong hover:text-accent-primary">
            KPI Nexus
          </Link>
          <span className="text-sm text-content-muted">Setup wizard</span>
          <DraftStatusBadge state={sync} />
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

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[230px_minmax(0,1fr)]">
        <StepRail current={step} counts={counts} problems={grouped} mode={mode} onGo={go} />

        <div className="min-w-0 space-y-6">
          <OfflineBanner state={sync} onRetry={() => void flush()} />
          {error && (
            <p role="alert" className="text-sm text-status-critical" data-testid="wizard-error">
              {error}
            </p>
          )}

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-content-muted">
              Step {WIZARD_STEPS.indexOf(current) + 1} of {WIZARD_STEPS.length}
            </p>
            <h1 className="mt-1 text-xl font-semibold text-content-strong">{current.label}</h1>
          </div>

          <div data-testid="wizard-step-content" className="space-y-4">
            {step === 'organization' && mode === 'quick' && (
              <p data-testid="wizard-quick-note" className="rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm text-content-default">
                Quick start: name your organization, then create your account. The four standard roles are already in place.
                Units, KPIs and people can be added now from the steps on the left, or any time after setup.
              </p>
            )}
            {step === 'organization' && (
              <OrganizationStep
                value={draft.organization ?? {}}
                problems={grouped.organization}
                onChange={(organization) => update({ organization })}
              />
            )}

            {step === 'structure' && <StructureStep draft={draft} problems={grouped.structure} onChange={update} />}

            {step === 'roles' && <RolesStep draft={draft} problems={grouped.roles} onChange={update} />}

            {step === 'kpis' && <KpisStep draft={draft} problems={grouped.kpis} onChange={update} onGo={go} />}

            {step === 'team' && <TeamStep draft={draft} problems={grouped.team} adminEmail={admin.email} onChange={update} />}

            {step === 'review' && (
              <ReviewStep
                draft={draft}
                problems={problems}
                admin={admin}
                errors={adminErrors}
                onAdminChange={changeAdmin}
                onGo={go}
                onFinish={() => void complete()}
                finishing={completing}
              />
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border-divider pt-4">
            <button
              type="button"
              data-testid="wizard-back"
              onClick={() => prev && go(prev)}
              disabled={!prev}
              className="rounded border border-border px-4 py-2 text-sm font-medium text-content-strong hover:border-accent-primary disabled:opacity-40"
            >
              Back
            </button>
            {next && (
              <button
                type="button"
                data-testid="wizard-continue"
                onClick={() => void saveAndContinue()}
                className="rounded-md bg-accent-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Save &amp; continue
              </button>
            )}
          </div>
        </div>
      </div>

      {railOpen && handle && payload && (
        <AiCopilotRail handle={handle} payload={payload} onDraftChanged={() => loadDraft(handle)} onClose={() => setRailOpen(false)} />
      )}
    </main>
  );
}
