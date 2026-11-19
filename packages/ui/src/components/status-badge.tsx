import { CircleCheck, TriangleAlert, OctagonX, CircleDashed, type LucideIcon } from 'lucide-react';
import { cn } from '../cn.js';
import { Badge, type BadgeTone } from './badge.js';

export type KpiStatus = 'on-track' | 'at-risk' | 'off-track' | 'no-data';

interface StatusMeta {
  tone: BadgeTone;
  label: string;
  Icon: LucideIcon;
}

const map: Record<KpiStatus, StatusMeta> = {
  'on-track': { tone: 'success', label: 'On track', Icon: CircleCheck },
  'at-risk': { tone: 'warning', label: 'At risk', Icon: TriangleAlert },
  'off-track': { tone: 'error', label: 'Off track', Icon: OctagonX },
  'no-data': { tone: 'neutral', label: 'No data', Icon: CircleDashed },
};

export interface StatusBadgeProps {
  status: KpiStatus;
  /** Words to show instead of the status's own — "No target" for a KPI that has values but nothing to judge them by. */
  label?: string;
  className?: string;
}

/** Status indicator — always pairs an icon with a text label (never colour-only). */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const s = map[status] ?? map['no-data'];
  const { Icon } = s;
  return (
    <Badge tone={s.tone} className={cn('gap-1', className)}>
      <Icon aria-hidden className="h-3 w-3" />
      {label ?? s.label}
    </Badge>
  );
}
