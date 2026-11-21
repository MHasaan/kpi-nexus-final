'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Stands in for a settings page that is on hold (see `lib/settings-on-hold.ts`): a link or bookmark to it
 * leads back to Settings, where the page is not listed.
 */
export function SettingOnHold() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/settings');
  }, [router]);
  return null;
}
