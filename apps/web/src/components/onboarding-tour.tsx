'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { completeTour, meRequest } from '../lib/api-client';

/**
 * First-login product tour — a 5-slide dialog shown once per person.
 *
 * Whether someone has seen it lives on their account (`onboardingCompletedAt`),
 * so it follows them to another device and is not "already seen" for the next
 * person who signs in on this browser (plan 3.4). The old browser-wide flag is
 * still honoured so that a browser which dismissed the tour before this change
 * is not shown it again; nothing sets it any more.
 */
const LEGACY_BROWSER_FLAG = 'kpi-nexus.tour-completed';

export interface TourSlide {
  title: string;
  body: string;
}

/**
 * The slides for one person: only what they can open, in words that fit what
 * they can do there. The tour used to be the same five for everyone — a Viewer
 * was told to "define metrics with formulas" and shown alerts and AI pages
 * their menu does not have.
 */
export function tourSlides(has: (permission: string) => boolean): TourSlide[] {
  const slides: TourSlide[] = [
    { title: 'Welcome to KPI Nexus', body: 'Your workspace for measuring what matters. Let’s take a quick tour.' },
  ];
  if (has('KPI_VIEW')) {
    slides.push({
      title: 'KPIs',
      body: has('KPI_CREATE')
        ? 'Define metrics with formulas, targets, and thresholds. Record values and watch trends.'
        : has('KPI_DATA_ENTRY')
          ? 'Open a KPI to see its target and its trend. The KPIs you hold are under My KPIs: record your values there.'
          : 'Open a KPI to see its target, its values and its trend.',
    });
    // Named as the menu names them: there is no page called "Strategy map" to go and find.
    slides.push({ title: 'Scorecard and tree', body: 'Place KPIs on a balanced scorecard, and link them in a tree so one feeds another. Both are under KPIs.' });
  }
  if (has('ALERTS_VIEW')) {
    slides.push({ title: 'Alerts & digests', body: 'Get notified when KPIs breach thresholds — with escalation and a daily digest.' });
  }
  if (has('INSIGHTS_VIEW')) {
    slides.push({ title: 'AI insights', body: 'Ask questions in plain English, get auto-generated insights, anomalies, and forecasts.' });
  }
  return slides;
}

/** Whether to show the tour, from what the browser and the account say. */
export function shouldShowTour(legacyBrowserFlag: string | null, onboardingCompletedAt: string | null | undefined): boolean {
  if (legacyBrowserFlag) return false;
  return !onboardingCompletedAt;
}

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  // What this person may open, from the same answer that says whether they have seen the tour.
  const [permissions, setPermissions] = useState<string[]>([]);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    let legacy: string | null = null;
    try {
      legacy = window.localStorage.getItem(LEGACY_BROWSER_FLAG);
    } catch {
      /* storage blocked: the account decides */
    }
    if (legacy) return;
    meRequest()
      .then(({ user }) => {
        if (!active) return;
        setPermissions(user.permissions ?? []);
        if (shouldShowTour(legacy, user.onboardingCompletedAt)) setOpen(true);
      })
      .catch(() => undefined); // cannot tell: do not interrupt with a tour
    return () => {
      active = false;
    };
  }, []);

  const finish = useCallback(() => {
    setOpen(false);
    // Best effort: if this fails the tour simply offers itself again next time.
    completeTour().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    primaryRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish]);

  if (!open) return null;
  const SLIDES = tourSlides((key) => permissions.includes(key));
  const slide = SLIDES[Math.min(step, SLIDES.length - 1)]!;
  const last = step >= SLIDES.length - 1;

  return (
    <div
      data-testid="onboarding-tour"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-tour-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-1 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-xs text-content-muted">
            {step + 1} / {SLIDES.length}
          </span>
          <button
            type="button"
            data-testid="tour-skip"
            onClick={finish}
            className="text-xs text-content-muted hover:text-content-strong"
          >
            Skip
          </button>
        </div>
        <h2
          id="onboarding-tour-title"
          className="mt-3 text-lg font-semibold text-content-strong"
          data-testid="tour-title"
          aria-live="polite"
        >
          {slide.title}
        </h2>
        <p className="mt-2 text-sm text-content-muted">{slide.body}</p>
        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden>
            {SLIDES.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-accent-primary' : 'bg-surface-2'}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                data-testid="tour-back"
                onClick={() => setStep((s) => s - 1)}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-content-default hover:bg-surface-hover"
              >
                Back
              </button>
            )}
            <button
              ref={primaryRef}
              type="button"
              data-testid={last ? 'tour-done' : 'tour-next'}
              onClick={() => (last ? finish() : setStep((s) => s + 1))}
              className="rounded-md bg-accent-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              {last ? 'Get started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
