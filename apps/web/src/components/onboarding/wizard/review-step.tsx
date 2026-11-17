'use client';

import type { DraftProblem, OnboardingDraftInput } from '@kpi-nexus/contracts';

import { type AdminAccountErrors, type AdminAccountForm, PASSWORD_MIN_LENGTH } from '../../../lib/wizard-finish';
import { WIZARD_STEPS, type WizardStepId, problemsByStep } from '../../../lib/wizard-steps';
import { unitTreeRows } from '../../../lib/wizard-structure';
import { fieldClass, labelClass } from './fields';

export type AdminAccount = AdminAccountForm;

export interface ReviewStepProps {
  draft: OnboardingDraftInput;
  problems: readonly DraftProblem[];
  admin: AdminAccount;
  /** What is wrong with the account form — shown once Finish has been tried. */
  errors: AdminAccountErrors;
  onAdminChange: (next: AdminAccount) => void;
  onGo: (step: WizardStepId) => void;
  onFinish: () => void;
  finishing: boolean;
}

interface Listing {
  key: string;
  label: string;
  step: WizardStepId;
  items: string[];
}

/** Everything setup will create, by name, in the order of the steps. */
function listings(draft: OnboardingDraftInput): Listing[] {
  const named = (rows: ReadonlyArray<{ name: string }> | undefined) => (rows ?? []).map((r) => r.name.trim() || 'unnamed');
  return [
    { key: 'orgUnits', label: 'Units', step: 'structure', items: unitTreeRows(draft.orgUnits ?? []).map((r) => `${'— '.repeat(r.depth)}${r.unit.name.trim() || 'unnamed'}`) },
    { key: 'roles', label: 'Roles', step: 'roles', items: (draft.roles ?? []).map((r) => `${r.name.trim() || 'unnamed'}${r.isAdmin ? ' (administrator)' : ''}`) },
    { key: 'positions', label: 'Positions', step: 'roles', items: named(draft.positions) },
    { key: 'kpiCategories', label: 'KPI categories', step: 'kpis', items: named(draft.kpiCategories) },
    { key: 'kpis', label: 'KPIs', step: 'kpis', items: named(draft.kpis) },
    {
      key: 'team',
      label: 'People to invite',
      step: 'team',
      items: (draft.team ?? []).map((p) => (p.fullName.trim() ? `${p.fullName.trim()} (${p.email.trim()})` : p.email.trim() || 'no email yet')),
    },
  ];
}

/**
 * The last step: what will be created, what still stops it, and the
 * administrator's own account. Problems are grouped by the step that fixes
 * them, each group a way back there.
 */
export function ReviewStep({ draft, problems, admin, errors, onAdminChange, onGo, onFinish, finishing }: ReviewStepProps) {
  const grouped = problemsByStep(problems);
  const set = (key: keyof AdminAccount) => (e: { target: { value: string } }) => onAdminChange({ ...admin, [key]: e.target.value });
  const org = draft.organization ?? {};

  /** A labelled input with its hint and, when there is one, its error. */
  const input = (
    key: keyof AdminAccount,
    testId: string,
    label: string,
    props: { type?: string; autoComplete?: string; hint?: string } = {},
  ) => (
    <div>
      <label className={labelClass} htmlFor={testId}>
        {label}
      </label>
      <input
        id={testId}
        data-testid={testId}
        type={props.type}
        autoComplete={props.autoComplete}
        value={admin[key]}
        onChange={set(key)}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${testId}-error` : props.hint ? `${testId}-hint` : undefined}
        className={fieldClass}
      />
      {errors[key] ? (
        <p id={`${testId}-error`} data-testid={`${testId}-error`} role="alert" className="mt-1 text-xs text-status-critical">
          {errors[key]}
        </p>
      ) : (
        props.hint && (
          <p id={`${testId}-hint`} className="mt-1 text-xs text-content-muted">
            {props.hint}
          </p>
        )
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <h2 className="text-sm font-semibold text-content-strong">What will be created</h2>
        <p className="mt-1 text-sm text-content-default">
          <strong>{org.name?.trim() || 'Your organization'}</strong>
          {org.industry?.trim() ? ` · ${org.industry.trim()}` : ''}
          {' · '}
          {org.timezone ?? 'UTC'} · {(org.currency ?? 'USD').toUpperCase()}
        </p>
        <ul className="mt-3 divide-y divide-border-divider">
          {listings(draft).map((list) => (
            <li key={list.key} className="py-2">
              <details>
                <summary data-testid={`review-list-${list.key}`} className="flex cursor-pointer items-center justify-between text-sm text-content-strong">
                  <span>{list.label}</span>
                  <span className="tabular-nums text-content-muted">{list.items.length}</span>
                </summary>
                {list.items.length === 0 ? (
                  <p className="mt-2 text-xs text-content-muted">
                    None.{' '}
                    <button type="button" onClick={() => onGo(list.step)} className="font-medium text-accent-primary hover:underline">
                      Add some
                    </button>
                  </p>
                ) : (
                  <ul data-testid={`review-list-${list.key}-items`} className="mt-2 grid gap-x-6 gap-y-0.5 text-xs text-content-default sm:grid-cols-2">
                    {list.items.map((item, i) => (
                      <li key={i} className="truncate" title={item}>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            </li>
          ))}
        </ul>
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
                <button type="button" onClick={() => onGo(step.id)} className="text-sm font-medium text-accent-primary hover:underline">
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
        <form
          className="mt-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onFinish();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {input('fullName', 'admin-name', 'Your full name', { autoComplete: 'name' })}
            {input('email', 'admin-email', 'Email', { type: 'email', autoComplete: 'email' })}
            {input('password', 'admin-password', 'Password', {
              type: 'password',
              autoComplete: 'new-password',
              hint: `At least ${PASSWORD_MIN_LENGTH} characters.`,
            })}
            {input('confirm', 'admin-password-confirm', 'Password again', { type: 'password', autoComplete: 'new-password' })}
            <div className="sm:col-span-2">
              {input('slug', 'org-slug', 'Web address', {
                hint: 'Lowercase letters, numbers and dashes. It identifies your organization in links.',
              })}
            </div>
          </div>
          <button
            type="submit"
            data-testid="wizard-complete"
            disabled={finishing}
            className="mt-5 rounded-md bg-accent-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {finishing ? 'Finishing…' : 'Finish setup'}
          </button>
        </form>
      </section>
    </div>
  );
}
