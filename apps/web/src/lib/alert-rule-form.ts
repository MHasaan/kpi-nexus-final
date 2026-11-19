import type { AlertRuleType, AlertSeverity, EscalationLevelInput } from './api-client';

/**
 * The "new alert rule" form as plain data and pure functions: what is typed,
 * what is wrong with it, what it means in a sentence, and the request it makes.
 */

export type Operator = '>' | '<' | '>=' | '<=' | '==';
export type TimeUnit = 'minutes' | 'hours' | 'days';
export type FormRuleType = Exclude<AlertRuleType, 'COMPOSITE'>;

export interface AlertRuleForm {
  name: string;
  description: string;
  kpiId: string;
  ruleType: FormRuleType;
  severity: AlertSeverity;
  // Static threshold
  operator: Operator;
  threshold: string;
  // Unusual value
  sigmas: string;
  windowSize: string;
  // Rate of change
  direction: 'rise' | 'fall';
  percent: string;
  windowValue: string;
  windowUnit: TimeUnit;
  // No data
  staleValue: string;
  staleUnit: TimeUnit;
  // Do not repeat within… (blank: every time)
  cooldownValue: string;
  cooldownUnit: TimeUnit;
  levels: EscalationLevelInput[];
}

export const EMPTY_ALERT_RULE_FORM: AlertRuleForm = {
  name: '',
  description: '',
  kpiId: '',
  ruleType: 'STATIC_THRESHOLD',
  severity: 'MEDIUM',
  operator: '>',
  threshold: '',
  sigmas: '3',
  windowSize: '12',
  direction: 'fall',
  percent: '20',
  windowValue: '1',
  windowUnit: 'days',
  staleValue: '1',
  staleUnit: 'days',
  cooldownValue: '',
  cooldownUnit: 'hours',
  levels: [],
};

export const RULE_TYPES: ReadonlyArray<{ value: FormRuleType; label: string; about: string }> = [
  { value: 'STATIC_THRESHOLD', label: 'Crosses a fixed value', about: 'Checked each time a value is recorded.' },
  {
    value: 'DYNAMIC_STDDEV',
    label: 'Unusual for this KPI',
    about: 'Compares each new value with the ones before it. It needs at least two earlier values that are not all the same.',
  },
  {
    value: 'RATE_OF_CHANGE',
    label: 'Rises or falls quickly',
    about: 'Compares each new value with the last one recorded before the period began. Nothing recorded that long ago means no alert.',
  },
  { value: 'NO_DATA', label: 'No value recorded', about: 'Checked every five minutes.' },
];

export const OPERATOR_WORDS: Record<Operator, string> = {
  '>': 'is above',
  '<': 'is below',
  '>=': 'is at or above',
  '<=': 'is at or below',
  '==': 'is exactly',
};

const UNIT_MINUTES: Record<TimeUnit, number> = { minutes: 1, hours: 60, days: 1440 };
const WEEK_MINUTES = 10080;
const YEAR_MINUTES = 525600;

function number(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** A whole number of minutes from "3" + "hours", or null when it is not one. */
export function toMinutes(value: string, unit: TimeUnit): number | null {
  const n = number(value);
  if (n === null || n <= 0) return null;
  const minutes = n * UNIT_MINUTES[unit];
  return Number.isInteger(minutes) ? minutes : null;
}

/** "1 day", "3 hours" — a count with its unit in the singular when it is one. */
export function span(value: string, unit: TimeUnit): string {
  return `${value.trim()} ${Number(value) === 1 ? unit.slice(0, -1) : unit}`;
}

/** The first thing wrong with the form, in words, or null when it can be sent. */
export function alertRuleProblem(form: AlertRuleForm): string | null {
  if (form.name.trim().length < 2) return 'Give the rule a name.';
  if (!form.kpiId) return 'Choose the KPI to watch.';
  switch (form.ruleType) {
    case 'STATIC_THRESHOLD':
      if (number(form.threshold) === null) return 'Enter the value to compare against.';
      break;
    case 'DYNAMIC_STDDEV': {
      const sigmas = number(form.sigmas);
      if (sigmas === null || sigmas <= 0 || sigmas > 10) return 'How far from usual must be a number above 0, up to 10.';
      const size = number(form.windowSize);
      if (size === null || !Number.isInteger(size) || size < 2 || size > 1000) return 'Compare with between 2 and 1000 earlier values.';
      break;
    }
    case 'RATE_OF_CHANGE': {
      const percent = number(form.percent);
      if (percent === null || percent <= 0) return 'Enter a percentage above 0.';
      const minutes = toMinutes(form.windowValue, form.windowUnit);
      if (minutes === null) return 'Enter the period to measure the change over.';
      if (minutes > YEAR_MINUTES) return 'The period can be at most a year.';
      break;
    }
    case 'NO_DATA':
      if (toMinutes(form.staleValue, form.staleUnit) === null) return 'Enter how long without a value is too long.';
      break;
  }
  if (form.cooldownValue.trim() !== '') {
    const cooldown = toMinutes(form.cooldownValue, form.cooldownUnit);
    if (cooldown === null) return 'The quiet period must be a whole number above 0, or left blank.';
    if (cooldown > WEEK_MINUTES) return 'The quiet period can be at most 7 days.';
  }
  const emptyLevel = form.levels.findIndex((l) => l.channelIds.length + l.notifyRoleIds.length + l.notifyUserIds.length === 0);
  if (emptyLevel !== -1) return `Step ${emptyLevel + 1} notifies nobody. Choose who to notify, or remove the step.`;
  if (form.levels.some((l) => !Number.isInteger(l.delayMinutes) || l.delayMinutes < 0 || l.delayMinutes > WEEK_MINUTES)) {
    return 'A step can wait between 0 minutes and 7 days.';
  }
  return null;
}

/** The rule in one sentence, for the preview under the condition. */
export function conditionSentence(form: AlertRuleForm, kpiName: string | undefined): string {
  const kpi = kpiName ?? 'the KPI';
  switch (form.ruleType) {
    case 'STATIC_THRESHOLD':
      return `Alert when ${kpi} ${OPERATOR_WORDS[form.operator]} ${form.threshold.trim() || '…'}.`;
    case 'DYNAMIC_STDDEV':
      return `Alert when a new value of ${kpi} is ${form.sigmas.trim() || '…'} or more standard deviations away from the average of the ${form.windowSize.trim() || '…'} values before it.`;
    case 'RATE_OF_CHANGE':
      return `Alert when ${kpi} ${form.direction === 'rise' ? 'rises' : 'falls'} by ${form.percent.trim() || '…'}% or more within ${span(form.windowValue || '…', form.windowUnit)}.`;
    case 'NO_DATA':
      return `Alert when no value has been recorded for ${kpi} in ${span(form.staleValue || '…', form.staleUnit)}.`;
  }
}

/** A number of minutes as the largest whole unit it makes: "2 days", "3 hours", "90 minutes". */
function minutesInWords(minutes: number): string {
  if (minutes % 1440 === 0) return span(String(minutes / 1440), 'days');
  if (minutes % 60 === 0) return span(String(minutes / 60), 'hours');
  return span(String(minutes), 'minutes');
}

/**
 * A saved rule as what it watches for: "When the value is below 50,000".
 * The list of rules gave only each rule's type. A rule whose settings cannot
 * be read is named by its kind — never shown as stored.
 */
export function savedRuleSentence(rule: { ruleType: string; config: unknown }, formatNumber: (n: number) => string = String): string {
  const config = rule.config && typeof rule.config === 'object' ? (rule.config as Record<string, unknown>) : {};
  const num = (key: string): number | null => (typeof config[key] === 'number' && Number.isFinite(config[key]) ? (config[key] as number) : null);
  const kind = RULE_TYPES.find((t) => t.value === rule.ruleType)?.label ?? 'A rule';
  switch (rule.ruleType) {
    case 'STATIC_THRESHOLD': {
      const words = OPERATOR_WORDS[config.operator as Operator];
      const value = num('value');
      return words && value !== null ? `When the value ${words} ${formatNumber(value)}` : kind;
    }
    case 'DYNAMIC_STDDEV': {
      const sigmas = num('sigmas');
      const windowSize = num('windowSize');
      return sigmas !== null && windowSize !== null
        ? `When a new value is ${formatNumber(sigmas)} or more standard deviations from the average of the ${formatNumber(windowSize)} before it`
        : kind;
    }
    case 'RATE_OF_CHANGE': {
      const pct = num('pctChange');
      const minutes = num('windowMinutes');
      return pct !== null && minutes !== null
        ? `When it ${pct < 0 ? 'falls' : 'rises'} by ${formatNumber(Math.abs(pct))}% or more within ${minutesInWords(minutes)}`
        : kind;
    }
    case 'NO_DATA': {
      const minutes = num('maxStaleMinutes');
      return minutes !== null ? `When no value has been recorded in ${minutesInWords(minutes)}` : kind;
    }
    case 'COMPOSITE':
      return 'When several conditions are met together';
    default:
      return kind;
  }
}

/** The type-specific `config` the API expects. Call only when `alertRuleProblem` is null. */
export function alertRuleConfig(form: AlertRuleForm): Record<string, unknown> {
  const cooldown = form.cooldownValue.trim() === '' ? null : toMinutes(form.cooldownValue, form.cooldownUnit);
  const common = cooldown ? { cooldownMinutes: cooldown } : {};
  switch (form.ruleType) {
    case 'STATIC_THRESHOLD':
      return { operator: form.operator, value: Number(form.threshold), ...common };
    case 'DYNAMIC_STDDEV':
      return { sigmas: Number(form.sigmas), windowSize: Number(form.windowSize), ...common };
    case 'RATE_OF_CHANGE':
      // The API's percentage is signed: negative means a fall.
      return {
        pctChange: (form.direction === 'fall' ? -1 : 1) * Number(form.percent),
        windowMinutes: toMinutes(form.windowValue, form.windowUnit),
        ...common,
      };
    case 'NO_DATA':
      return { maxStaleMinutes: toMinutes(form.staleValue, form.staleUnit), ...common };
  }
}

export function alertRuleBody(form: AlertRuleForm) {
  const description = form.description.trim();
  return {
    kpiId: form.kpiId,
    name: form.name.trim(),
    ...(description ? { description } : {}),
    ruleType: form.ruleType,
    severity: form.severity,
    config: alertRuleConfig(form),
    ...(form.levels.length > 0 ? { escalationLevels: form.levels } : {}),
  };
}

/** Add or remove one id in a list. */
export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export interface RecipientDirectory {
  roles: ReadonlyArray<{ id: string; name: string }>;
  users: ReadonlyArray<{ id: string; fullName: string; roleId: string | null; status: string }>;
  channels: ReadonlyArray<{ id: string; name: string }>;
  /** Names for ids, for a reader who may not list people: enough to name a person, not to count a role. */
  names?: ReadonlyArray<{ id: string; fullName: string }>;
}

/** "after 30 minutes" / "straight away". */
export function delayWords(delayMinutes: number): string {
  if (delayMinutes <= 0) return 'Straight away';
  if (delayMinutes % 1440 === 0) return `After ${span(String(delayMinutes / 1440), 'days')}`;
  if (delayMinutes % 60 === 0) return `After ${span(String(delayMinutes / 60), 'hours')}`;
  return `After ${span(String(delayMinutes), 'minutes')}`;
}

/**
 * Who one step reaches, in words: "Straight away: everyone with the Manager
 * role (3 people), Eve Editor, and the Ops email channel." People are counted
 * once even when they are named and also hold a chosen role.
 */
export function levelSummary(level: EscalationLevelInput, directory: RecipientDirectory): string {
  const parts: string[] = [];
  const reached = new Set<string>();
  for (const roleId of level.notifyRoleIds) {
    const role = directory.roles.find((r) => r.id === roleId);
    const members = directory.users.filter((u) => u.roleId === roleId && u.status === 'ACTIVE');
    members.forEach((u) => reached.add(u.id));
    const count = directory.users.length === 0 ? '' : ` (${members.length === 1 ? '1 person' : `${members.length} people`})`;
    parts.push(`everyone with the ${role?.name ?? 'chosen'} role${count}`);
  }
  for (const userId of level.notifyUserIds) {
    if (reached.has(userId)) continue;
    parts.push(directory.users.find((u) => u.id === userId)?.fullName ?? directory.names?.find((u) => u.id === userId)?.fullName ?? 'one person');
  }
  for (const channelId of level.channelIds) {
    parts.push(`the ${directory.channels.find((c) => c.id === channelId)?.name ?? 'chosen'} channel`);
  }
  const when = delayWords(level.delayMinutes);
  if (parts.length === 0) return `${when}: nobody yet.`;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${when}${level.delayMinutes > 0 ? ', if nobody has acknowledged it' : ''}: ${list}.`;
}
