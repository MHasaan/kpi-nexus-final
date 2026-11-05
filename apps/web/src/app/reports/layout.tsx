'use client';

import { useSelectedLayoutSegment } from 'next/navigation';
import type { ReactNode } from 'react';

import { RequirePermission } from '../../components/auth/require-permission';

export default function ReportsLayout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const permission = segment === 'new' ? 'ORG_SETTINGS' : 'REPORTS_VIEW';
  return <RequirePermission permission={permission}>{children}</RequirePermission>;
}
