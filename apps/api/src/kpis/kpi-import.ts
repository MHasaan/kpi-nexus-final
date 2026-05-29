import Papa from 'papaparse';

import {
  KpiAggregationEnum,
  KpiDirectionEnum,
  KpiFrequencyEnum,
  KpiScopeEnum,
  KpiStatusEnum,
  KpiTypeEnum,
  type CreateKpiDto,
} from './dto/create-kpi.dto.js';

export interface ImportRowError {
  /** 1-based data-row number (header excluded). */
  row: number;
  column?: string;
  message: string;
}

/** A validated row ready to feed KpisService.create(). */
export type ImportKpiInput = Pick<
  CreateKpiDto,
  | 'name'
  | 'description'
  | 'unit'
  | 'scope'
  | 'type'
  | 'direction'
  | 'frequency'
  | 'aggregationMethod'
  | 'status'
  | 'targetValue'
  | 'warningThreshold'
  | 'criticalThreshold'
  | 'tags'
>;

export interface DryRunResult {
  totalRows: number;
  valid: ImportKpiInput[];
  errors: ImportRowError[];
}

// Case-insensitive header → field aliases.
const COLUMN_ALIASES: Record<keyof ImportKpiInput | 'category', string[]> = {
  name: ['name', 'kpi name', 'kpi', 'title'],
  description: ['description', 'desc'],
  unit: ['unit', 'units'],
  scope: ['scope'],
  type: ['type', 'kpi type'],
  direction: ['direction'],
  frequency: ['frequency', 'cadence'],
  aggregationMethod: ['aggregation', 'aggregation method', 'aggregationmethod', 'agg'],
  status: ['status'],
  targetValue: ['target', 'target value', 'targetvalue'],
  warningThreshold: ['warning', 'warning threshold', 'warningthreshold'],
  criticalThreshold: ['critical', 'critical threshold', 'criticalthreshold'],
  tags: ['tags'],
  // `category`/`quadrant` columns are accepted (not an error) but not yet mapped
  // to a categoryId here — category assignment via CSV is a follow-up.
  category: ['category', 'quadrant'],
};

function buildColumnMap(headers: string[]): Partial<Record<keyof ImportKpiInput | 'category', number>> {
  const map: Partial<Record<keyof ImportKpiInput | 'category', number>> = {};
  headers.forEach((h, i) => {
    const norm = h.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.includes(norm)) {
        map[field as keyof typeof map] = i;
      }
    }
  });
  return map;
}

function coerceEnum<T extends string>(
  raw: string | undefined,
  schema: { options: readonly T[] },
  fallback: T,
): { value: T; error?: string } {
  if (raw === undefined || raw.trim() === '') return { value: fallback };
  const up = raw.trim().toUpperCase().replace(/\s+/g, '_');
  if ((schema.options as readonly string[]).includes(up)) return { value: up as T };
  return { value: fallback, error: `invalid value "${raw.trim()}" (allowed: ${schema.options.join(', ')})` };
}

function coerceNumber(raw: string | undefined): { value?: number; error?: string } {
  if (raw === undefined || raw.trim() === '') return {};
  const n = Number(raw.trim().replace(/[$,%\s]/g, ''));
  if (!Number.isFinite(n)) return { error: `"${raw.trim()}" is not a number` };
  return { value: n };
}

/**
 * Parse + validate a KPI import CSV. Pure: existing-org duplicate detection is
 * driven by the `existingNames` set the caller supplies (the service fetches
 * it from the DB; tests pass it directly).
 */
export function validateKpiCsv(csvText: string, existingNames: Set<string> = new Set()): DryRunResult {
  const parsed = Papa.parse<string[]>(csvText.trim(), { skipEmptyLines: true });
  const rows = parsed.data;
  const errors: ImportRowError[] = [];
  const valid: ImportKpiInput[] = [];

  if (rows.length === 0) {
    return { totalRows: 0, valid, errors: [{ row: 0, message: 'CSV is empty' }] };
  }

  const headers = rows[0]!;
  const col = buildColumnMap(headers);
  if (col.name === undefined) {
    return {
      totalRows: 0,
      valid,
      errors: [{ row: 0, message: 'Missing required "name" column (aliases: name, kpi name, kpi, title)' }],
    };
  }

  const existingLower = new Set([...existingNames].map((n) => n.toLowerCase()));
  const seenInCsv = new Set<string>();
  const dataRows = rows.slice(1);

  dataRows.forEach((cells, idx) => {
    const rowNum = idx + 1;
    const get = (field: keyof ImportKpiInput | 'category'): string | undefined => {
      const i = col[field];
      return i === undefined ? undefined : cells[i];
    };

    const name = (get('name') ?? '').trim();
    if (name.length < 2) {
      errors.push({ row: rowNum, column: 'name', message: 'name is required (min 2 chars)' });
      return;
    }

    const nameLower = name.toLowerCase();
    if (seenInCsv.has(nameLower)) {
      errors.push({ row: rowNum, column: 'name', message: `duplicate name "${name}" within the CSV` });
      return;
    }
    if (existingLower.has(nameLower)) {
      errors.push({ row: rowNum, column: 'name', message: `a KPI named "${name}" already exists` });
      return;
    }

    const rowErrors: ImportRowError[] = [];
    const scope = coerceEnum(get('scope'), KpiScopeEnum, 'ORG_WIDE');
    const type = coerceEnum(get('type'), KpiTypeEnum, 'NUMBER');
    const direction = coerceEnum(get('direction'), KpiDirectionEnum, 'HIGHER_IS_BETTER');
    const frequency = coerceEnum(get('frequency'), KpiFrequencyEnum, 'MONTHLY');
    const aggregationMethod = coerceEnum(get('aggregationMethod'), KpiAggregationEnum, 'LAST');
    const status = coerceEnum(get('status'), KpiStatusEnum, 'DRAFT');
    for (const [field, r] of Object.entries({ scope, type, direction, frequency, aggregationMethod, status })) {
      if (r.error) rowErrors.push({ row: rowNum, column: field, message: r.error });
    }
    // CSV import only creates ORG_WIDE KPIs — PER_UNIT/PER_USER need org-unit /
    // user assignments the CSV can't express; add those after import.
    if (!scope.error && scope.value !== 'ORG_WIDE') {
      rowErrors.push({
        row: rowNum,
        column: 'scope',
        message: 'CSV import supports ORG_WIDE only; assign PER_UNIT/PER_USER KPIs after import',
      });
    }

    const target = coerceNumber(get('targetValue'));
    const warning = coerceNumber(get('warningThreshold'));
    const critical = coerceNumber(get('criticalThreshold'));
    for (const [field, r] of Object.entries({ targetValue: target, warningThreshold: warning, criticalThreshold: critical })) {
      if (r.error) rowErrors.push({ row: rowNum, column: field, message: r.error });
    }

    // Threshold ordering must agree with direction (only when both present).
    if (warning.value !== undefined && critical.value !== undefined) {
      if (direction.value === 'HIGHER_IS_BETTER' && critical.value > warning.value) {
        rowErrors.push({ row: rowNum, column: 'criticalThreshold', message: 'for HIGHER_IS_BETTER, critical must be ≤ warning' });
      }
      if (direction.value === 'LOWER_IS_BETTER' && warning.value > critical.value) {
        rowErrors.push({ row: rowNum, column: 'warningThreshold', message: 'for LOWER_IS_BETTER, warning must be ≤ critical' });
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

    seenInCsv.add(nameLower);
    const description = (get('description') ?? '').trim();
    const unit = (get('unit') ?? '').trim();
    const tagsRaw = (get('tags') ?? '').trim();
    valid.push({
      name,
      ...(description ? { description } : {}),
      ...(unit ? { unit } : {}),
      scope: scope.value,
      type: type.value,
      direction: direction.value,
      frequency: frequency.value,
      aggregationMethod: aggregationMethod.value,
      status: status.value,
      ...(target.value !== undefined ? { targetValue: target.value } : {}),
      ...(warning.value !== undefined ? { warningThreshold: warning.value } : {}),
      ...(critical.value !== undefined ? { criticalThreshold: critical.value } : {}),
      tags: tagsRaw ? tagsRaw.split(/[;|]/).map((t) => t.trim()).filter(Boolean) : [],
    });
  });

  return { totalRows: dataRows.length, valid, errors };
}
