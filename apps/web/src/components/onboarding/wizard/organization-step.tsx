'use client';

import type { DraftProblem, OnboardingDraftInput } from '@kpi-nexus/contracts';
import { useEffect, useMemo, useState } from 'react';

import {
  MONTH_OPTIONS,
  SIZE_TIER_OPTIONS,
  WEEK_START_OPTIONS,
  browserTimeZone,
  currencyOptions,
  localeOptions,
  timeZoneOptions,
} from '../../../lib/org-options';
import { fieldClass, labelClass } from './fields';

type Organization = NonNullable<OnboardingDraftInput['organization']>;

export interface OrganizationStepProps {
  value: Organization;
  problems: readonly DraftProblem[];
  onChange: (next: Organization) => void;
}

/**
 * Step 1: who the organisation is, and the settings every number and date in
 * the app depends on — where it is, what it counts money in, when its year
 * starts. Everything but the name can be left for later: unset values keep the
 * defaults and are changed in Settings.
 */
export function OrganizationStep({ value, problems, onChange }: OrganizationStepProps) {
  const problemFor = (field: string) => problems.find((p) => p.section === 'organization' && p.field === field)?.message;
  const set = <K extends keyof Organization>(key: K, next: Organization[K] | undefined) => {
    const copy: Organization = { ...value };
    if (next === undefined || next === '') delete copy[key];
    else copy[key] = next;
    onChange(copy);
  };

  // The browser's zone is only known after mount; rendering it on the server would mismatch.
  const [myZone, setMyZone] = useState<string | null>(null);
  useEffect(() => setMyZone(browserTimeZone()), []);

  const zones = useMemo(() => timeZoneOptions(value.timezone), [value.timezone]);
  const currencies = useMemo(() => currencyOptions(value.currency), [value.currency]);
  const locales = useMemo(() => localeOptions(value.locale), [value.locale]);
  const nameError = problemFor('name');

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <h2 className="text-sm font-semibold text-content-strong">About</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="wizard-org-name">
              Organization name
            </label>
            <input
              id="wizard-org-name"
              data-testid="wizard-org-name"
              value={value.name ?? ''}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'wizard-org-name-error' : undefined}
              className={`${fieldClass} max-w-md`}
            />
            {nameError && (
              <p id="wizard-org-name-error" data-testid="wizard-org-name-error" role="alert" className="mt-1 text-xs text-status-critical">
                {nameError}
              </p>
            )}
          </div>
          <div>
            <label className={labelClass} htmlFor="wizard-org-industry">
              Industry
            </label>
            <input
              id="wizard-org-industry"
              data-testid="wizard-org-industry"
              value={value.industry ?? ''}
              onChange={(e) => set('industry', e.target.value)}
              placeholder="e.g. Software, Retail, Logistics"
              maxLength={120}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="wizard-org-size">
              Size
            </label>
            <select
              id="wizard-org-size"
              data-testid="wizard-org-size"
              value={SIZE_TIER_OPTIONS.some((o) => o.value === value.sizeTier) ? value.sizeTier : ''}
              onChange={(e) => set('sizeTier', e.target.value)}
              className={fieldClass}
            >
              <option value="">Not set</option>
              {SIZE_TIER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <h2 className="text-sm font-semibold text-content-strong">Region and calendar</h2>
        <p className="mt-1 text-xs text-content-muted">
          Used for dates, money and reporting periods everywhere. Leave any of these as they are and change them later in Settings.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="wizard-org-timezone">
              Time zone
            </label>
            <select
              id="wizard-org-timezone"
              data-testid="wizard-org-timezone"
              value={value.timezone ?? ''}
              onChange={(e) => set('timezone', e.target.value)}
              aria-invalid={problemFor('timezone') ? true : undefined}
              className={fieldClass}
            >
              <option value="">UTC (default)</option>
              {zones.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {problemFor('timezone') && <p role="alert" className="mt-1 text-xs text-status-critical">{problemFor('timezone')}</p>}
            {myZone && myZone !== value.timezone && (
              <button
                type="button"
                data-testid="wizard-org-use-my-timezone"
                onClick={() => set('timezone', myZone)}
                className="mt-1 text-xs font-medium text-accent-primary hover:underline"
              >
                Use my time zone ({myZone.replace(/_/g, ' ')})
              </button>
            )}
          </div>
          <div>
            <label className={labelClass} htmlFor="wizard-org-currency">
              Currency
            </label>
            <select
              id="wizard-org-currency"
              data-testid="wizard-org-currency"
              value={value.currency?.toUpperCase() ?? ''}
              onChange={(e) => set('currency', e.target.value)}
              className={fieldClass}
            >
              <option value="">USD (default)</option>
              {currencies.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="wizard-org-locale">
              Language and number format
            </label>
            <select
              id="wizard-org-locale"
              data-testid="wizard-org-locale"
              value={value.locale ?? ''}
              onChange={(e) => set('locale', e.target.value)}
              className={fieldClass}
            >
              <option value="">English, United States (default)</option>
              {locales.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="wizard-org-fiscal-month">
              Financial year starts in
            </label>
            <select
              id="wizard-org-fiscal-month"
              data-testid="wizard-org-fiscal-month"
              value={value.fiscalYearStartMonth ?? ''}
              onChange={(e) => set('fiscalYearStartMonth', e.target.value === '' ? undefined : Number(e.target.value))}
              className={fieldClass}
            >
              <option value="">January (default)</option>
              {MONTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="wizard-org-week-start">
              Week starts on
            </label>
            <select
              id="wizard-org-week-start"
              data-testid="wizard-org-week-start"
              value={value.weekStartsOn ?? ''}
              onChange={(e) => set('weekStartsOn', e.target.value === '' ? undefined : Number(e.target.value))}
              className={fieldClass}
            >
              <option value="">Sunday (default)</option>
              {WEEK_START_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}
