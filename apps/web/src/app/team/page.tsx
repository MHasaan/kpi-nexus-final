'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UsersRound } from 'lucide-react';

import { AppShell } from '../../components/app-shell';
import {
  Avatar,
  Card,
  EmptyState,
  PageHeader,
  ScopeBadge,
  Skeleton,
  StatusBadge,
  type KpiStatus,
} from '../../components/ui';
import { ApiError, getAccessToken, listTeamKpis, type MyKpiRow } from '../../lib/api-client';

function toStatus(raw: string | null | undefined): KpiStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'exceeded':
    case 'on_track':
    case 'on-track':
      return 'on-track';
    case 'at_risk':
    case 'at-risk':
      return 'at-risk';
    case 'behind':
    case 'off_track':
    case 'off-track':
      return 'off-track';
    default:
      return 'no-data';
  }
}

export default function TeamPage() {
  const router = useRouter();
  const [team, setTeam] = useState<
    Array<{ userId: string; fullName: string; kpis: MyKpiRow[] }> | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    listTeamKpis()
      .then(setTeam)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [router]);

  return (
    <AppShell title="My team" crumbs={['People', 'Team']}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="My team"
          subtitle="Your direct reports and their personally-assigned KPIs, side by side."
        />

        {error && (
          <div
            role="alert"
            data-testid="team-error"
            className="rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {error}
          </div>
        )}

        {team === null && !error ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <Skeleton className="m-4 h-32" />
              </Card>
            ))}
          </div>
        ) : team && team.length === 0 ? (
          <Card data-testid="team-empty">
            <EmptyState
              icon={UsersRound}
              title="No direct reports"
              description="When people report to you, their personal KPIs appear here."
            />
            <span data-testid="team-list" className="sr-only" />
          </Card>
        ) : team ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="team-list">
            {team.map((member) => (
              <Card key={member.userId} className="flex flex-col gap-3 p-4">
                <Link
                  href={`/users/${member.userId}`}
                  className="flex items-center gap-2.5 hover:text-accent-primary"
                >
                  <Avatar name={member.fullName} size="sm" />
                  <span className="font-semibold text-content-strong">
                    {member.fullName}
                  </span>
                </Link>
                <ul className="flex flex-col">
                  {member.kpis.map((k, i) => (
                    <li
                      key={k.assignmentId}
                      className={
                        'flex items-center gap-2 py-2 text-sm' +
                        (i ? ' border-t border-border-divider' : '')
                      }
                    >
                      <ScopeBadge scope="PER_USER" className="text-[10px]" />
                      <span className="flex-1 truncate text-content-strong">{k.name}</span>
                      <span className="tabular-nums text-content-muted">
                        {k.currentValue ?? '—'}
                        {k.unit ? ` ${k.unit}` : ''}
                        {k.targetValue !== null ? ` / ${k.targetValue}` : ''}
                      </span>
                      <StatusBadge status={toStatus(k.status)} />
                    </li>
                  ))}
                  {member.kpis.length === 0 && (
                    <li className="py-2 text-sm text-content-muted">No KPIs assigned.</li>
                  )}
                </ul>
              </Card>
            ))}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
