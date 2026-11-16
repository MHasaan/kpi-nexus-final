/**
 * Words for the enums and internal names the API returns, so a page never shows
 * `PER_UNIT`, `LOWER_IS_BETTER` or `no_bands` (X-03). Use `labelFor(MAP, value)`:
 * a value missing from its map still comes out readable.
 */
import { scopeLabel } from '@kpi-nexus/ui';

export type LabelMap = Readonly<Record<string, string>>;

/** `LOWER_IS_BETTER` / `strategy_map` / `OrgUnitMember` → "Lower is better" / "Strategy map" / "Org unit member". */
export function humanize(value: string): string {
  const words = value
    .replace(/KPI/g, ' kpi ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  const phrase = words.join(' ');
  const sentence = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  return sentence.replace(/\bkpi\b/gi, 'KPI');
}

/** The label for `value`, a readable fallback for a value the map lacks, "—" for nothing. */
export function labelFor(map: LabelMap, value: string | null | undefined): string {
  if (!value) return '—';
  return map[value] ?? humanize(value);
}

export const SCOPE_LABELS: LabelMap = {
  ORG_WIDE: scopeLabel('ORG_WIDE'),
  PER_UNIT: scopeLabel('PER_UNIT'),
  PER_USER: scopeLabel('PER_USER'),
};

export const DIRECTION_LABELS: LabelMap = {
  HIGHER_IS_BETTER: 'Higher is better',
  LOWER_IS_BETTER: 'Lower is better',
  TARGET_IS_BEST: 'On target is best',
  NEUTRAL: 'No direction',
};

export const FREQUENCY_LABELS: LabelMap = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  BIWEEKLY: 'Every two weeks',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
  CUSTOM: 'Custom',
  REAL_TIME: 'Real time',
  AD_HOC: 'Ad hoc',
};

export const KPI_TYPE_LABELS: LabelMap = {
  NUMBER: 'Number',
  PERCENTAGE: 'Percentage',
  CURRENCY: 'Currency',
  DURATION: 'Duration',
  COUNT: 'Count',
  RATING: 'Rating',
  BOOLEAN: 'Yes / no',
};

export const KPI_STATUS_LABELS: LabelMap = {
  DRAFT: 'Draft',
  PROPOSED: 'Proposed',
  APPROVED: 'Approved',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  DEPRECATED: 'Deprecated',
  ARCHIVED: 'Archived',
};

export const QUADRANT_LABELS: LabelMap = {
  FINANCIAL: 'Financial',
  CUSTOMER: 'Customer',
  INTERNAL_PROCESS: 'Internal process',
  LEARNING_GROWTH: 'Learning & growth',
};

/** `status` on a dashboard-summary row (apps/api/src/kpis/kpi-health.ts). */
export const HEALTH_STATUS_LABELS: LabelMap = {
  ON_TRACK: 'On track',
  AT_RISK: 'At risk',
  OFF_TRACK: 'Off track',
  NO_TARGET: 'No target',
  NO_DATA: 'No data',
};

/** `status` on a per-unit / per-user assignment (apps/api/src/user-kpis/assignment-status.ts). */
export const ASSIGNMENT_STATUS_LABELS: LabelMap = {
  exceeded: 'Exceeded',
  on_track: 'On track',
  at_risk: 'At risk',
  behind: 'Behind',
};

/** `reason` from the threshold-band resolver, when no band applies. */
export const BAND_STATUS_LABELS: LabelMap = {
  ok: 'In band',
  no_bands: 'No bands set',
  no_data: 'No data',
  out_of_bands: 'Outside every band',
  hysteresis_fallback: 'Holding the previous band',
};

export const WIDGET_TYPE_LABELS: LabelMap = {
  kpi_card: 'KPI card',
  line: 'Line chart',
  bar: 'Bar chart',
  pie: 'Pie chart',
  gauge: 'Gauge',
  number: 'Big number',
  list: 'KPI list',
  trend: 'Trend',
  activity: 'Activity feed',
  strategy_map: 'Strategy map',
};

export const SEVERITY_LABELS: LabelMap = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

export const ALERT_STATUS_LABELS: LabelMap = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  RESOLVED: 'Resolved',
};

export const USER_STATUS_LABELS: LabelMap = {
  INVITED: 'Invited',
  PENDING_VERIFICATION: 'Awaiting verification',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
  DELETED: 'Deleted',
  PURGED: 'Erased',
};

/** Audit actions as past-tense verbs, for "Diane Foster updated a KPI". */
export const AUDIT_ACTION_LABELS: LabelMap = {
  CREATE: 'created',
  UPDATE: 'updated',
  DELETE: 'deleted',
  LOGIN: 'signed in',
  LOGOUT: 'signed out',
  IMPORT: 'imported',
  EXPORT: 'exported',
  IMPERSONATE_START: 'started impersonating',
  IMPERSONATE_END: 'stopped impersonating',
  APPROVE: 'approved',
  REJECT: 'rejected',
};

/** Audit entity types (keys lower-cased: the audit log writes `KPI`, `kpi` and `KPI_DEFINITION`). */
const ENTITY_LABELS: LabelMap = {
  kpi: 'KPI',
  kpi_definition: 'KPI',
  kpidatapoint: 'KPI value',
  kpitarget: 'KPI target',
  kpithresholdband: 'threshold band',
  kpibenchmark: 'benchmark',
  kpicascade: 'cascade link',
  kpicategory: 'KPI category',
  kpitemplate: 'KPI template',
  kpiassignmentorgunit: 'unit KPI assignment',
  kpiassignmentuser: 'personal KPI assignment',
  formulaexpression: 'formula',
  organization: 'organisation',
  orgunit: 'org unit',
  orgunitmember: 'unit member',
  orgunittype: 'unit type',
  orgunitdimension: 'unit dimension',
  roledefinition: 'role',
  user: 'user',
  useraccessoverride: 'access override',
  permissiondelegation: 'delegation',
  resourcepermission: 'resource permission',
  dashboard: 'dashboard',
  dashboardwidget: 'dashboard widget',
  dashboardsharelink: 'share link',
  dashboardsnapshot: 'dashboard snapshot',
  scheduledreport: 'scheduled report',
  alert: 'alert',
  alertrule: 'alert rule',
  notificationchannel: 'notification channel',
  objective: 'objective',
  keyresult: 'key result',
  task: 'task',
  comment: 'comment',
  approvalrequest: 'approval request',
  approvalworkflow: 'approval workflow',
  workflow: 'automation',
  apikey: 'API key',
  webhooksubscription: 'webhook',
  integrationconnection: 'integration',
  connector: 'connector',
  plugin: 'plugin',
  customdomain: 'custom domain',
  ssoconfig: 'SSO settings',
  scimtoken: 'SCIM token',
  retentionpolicy: 'retention policy',
  passwordresettoken: 'password reset',
};

/** A thing's name from its audit `entityType`: "KPI value", "role", "org unit". */
export function entityLabel(entityType: string | null | undefined): string {
  if (!entityType) return 'item';
  return ENTITY_LABELS[entityType.toLowerCase()] ?? humanize(entityType).toLowerCase();
}

const article = (noun: string): string => (/^[aeiou]/i.test(noun) && !/^(user|unit)/i.test(noun) ? 'an' : 'a');

/** An audit row as a phrase: `activityLabel('UPDATE', 'kpi')` → "updated a KPI". */
export function activityLabel(action: string, entityType: string | null | undefined): string {
  const verb = labelFor(AUDIT_ACTION_LABELS, action).toLowerCase();
  if (action === 'LOGIN' || action === 'LOGOUT' || !entityType) return verb;
  const noun = entityLabel(entityType);
  return `${verb} ${article(noun)} ${noun}`;
}
