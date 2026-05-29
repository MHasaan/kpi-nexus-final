'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken, listTeamKpis, type MyKpiRow } from '../../lib/api-client';

export default function TeamPage() {
  const router = useRouter();
  const [team, setTeam] = useState<Array<{ userId: string; fullName: string; kpis: MyKpiRow[] }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) { router.replace('/login'); return; }
    listTeamKpis().then(setTeam).catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, [router]);

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Team</span>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">Team KPIs</h1>
        <p className="mt-1 text-sm text-content-muted">Your direct reports and their personally-assigned KPIs.</p>
        {error && <p className="mt-4 text-sm text-status-critical">{error}</p>}
        <div className="mt-6 space-y-4" data-testid="team-list">
          {(team ?? []).map((member) => (
            <div key={member.userId} className="rounded-lg border border-border bg-surface-1 p-5">
              <Link href={`/users/${member.userId}`} className="font-medium text-content-strong hover:text-accent-primary">{member.fullName}</Link>
              <ul className="mt-2 space-y-1">
                {member.kpis.map((k) => (
                  <li key={k.assignmentId} className="flex items-center justify-between border-t border-border py-1.5 text-sm">
                    <span className="text-content-strong">{k.name}</span>
                    <span className="text-content-muted">{k.currentValue ?? '—'}{k.unit ? ` ${k.unit}` : ''}{k.targetValue !== null ? ` / ${k.targetValue}` : ''} {k.status && `· ${k.status}`}</span>
                  </li>
                ))}
                {member.kpis.length === 0 && <li className="py-1.5 text-content-muted">No KPIs assigned.</li>}
              </ul>
            </div>
          ))}
          {team && team.length === 0 && <p className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted" data-testid="team-empty">No direct reports.</p>}
        </div>
      </div>
    </main>
  );
}
