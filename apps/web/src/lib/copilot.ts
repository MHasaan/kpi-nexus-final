/**
 * Pure logic for the onboarding AI co-pilot rail. The assistant mode answers
 * with an RFC 6902 JSON Patch against the draft; the rail previews it per
 * draft section, the user accepts / rejects each section, and the accepted
 * sections are sent whole (the API replaces the draft per top-level key).
 */
import { ApiError } from './api-client';
import type { DraftPayload } from './onboarding-client';

export const DRAFT_SECTIONS = ['organization', 'roles', 'positions', 'orgUnitTypes', 'orgUnits', 'kpiCategories', 'kpis'] as const;
export type DraftSection = (typeof DRAFT_SECTIONS)[number];

export interface PatchOp {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: unknown;
}

export interface SectionGroup {
  section: DraftSection;
  ops: PatchOp[];
  summary: { add: number; replace: number; remove: number };
}

const SECTIONS = new Set<string>(DRAFT_SECTIONS);
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

function parsePointer(path: string): string[] {
  if (!path.startsWith('/')) throw new Error(`Invalid JSON pointer: ${path}`);
  const segments = path
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (!SECTIONS.has(segments[0] ?? '')) throw new Error(`Path outside the draft: ${path}`);
  if (segments.some((s) => FORBIDDEN.has(s))) throw new Error(`Forbidden path: ${path}`);
  return segments;
}

function arrayIndex(arr: unknown[], key: string, forAdd: boolean): number {
  if (forAdd && key === '-') return arr.length;
  if (!/^(0|[1-9]\d*)$/.test(key)) throw new Error(`Invalid array index: ${key}`);
  const i = Number(key);
  if (i > arr.length || (!forAdd && i === arr.length)) throw new Error(`Array index out of range: ${key}`);
  return i;
}

function applyOp(doc: Record<string, unknown>, op: PatchOp): void {
  if (op.op !== 'add' && op.op !== 'replace' && op.op !== 'remove') throw new Error(`Unsupported op: ${String(op.op)}`);
  const segments = parsePointer(op.path);
  // A draft only has the sections it was given (a quick start has no roles);
  // adding into a missing section creates it.
  const section = segments[0]!;
  if (op.op === 'add' && segments.length > 1 && !Object.hasOwn(doc, section)) {
    doc[section] = section === 'organization' ? {} : [];
  }
  const last = segments.pop()!;
  let parent: unknown = doc;
  for (const key of segments) {
    if (Array.isArray(parent)) parent = parent[arrayIndex(parent, key, false)];
    else if (parent && typeof parent === 'object' && Object.hasOwn(parent, key)) parent = (parent as Record<string, unknown>)[key];
    else throw new Error(`Path not found: ${op.path}`);
  }
  if (Array.isArray(parent)) {
    const i = arrayIndex(parent, last, op.op === 'add');
    if (op.op === 'add') parent.splice(i, 0, structuredClone(op.value));
    else if (op.op === 'replace') parent[i] = structuredClone(op.value);
    else parent.splice(i, 1);
    return;
  }
  if (!parent || typeof parent !== 'object') throw new Error(`Path not found: ${op.path}`);
  const obj = parent as Record<string, unknown>;
  if (op.op !== 'add' && !Object.hasOwn(obj, last)) throw new Error(`Path not found: ${op.path}`);
  if (op.op === 'remove') delete obj[last];
  else obj[last] = structuredClone(op.value);
}

/** Apply ops to a copy of the draft. Throws on any op it can't apply safely. */
export function applyJsonPatch(draft: DraftPayload, ops: PatchOp[]): DraftPayload {
  const doc = structuredClone(draft) as Record<string, unknown>;
  for (const op of ops) applyOp(doc, op);
  return doc as DraftPayload;
}

function asOp(raw: unknown): PatchOp | null {
  if (!raw || typeof raw !== 'object') return null;
  const { op, path, value } = raw as Record<string, unknown>;
  if ((op !== 'add' && op !== 'replace' && op !== 'remove') || typeof path !== 'string') return null;
  const section = path.split('/')[1];
  if (!section || !SECTIONS.has(section)) return null;
  return { op, path, value };
}

/** Split the assistant's patch by draft section (in first-seen order). */
export function groupPatchBySection(raw: unknown[]): { sections: SectionGroup[]; ignored: number } {
  const bySection = new Map<DraftSection, SectionGroup>();
  let ignored = 0;
  for (const item of raw) {
    const op = asOp(item);
    if (!op) {
      ignored += 1;
      continue;
    }
    const section = op.path.split('/')[1] as DraftSection;
    const group = bySection.get(section) ?? { section, ops: [], summary: { add: 0, replace: 0, remove: 0 } };
    group.ops.push(op);
    group.summary[op.op] += 1;
    bySection.set(section, group);
  }
  return { sections: [...bySection.values()], ignored };
}

/** The draft patch for the accepted sections: each changed section, whole. */
export function acceptedSectionsPatch(draft: DraftPayload, groups: SectionGroup[], accepted: Set<string>): Partial<DraftPayload> {
  const chosen = groups.filter((g) => accepted.has(g.section));
  if (chosen.length === 0) return {};
  const next = applyJsonPatch(draft, chosen.flatMap((g) => g.ops));
  const patch: Record<string, unknown> = {};
  for (const g of chosen) patch[g.section] = (next as Record<string, unknown>)[g.section];
  return patch as Partial<DraftPayload>;
}

/** Fields the Suggest mode offers. Chips fill the first three; KPI-shaped lists need more than a name. */
export const SUGGEST_FIELDS = [
  { path: 'organization.industry', label: 'Industry' },
  { path: 'organization.type', label: 'Organization type' },
  { path: 'kpiCategories', label: 'KPI categories' },
] as const;

/** Fields the Explain mode offers. */
export const EXPLAIN_FIELDS = [
  { path: 'organization.sizeTier', label: 'Size tier' },
  { path: 'roles', label: 'Roles & permissions' },
  { path: 'positions', label: 'Positions' },
  { path: 'orgUnitTypes', label: 'Org unit types' },
  { path: 'orgUnits', label: 'Org units' },
  { path: 'kpiCategories', label: 'KPI categories' },
  { path: 'kpis', label: 'KPIs (scope, direction, targets)' },
] as const;

/** The draft patch a clicked suggestion chip makes, or null if it can't be applied. */
export function suggestionPatch(draft: DraftPayload, field: string, value: string): Partial<DraftPayload> | null {
  if (field === 'organization.industry' || field === 'organization.type') {
    const key = field.split('.')[1] as 'industry' | 'type';
    return { organization: { ...(draft.organization ?? {}), [key]: value } };
  }
  if (field === 'kpiCategories') {
    const current = (draft.kpiCategories ?? []) as Array<{ name?: string }>;
    if (current.some((c) => c.name?.toLowerCase() === value.toLowerCase())) return null;
    return { kpiCategories: [...current, { name: value }] };
  }
  return null;
}

/** User-facing text for an AI call that failed. */
export function copilotErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      const retryAfter = (err.details as { retryAfter?: number } | undefined)?.retryAfter;
      const base = err.message.replace(/;?\s*try again later\.?$/i, '');
      return retryAfter ? `${base}; try again in about ${Math.ceil(retryAfter / 60)} min.` : `${base}. Try again later.`;
    }
    if (err.status === 503) return 'The AI co-pilot is unavailable right now. Try again later.';
    if (err.message) return err.message;
  }
  return 'Something went wrong. Try again.';
}
