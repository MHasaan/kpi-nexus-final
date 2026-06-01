'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getAccessToken } from '../lib/api-client';

const ctaBase =
  'inline-flex h-12 items-center justify-center rounded-lg px-6 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-bg';

export default function HomePage() {
  const router = useRouter();
  // Avoid flashing the landing for already-authenticated users.
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (getAccessToken()) {
      router.replace('/dashboard');
      return;
    }
    setChecking(false);
  }, [router]);

  if (checking) return null;

  return (
    <main className="relative flex min-h-screen flex-col bg-surface-bg text-content-default">
      {/* Top bar */}
      <header className="flex h-16 items-center justify-between px-6 sm:px-10">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand shadow-sm"
          />
          <span className="bg-gradient-brand bg-clip-text text-lg font-bold tracking-tight text-transparent">
            KPI Nexus
          </span>
        </span>
        <Link
          href="/login"
          className="text-sm font-medium text-content-muted transition-colors hover:text-content-strong"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="flex flex-1 items-center justify-center px-6 py-16 sm:px-10">
        <div className="flex max-w-2xl flex-col items-center text-center">
          <span className="mb-6 inline-flex items-center rounded-full bg-accent-bg px-3 py-1 text-xs font-medium text-accent-primary">
            Multi-tenant KPI intelligence
          </span>

          <h1 className="text-4xl font-bold tracking-tight text-content-strong sm:text-6xl">
            <span className="bg-gradient-brand bg-clip-text text-transparent">
              Measure what matters.
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-lg text-content-muted">
            Define KPIs, cascade targets across teams, and surface AI-driven insights — all in one
            real-time workspace built for your whole organization.
          </p>

          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              data-testid="home-guided-setup"
              className={`${ctaBase} bg-accent-primary text-white shadow-sm hover:brightness-110`}
            >
              Create organization
            </Link>
            <Link
              href="/login"
              className={`${ctaBase} border border-border-strong bg-surface-bg text-content-strong hover:bg-surface-hover`}
            >
              Sign in
            </Link>
          </div>

          <p className="mt-6 text-sm text-content-muted">
            No credit card required. Set up your first dashboard in minutes.
          </p>
        </div>
      </section>

      <footer className="px-6 py-6 text-center text-xs text-content-muted sm:px-10">
        © {new Date().getFullYear()} KPI Nexus. All rights reserved.
      </footer>
    </main>
  );
}
