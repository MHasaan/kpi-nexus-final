'use client';

import type { DraftProblem, OnboardingDraftInput } from '@kpi-nexus/contracts';

import { WIZARD_STEPS, type WizardStepId, draftCounts, problemsByStep } from '../../../lib/wizard-steps';

export interface AdminAccount {
  fullName: string;
  email: string;
  password: string;
  slug: string;
}

export interface ReviewStepProps {
  draft: OnboardingDraftInput;
  problems: readonly DraftProblem[];
  admin: AdminAccount;
  onAdminChange: (next: AdminAccount) => void;
  onGo: (step: WizardStepId) => void;
  onFinish: () => void;
  finishing: boolean;
}

const field =
  'mt-1 block w-full rounded border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30';

/**
 * The last step: what will be created, what still stops it, and the
 * administrator's own account. Problems are grouped by the step that fixes
 * them, each group a way back there.
 */
export function ReviewStep({ draft, problems, admin, onAdminChange, onGo, onFinish, finishing }: ReviewStepProps) {
  const counts = draftCounts(draft);
  const grouped = problemsByStep(problems);
  const summary: Array<[string, number]> = [
    ['Roles', counts.roles],
    ['Positions', counts.positions],
    ['Units', counts.orgUnits],
    ['KPI categories', counts.kpiCategories],
    ['KPIs', counts.kpis],
    ['People to invite', counts.team],
  ];
  const set = (key: keyof AdminAccount) => (e: { target: { value: string } }) => onAdminChange({ ...admin, [key]: e.target.value });

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-content-strong">What will be created</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {summary.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-surface-1 p-3">
              <dd className="text-lg font-semibold tabular-nums text-content-strong">{value}</dd>
              <dt className="text-xs text-content-muted">{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      {problems.length === 0 ? (
        <p data-testid="wizard-ready" className="rounded-lg border border-status-success/40 bg-status-success-bg px-4 py-3 text-sm text-status-success">
          Everything checks out. Create your account below to finish.
        </p>
      ) : (
        <section data-testid="wizard-problems" aria-labelledby="wizard-problems-title" className="rounded-lg border border-status-critical/40 bg-status-critical/5 p-4">
          <h2 id="wizard-problems-title" className="text-sm font-semibold text-content-strong">
            {problems.length === 1 ? 'One thing to fix before you can finish' : `${problems.length} things to fix before you can finish`}
          </h2>
          <ul className="mt-3 space-y-3">
            {WIZARD_STEPS.filter((s) => grouped[s.id].length > 0).map((step) => (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => onGo(step.id)}
                  className="text-sm font-medium text-accent-primary hover:underline"
                >
                  {step.label} →
                </button>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-content-default">
                  {grouped[step.id].map((problem, i) => (
                    <li key={i}>
                      {problem.index !== undefined && <span className="text-content-muted">Row {problem.index + 1}: </span>}
                      {problem.message}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-border bg-surface-1 p-5">
        <h2 className="text-sm font-semibold text-content-strong">Your administrator account</h2>
        <p className="mt-1 text-xs text-content-muted">You sign in with this email and password, and can change everything above later.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-content-default">
            Your full name
            <input data-testid="admin-name" autoComplete="name" value={admin.fullName} onChange={set('fullName')} className={field} />
          </label>
          <label className="text-xs font-medium text-content-default">
            Email
            <input data-testid="admin-email" type="email" autoComplete="email" value={admin.email} onChange={set('email')} className={field} />
          </label>
          <label className="text-xs font-medium text-content-default">
            Password
            <input
              data-testid="admin-password"
              type="password"
              autoComplete="new-password"
              value={admin.password}
              onChange={set('password')}
              aria-describedby="admin-password-hint"
              className={field}
            />
            <span id="admin-password-hint" className="mt-1 block font-normal text-content-muted">
              At least 8 characters.
            </span>
          </label>
          <label className="text-xs font-medium text-content-default">
            Web address
            <input data-testid="org-slug" value={admin.slug} onChange={set('slug')} aria-describedby="org-slug-hint" className={field} />
            <span id="org-slug-hint" className="mt-1 block font-normal text-content-muted">
              Lowercase letters, numbers and dashes. It identifies your organization in links.
            </span>
          </label>
        </div>
        <button
          type="button"
          data-testid="wizard-complete"
          onClick={onFinish}
          disabled={finishing}
          className="mt-5 rounded-md bg-accent-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {finishing ? 'Finishing…' : 'Finish setup'}
        </button>
      </section>
    </div>
  );
}
