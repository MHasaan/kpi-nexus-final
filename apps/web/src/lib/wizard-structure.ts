import type { OnboardingDraftInput } from '@kpi-nexus/contracts';

type Draft = OnboardingDraftInput;
type Unit = NonNullable<Draft['orgUnits']>[number];

/** Rows of the draft refer to each other by name: no case, no outer spaces. */
export const nameKey = (value: string | undefined | null): string => (value ?? '').trim().toLowerCase();

export interface UnitRow {
  unit: Unit;
  /** Position in `draft.orgUnits` — what an edit addresses. */
  index: number;
  depth: number;
}

/**
 * Units in tree order: each directly under its parent, with its depth. A unit
 * whose parent does not exist (yet), or that sits in a loop, is shown at the
 * top level rather than hidden — it still needs fixing, and has to be visible
 * to be fixed.
 */
export function unitTreeRows(units: readonly Unit[]): UnitRow[] {
  const byParent = new Map<string, number[]>();
  const names = new Set(units.map((u) => nameKey(u.name)).filter(Boolean));
  units.forEach((unit, index) => {
    const parent = nameKey(unit.parent);
    const key = parent && names.has(parent) && parent !== nameKey(unit.name) ? parent : '';
    byParent.set(key, [...(byParent.get(key) ?? []), index]);
  });

  const rows: UnitRow[] = [];
  const placed = new Set<number>();
  const walk = (parentKey: string, depth: number) => {
    for (const index of byParent.get(parentKey) ?? []) {
      if (placed.has(index)) continue;
      placed.add(index);
      rows.push({ unit: units[index]!, index, depth });
      const key = nameKey(units[index]!.name);
      if (key) walk(key, depth + 1);
    }
  };
  walk('', 0);
  // Anything left is in a loop: list it flat.
  units.forEach((unit, index) => {
    if (!placed.has(index)) rows.push({ unit, index, depth: 0 });
  });
  return rows;
}

/** The units that can be this unit's parent: named, not itself, not anything below it. */
export function parentChoices(units: readonly Unit[], index: number): string[] {
  const self = nameKey(units[index]?.name);
  const below = new Set<string>();
  if (self) {
    let grew = true;
    below.add(self);
    while (grew) {
      grew = false;
      for (const unit of units) {
        const key = nameKey(unit.name);
        if (key && !below.has(key) && below.has(nameKey(unit.parent))) {
          below.add(key);
          grew = true;
        }
      }
    }
  }
  const seen = new Set<string>();
  const choices: string[] = [];
  units.forEach((unit, i) => {
    const key = nameKey(unit.name);
    if (i === index || !key || below.has(key) || seen.has(key)) return;
    seen.add(key);
    choices.push(unit.name.trim());
  });
  return choices;
}

const replaceName = (value: string | undefined, from: string, to: string): string | undefined =>
  value !== undefined && nameKey(value) === from ? to : value;

/**
 * Rename a unit and everything that points at it — the units under it, the
 * KPIs it holds, the people in it — so a rename is one edit, not a hunt.
 */
export function renameUnit(draft: Draft, index: number, name: string): Partial<Draft> {
  const units = draft.orgUnits ?? [];
  const from = nameKey(units[index]?.name);
  const orgUnits = units.map((u, i) => (i === index ? { ...u, name } : from ? { ...u, parent: replaceName(u.parent, from, name) } : u));
  if (!from) return { orgUnits };
  // Only patch the other sections when they really pointed at this unit.
  const patch: Partial<Draft> = { orgUnits };
  if (draft.kpis?.some((k) => k.units?.some((u) => nameKey(u) === from))) {
    patch.kpis = draft.kpis.map((k) => (k.units ? { ...k, units: k.units.map((u) => (nameKey(u) === from ? name : u)) } : k));
  }
  if (draft.team?.some((p) => nameKey(p.unit) === from)) {
    patch.team = draft.team.map((p) => ({ ...p, unit: replaceName(p.unit, from, name) }));
  }
  return patch;
}

/**
 * Remove a unit. The units under it move up to its parent (they are not
 * deleted with it); KPIs stop being held by it; people in it are left in no
 * unit.
 */
export function removeUnit(draft: Draft, index: number): Partial<Draft> {
  const units = draft.orgUnits ?? [];
  const gone = units[index];
  if (!gone) return {};
  const from = nameKey(gone.name);
  const orgUnits = units
    .filter((_, i) => i !== index)
    .map((u) => {
      if (!from || nameKey(u.parent) !== from) return u;
      const { parent: _dropped, ...rest } = u;
      return gone.parent?.trim() ? { ...rest, parent: gone.parent } : rest;
    });
  const patch: Partial<Draft> = { orgUnits };
  if (from && draft.kpis?.some((k) => k.units?.some((u) => nameKey(u) === from))) {
    patch.kpis = draft.kpis.map((k) => (k.units ? { ...k, units: k.units.filter((u) => nameKey(u) !== from) } : k));
  }
  if (from && draft.team?.some((p) => nameKey(p.unit) === from)) {
    patch.team = draft.team.map((p) => {
      if (nameKey(p.unit) !== from) return p;
      const { unit: _dropped, ...rest } = p;
      return rest;
    });
  }
  return patch;
}

/** Rename a unit type and the units of that type. */
export function renameUnitType(draft: Draft, index: number, name: string): Partial<Draft> {
  const types = draft.orgUnitTypes ?? [];
  const from = nameKey(types[index]?.name);
  const patch: Partial<Draft> = { orgUnitTypes: types.map((t, i) => (i === index ? { ...t, name } : t)) };
  if (from && draft.orgUnits?.some((u) => nameKey(u.type) === from)) {
    patch.orgUnits = draft.orgUnits.map((u) => (nameKey(u.type) === from ? { ...u, type: name } : u));
  }
  return patch;
}

/** How many units are of this type — a type in use cannot be removed. */
export function unitTypeUsage(draft: Draft, typeName: string): number {
  const key = nameKey(typeName);
  return key ? (draft.orgUnits ?? []).filter((u) => nameKey(u.type) === key).length : 0;
}
