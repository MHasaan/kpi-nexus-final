'use client';

import { useEffect, useState } from 'react';

/**
 * First-login product tour — a 5-slide modal shown once. Completion is
 * persisted to localStorage (`kpi-nexus.tour-completed`) so it never reappears.
 * Mounted on the dashboard; renders nothing once the flag is set.
 */
const TOUR_KEY = 'kpi-nexus.tour-completed';

const SLIDES = [
  { title: 'Welcome to KPI Nexus', body: 'Your workspace for measuring what matters. Let’s take a quick tour.' },
  { title: 'KPIs', body: 'Define metrics with formulas, targets, and thresholds. Record values and watch trends.' },
  { title: 'Strategy map', body: 'Organize KPIs on a balanced scorecard and cascade them across your org.' },
  { title: 'Alerts & digests', body: 'Get notified when KPIs breach thresholds — with escalation and a daily digest.' },
  { title: 'AI insights', body: 'Ask questions in plain English, get auto-generated insights, anomalies, and forecasts.' },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.localStorage.getItem(TOUR_KEY)) setOpen(true);
  }, []);

  const finish = () => {
    if (typeof window !== 'undefined') window.localStorage.setItem(TOUR_KEY, '1');
    setOpen(false);
  };

  if (!open) return null;
  const slide = SLIDES[step]!;
  const last = step === SLIDES.length - 1;

  return (
    <div data-testid="onboarding-tour" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface-1 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-xs text-content-muted">{step + 1} / {SLIDES.length}</span>
          <button type="button" data-testid="tour-skip" onClick={finish} className="text-xs text-content-muted hover:text-content-strong">Skip</button>
        </div>
        <h2 className="mt-3 text-lg font-semibold text-content-strong" data-testid="tour-title">{slide.title}</h2>
        <p className="mt-2 text-sm text-content-muted">{slide.body}</p>
        <div className="mt-6 flex items-center justify-between">
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === step ? 'bg-accent-primary' : 'bg-surface-2'}`} />
            ))}
          </div>
          <button
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
  );
}
