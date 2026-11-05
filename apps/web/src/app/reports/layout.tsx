import type { ReactNode } from 'react';

import { RequirePermission } from '../../components/auth/require-permission';

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <RequirePermission permission="REPORTS_VIEW">{children}</RequirePermission>;
}
