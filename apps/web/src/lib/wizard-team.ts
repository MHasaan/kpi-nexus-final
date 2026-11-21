import type { OnboardingDraftInput } from '@kpi-nexus/contracts';

import { nameKey } from './wizard-structure';

type Draft = OnboardingDraftInput;
export type TeamRow = NonNullable<Draft['team']>[number];

const COLUMNS = ['email', 'fullName', 'role', 'position', 'unit', 'manager'] as const;
type Column = (typeof COLUMNS)[number];

/** What a header cell means, however it was written ("Full name", "E-mail", "Reports to"). */
const HEADER_WORDS: Record<string, Column> = {
  email: 'email',
  'e-mail': 'email',
  mail: 'email',
  name: 'fullName',
  fullname: 'fullName',
  'full name': 'fullName',
  role: 'role',
  position: 'position',
  title: 'position',
  'job title': 'position',
  unit: 'unit',
  team: 'unit',
  department: 'unit',
  manager: 'manager',
  'reports to': 'manager',
  'manager email': 'manager',
};

function cells(line: string): string[] {
  // A pasted spreadsheet is tab-separated; a typed list uses commas or semicolons.
  const separator = line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ',';
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      // A doubled quote inside a quoted cell is one quote.
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') quoted = true;
    else if (ch === separator) {
      out.push(cell.trim());
      cell = '';
    } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

/** The name as the draft spells it, when it has one that matches; otherwise as typed (and it will be flagged). */
function canonical(value: string | undefined, known: readonly string[]): string | undefined {
  if (!value) return undefined;
  return known.find((k) => nameKey(k) === nameKey(value)) ?? value;
}

export interface TeamImport {
  rows: TeamRow[];
  /** Lines that had nothing to import (blank, or no email in them). */
  skipped: number;
}

/**
 * People from pasted text: one per line, as `email, name, role, position,
 * unit, manager` (only the email is required), or with a header row naming the
 * columns in any order. A line that starts with a name and has the email
 * second is read that way round.
 */
export function parseTeamList(text: string, draft: Draft): TeamImport {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const roles = (draft.roles ?? []).map((r) => r.name.trim()).filter(Boolean);
  const positions = (draft.positions ?? []).map((p) => p.name.trim()).filter(Boolean);
  const units = (draft.orgUnits ?? []).map((u) => u.name.trim()).filter(Boolean);

  let order: readonly (Column | null)[] = COLUMNS;
  const first = lines.find(Boolean);
  const headerCells = first ? cells(first).map((c) => HEADER_WORDS[c.toLowerCase()] ?? null) : [];
  const hasHeader = headerCells.includes('email') && !first!.includes('@');
  if (hasHeader) order = headerCells;

  const rows: TeamRow[] = [];
  let skipped = 0;
  let headerSeen = !hasHeader;
  for (const line of lines) {
    if (!line) continue;
    if (!headerSeen) {
      headerSeen = true;
      continue;
    }
    const values = cells(line);
    const picked: Partial<Record<Column, string>> = {};
    order.forEach((column, i) => {
      if (column && values[i]) picked[column] = values[i];
    });
    // "Lena Lead, lena@acme.test": name first, email second.
    if (!hasHeader && picked.email && !picked.email.includes('@') && picked.fullName?.includes('@')) {
      [picked.email, picked.fullName] = [picked.fullName, picked.email];
    }
    if (!picked.email || !picked.email.includes('@')) {
      skipped += 1;
      continue;
    }
    const row: TeamRow = { email: picked.email.toLowerCase(), fullName: picked.fullName ?? '' };
    const role = canonical(picked.role, roles);
    const position = canonical(picked.position, positions);
    const unit = canonical(picked.unit, units);
    if (role) row.role = role;
    if (position) row.position = position;
    if (unit) row.unit = unit;
    if (picked.manager) row.manager = picked.manager.toLowerCase();
    rows.push(row);
  }
  return { rows, skipped };
}

/** Add imported people to the list, leaving out anyone already on it (by email). */
export function mergeTeam(existing: readonly TeamRow[], incoming: readonly TeamRow[]): { team: TeamRow[]; added: number; duplicates: number } {
  const seen = new Set(existing.map((p) => nameKey(p.email)).filter(Boolean));
  const team = [...existing];
  let added = 0;
  for (const person of incoming) {
    const key = nameKey(person.email);
    if (seen.has(key)) continue;
    seen.add(key);
    team.push(person);
    added += 1;
  }
  return { team, added, duplicates: incoming.length - added };
}

/** Change one person's email, and on everyone who reports to them. */
export function setTeamEmail(team: readonly TeamRow[], index: number, email: string): TeamRow[] {
  const from = nameKey(team[index]?.email);
  return team.map((person, i) => {
    if (i === index) return { ...person, email };
    return from && nameKey(person.manager) === from ? { ...person, manager: email } : person;
  });
}

/** Remove one person; anyone who reported to them now reports to nobody. */
export function removeTeamMember(team: readonly TeamRow[], index: number): TeamRow[] {
  const gone = nameKey(team[index]?.email);
  return team
    .filter((_, i) => i !== index)
    .map((person) => {
      if (!gone || nameKey(person.manager) !== gone) return person;
      const { manager: _dropped, ...rest } = person;
      return rest;
    });
}

/** When the administrator's own email changes, the people who report to them follow it. */
export function retargetManager(team: readonly TeamRow[], fromEmail: string, toEmail: string): TeamRow[] | null {
  const from = nameKey(fromEmail);
  if (!from || !team.some((p) => nameKey(p.manager) === from)) return null;
  return team.map((p) => (nameKey(p.manager) === from ? { ...p, manager: toEmail } : p));
}

export interface ManagerChoice {
  value: string;
  label: string;
}

/** Who this person can report to: the administrator, or anyone else on the list with an email. */
export function managerChoices(team: readonly TeamRow[], index: number, adminEmail: string): ManagerChoice[] {
  const choices: ManagerChoice[] = [];
  const admin = adminEmail.trim();
  if (admin) choices.push({ value: admin, label: `Me (${admin})` });
  const seen = new Set([nameKey(admin)]);
  team.forEach((person, i) => {
    const key = nameKey(person.email);
    if (i === index || !key || seen.has(key)) return;
    seen.add(key);
    choices.push({ value: person.email.trim(), label: person.fullName.trim() ? `${person.fullName.trim()} (${person.email.trim()})` : person.email.trim() });
  });
  return choices;
}

/** Set or clear one optional field on a person without leaving an `undefined` behind. */
export function setTeamField(person: TeamRow, field: 'role' | 'position' | 'unit' | 'unitRole' | 'manager', value: string): TeamRow {
  if (value) return { ...person, [field]: value };
  const { [field]: _dropped, ...rest } = person;
  return rest;
}
