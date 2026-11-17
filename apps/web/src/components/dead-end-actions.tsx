'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { logoutRequest } from '../lib/api-client';
import { firstPageFor } from '../lib/first-page';
import { usePageAccess } from '../lib/use-page-access';
import { usePermissions } from '../lib/use-permissions';

const PRIMARY =
  'rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary';
const SECONDARY = 'rounded-md border border-border px-4 py-2 text-sm font-medium text-content-default hover:bg-surface-hover disabled:opacity-60';

/**
 * The ways out of a dead end ("no access", "not found", an error): the first
 * page this person may actually open, and Sign out — for when they are in the
 * wrong account. Signed out, it offers Sign in instead.
 *
 * These pages used to offer only "Back to Dashboard"; for someone the
 * dashboard is closed to, that led straight back to "no access".
 */
export function DeadEndActions() {
  const router = useRouter();
  const { ready, authenticated, permissions } = usePermissions();
  const { pageAccess, ready: accessReady } = usePageAccess();
  const [leaving, setLeaving] = useState(false);

  if (!ready || !accessReady) return <div className="h-9" aria-hidden />;
  if (!authenticated) {
    return (
      <Link href="/login" className={PRIMARY} data-testid="dead-end-sign-in">
        Sign in
      </Link>
    );
  }

  const first = firstPageFor(permissions, pageAccess);
  const signOut = async () => {
    setLeaving(true);
    try {
      await logoutRequest();
    } finally {
      router.push('/login');
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <Link href={first.href} className={PRIMARY} data-testid="dead-end-go">
        Go to {first.label}
      </Link>
      <button type="button" onClick={() => void signOut()} disabled={leaving} className={SECONDARY} data-testid="dead-end-sign-out">
        {leaving ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}
