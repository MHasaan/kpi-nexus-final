import type { ReactNode } from 'react';

import { RequirePermission } from '../../components/auth/require-permission';

export default function OrgUnitsLayout({ children }: { children: ReactNode }) {
  return <RequirePermission permission="GROUPS_VIEW">{children}</RequirePermission>;
}
