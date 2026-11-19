'use client';

import { useSelectedLayoutSegments } from 'next/navigation';
import type { ReactNode } from 'react';

import { RequirePermission } from '../../components/auth/require-permission';

export default function ReportsLayout({ children }: { children: ReactNode }) {
  const segments = useSelectedLayoutSegments();
  // Creating or changing a report is REPORTS_MANAGE on the API; reading them is REPORTS_VIEW.
  const permission = segments[0] === 'new' || segments[1] === 'edit' ? 'REPORTS_MANAGE' : 'REPORTS_VIEW';
  return <RequirePermission permission={permission}>{children}</RequirePermission>;
}
