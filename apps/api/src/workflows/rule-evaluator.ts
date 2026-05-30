/**
 * Pure rule evaluator for the generic workflow engine. A workflow's `rule` is a
 * JSON value-condition; `evaluateRule` decides whether a trigger event matches.
 * Fails closed (returns false) on malformed rules / unknown operators. A null
 * rule means "no condition" → always fires.
 */

export type RuleOperator = '>' | '<' | '>=' | '<=' | '==' | '!=';

export interface KpiValueRule {
  kind: 'kpi_value';
  kpiId: string;
  operator: string;
  value: number;
}
export interface KpiChangePctRule {
  kind: 'kpi_change_pct';
  kpiId: string;
  operator: string;
  value: number;
  windowDays?: number;
}
export interface AlertSeverityRule {
  kind: 'alert_severity';
  operator: string;
  severity: string;
}

export type WorkflowRule = KpiValueRule | KpiChangePctRule | AlertSeverityRule;

export interface KpiChangedEvent {
  kind: 'kpi_changed';
  kpiId: string;
  value: number;
  changePct?: number;
}
export interface AlertEvent {
  kind: 'alert';
  severity: string;
}

export type WorkflowEvent = KpiChangedEvent | AlertEvent;

const SEVERITY_ORDER: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

function compare(a: number, operator: string, b: number): boolean {
  switch (operator) {
    case '>':
      return a > b;
    case '<':
      return a < b;
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    default:
      return false;
  }
}

export function evaluateRule(rule: unknown, event: WorkflowEvent): boolean {
  if (rule === null || rule === undefined) return true;
  const r = rule as WorkflowRule;

  switch (r.kind) {
    case 'kpi_value':
      if (event.kind !== 'kpi_changed') return false;
      if (event.kpiId !== r.kpiId) return false;
      return compare(event.value, r.operator, r.value);

    case 'kpi_change_pct':
      if (event.kind !== 'kpi_changed') return false;
      if (event.kpiId !== r.kpiId) return false;
      if (typeof event.changePct !== 'number') return false;
      return compare(event.changePct, r.operator, r.value);

    case 'alert_severity': {
      if (event.kind !== 'alert') return false;
      const actual = SEVERITY_ORDER[event.severity];
      const threshold = SEVERITY_ORDER[r.severity];
      if (actual === undefined || threshold === undefined) return false;
      return compare(actual, r.operator, threshold);
    }

    default:
      return false;
  }
}
