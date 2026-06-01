import { CircleCheck, TriangleAlert, OctagonX, CircleDashed, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge, type BadgeTone } from './badge';

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
  className?: string;
}

/** Status indicator — always pairs an icon with a text label (never colour-only). */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const s = map[status] ?? map['no-data'];
  const { Icon } = s;
  return (
    <Badge tone={s.tone} className={cn('gap-1', className)}>
      <Icon aria-hidden className="h-3 w-3" />
      {s.label}
    </Badge>
  );
}
