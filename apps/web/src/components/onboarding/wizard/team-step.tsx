'use client';

import { DRAFT_TEAM_MAX, type DraftProblem, type OnboardingDraftInput } from '@kpi-nexus/contracts';
import { useState } from 'react';

import { nameKey } from '../../../lib/wizard-structure';
import {
  type TeamRow,
  managerChoices,
  mergeTeam,
  parseTeamList,
  removeTeamMember,
  setTeamEmail,
  setTeamField,
} from '../../../lib/wizard-team';
import { fieldClass, labelClass } from './fields';
import { RowProblems, rowProblems } from './row-problems';

export interface TeamStepProps {
  draft: OnboardingDraftInput;
  problems: readonly DraftProblem[];
  /** The administrator's own email — the "Me" a person can report to. */
  adminEmail: string;
  onChange: (patch: Partial<OnboardingDraftInput>) => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What happened to a pasted list, in a sentence. */
export function importSummary(added: number, duplicates: number, skipped: number, dropped: number): string {
  const parts = [`Added ${plural(added, 'person', 'people')}.`];
  if (duplicates > 0) parts.push(`${duplicates} ${duplicates === 1 ? 'was' : 'were'} already on the list.`);
  if (skipped > 0) parts.push(`${plural(skipped, 'line', 'lines')} had no email and ${skipped === 1 ? 'was' : 'were'} skipped.`);
  if (dropped > 0) parts.push(`${dropped} more did not fit: setup invites up to ${DRAFT_TEAM_MAX} people, the rest from the People page afterwards.`);
  return parts.join(' ');
}

/**
 * Step 5: the people to invite when setup finishes. Each gets a normal
 * invitation email. Everything but the email and name is optional, and
 * everyone can be invited later from the People page instead.
 */
export function TeamStep({ draft, problems, adminEmail, onChange }: TeamStepProps) {
  const team = draft.team ?? [];
  const roles = (draft.roles ?? []).map((r) => r.name.trim()).filter(Boolean);
  const positions = (draft.positions ?? []).map((p) => p.name.trim()).filter(Boolean);
  const units = (draft.orgUnits ?? []).map((u) => u.name.trim()).filter(Boolean);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const full = team.length >= DRAFT_TEAM_MAX;

  const setPerson = (index: number, next: TeamRow) => onChange({ team: team.map((p, i) => (i === index ? next : p)) });
  const pick = (known: readonly string[], value: string | undefined) => known.find((k) => nameKey(k) === nameKey(value)) ?? '';

  const importPasted = () => {
    const parsed = parseTeamList(pasted, draft);
    const merged = mergeTeam(team, parsed.rows);
    const kept = merged.team.slice(0, DRAFT_TEAM_MAX);
    const dropped = merged.team.length - kept.length;
    onChange({ team: kept });
    setResult(importSummary(merged.added - dropped, merged.duplicates, parsed.skipped, dropped));
    setPasted('');
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <h2 className="text-sm font-semibold text-content-strong">
          People to invite <span className="font-normal text-content-muted">({team.length})</span>
        </h2>
        <p className="mt-1 text-xs text-content-muted">
          Each person is emailed a link to set a password when you finish. Optional — you can invite people later from the People page.
        </p>

        <ul className="mt-3 space-y-3">
          {team.map((person, index) => {
            const managers = managerChoices(team, index, adminEmail);
            const managerValue = managers.find((m) => nameKey(m.value) === nameKey(person.manager))?.value ?? '';
            return (
              <li key={index} data-testid={`team-row-${index}`} className="rounded-md border border-border-divider bg-surface-bg p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-end">
                  <div>
                    <label className={labelClass} htmlFor={`team-email-${index}`}>
                      Email
                    </label>
                    <input
                      id={`team-email-${index}`}
                      data-testid={`team-email-${index}`}
                      type="email"
                      value={person.email}
                      onChange={(e) => onChange({ team: setTeamEmail(team, index, e.target.value) })}
                      placeholder="name@company.com"
                      autoFocus={person.email === '' && index === team.length - 1}
                      aria-invalid={rowProblems(problems, 'team', index, 'email').length > 0 || undefined}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`team-name-${index}`}>
                      Full name
                    </label>
                    <input
                      id={`team-name-${index}`}
                      data-testid={`team-name-${index}`}
                      value={person.fullName}
                      onChange={(e) => setPerson(index, { ...person, fullName: e.target.value })}
                      aria-invalid={rowProblems(problems, 'team', index, 'fullName').length > 0 || undefined}
                      className={fieldClass}
                    />
                  </div>
                  <button
                    type="button"
                    data-testid={`team-remove-${index}`}
                    onClick={() => onChange({ team: removeTeamMember(team, index) })}
                    aria-label={`Remove ${person.fullName || person.email || 'this person'}`}
                    className="rounded px-2 py-2 text-xs font-medium text-status-critical hover:bg-status-critical/10"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <div>
                    <label className={labelClass} htmlFor={`team-role-${index}`}>
                      Role
                    </label>
                    <select
                      id={`team-role-${index}`}
                      data-testid={`team-role-${index}`}
                      value={pick(roles, person.role)}
                      onChange={(e) => setPerson(index, setTeamField(person, 'role', e.target.value))}
                      aria-invalid={rowProblems(problems, 'team', index, 'role').length > 0 || undefined}
                      className={fieldClass}
                    >
                      <option value="">No role yet</option>
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`team-position-${index}`}>
                      Position
                    </label>
                    <select
                      id={`team-position-${index}`}
                      data-testid={`team-position-${index}`}
                      value={pick(positions, person.position)}
                      onChange={(e) => setPerson(index, setTeamField(person, 'position', e.target.value))}
                      className={fieldClass}
                    >
                      <option value="">None</option>
                      {positions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`team-unit-${index}`}>
                      Unit
                    </label>
                    <select
                      id={`team-unit-${index}`}
                      data-testid={`team-unit-${index}`}
                      value={pick(units, person.unit)}
                      onChange={(e) => setPerson(index, setTeamField(person, 'unit', e.target.value))}
                      className={fieldClass}
                    >
                      <option value="">None</option>
                      {units.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`team-unit-role-${index}`}>
                      Role in unit
                    </label>
                    {/* A manager, lead or deputy sees the unit's KPIs and those below it (F-005). */}
                    <select
                      id={`team-unit-role-${index}`}
                      data-testid={`team-unit-role-${index}`}
                      value={person.unitRole ?? 'MEMBER'}
                      onChange={(e) => setPerson(index, setTeamField(person, 'unitRole', e.target.value === 'MEMBER' ? '' : e.target.value))}
                      disabled={!person.unit}
                      className={fieldClass}
                    >
                      <option value="MEMBER">Member</option>
                      <option value="LEAD">Lead</option>
                      <option value="MANAGER">Manager</option>
                      <option value="DEPUTY">Deputy</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor={`team-manager-${index}`}>
                      Reports to
                    </label>
                    <select
                      id={`team-manager-${index}`}
                      data-testid={`team-manager-${index}`}
                      value={managerValue}
                      onChange={(e) => setPerson(index, setTeamField(person, 'manager', e.target.value))}
                      aria-invalid={rowProblems(problems, 'team', index, 'manager').length > 0 || undefined}
                      className={fieldClass}
                    >
                      <option value="">Nobody</option>
                      {managers.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <RowProblems problems={problems} section="team" index={index} testId={`team-problem-${index}`} />
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="team-add"
            onClick={() => onChange({ team: [...team, { email: '', fullName: '' }] })}
            disabled={full}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-content-strong hover:border-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Add person
          </button>
          <button
            type="button"
            data-testid="team-paste-toggle"
            aria-expanded={pasting}
            onClick={() => setPasting((p) => !p)}
            disabled={full}
            className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-content-strong hover:bg-accent-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Paste a list
          </button>
          {full && <span className="text-xs text-content-muted">Setup invites up to {DRAFT_TEAM_MAX} people. Invite the rest from the People page afterwards.</span>}
        </div>

        {pasting && (
          <div className="mt-3">
            <label className={labelClass} htmlFor="team-paste-input">
              One person per line: email, name, role, position, unit, manager&apos;s email
            </label>
            <textarea
              id="team-paste-input"
              data-testid="team-paste-input"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={5}
              placeholder={'lena@company.com, Lena Lead, Manager\ndev@company.com, Dev Person, Member, , , lena@company.com'}
              className={`${fieldClass} font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-content-muted">
              Only the email is required. A copy from a spreadsheet works too, with or without a header row.
            </p>
            <button
              type="button"
              data-testid="team-paste-import"
              onClick={importPasted}
              disabled={pasted.trim() === ''}
              className="mt-2 rounded border border-border px-3 py-1.5 text-xs font-medium text-content-strong hover:border-accent-primary disabled:opacity-50"
            >
              Add these people
            </button>
          </div>
        )}
        {result && (
          <p role="status" data-testid="team-paste-result" className="mt-2 text-xs text-content-default">
            {result}
          </p>
        )}
      </section>
    </div>
  );
}
