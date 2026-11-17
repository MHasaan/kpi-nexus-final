'use client';

import { useSelectedLayoutSegment } from 'next/navigation';
import type { ReactNode } from 'react';

import { RequirePermission } from '../../components/auth/require-permission';

export default function ReportsLayout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  // Creating a report is REPORTS_MANAGE on the API; reading them is REPORTS_VIEW.
  const permission = segment === 'new' ? 'REPORTS_MANAGE' : 'REPORTS_VIEW';
  return <RequirePermission permission={permission}>{children}</RequirePermission>;
}
