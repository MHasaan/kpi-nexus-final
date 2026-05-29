/**
 * Thin fetch wrapper for the api. Reads the access token from localStorage
 * on every call (so token refresh elsewhere is picked up without state
 * plumbing). All errors surface as `ApiError` carrying the api's error
 * envelope when present.
 */

const TOKEN_KEY = 'kpi-nexus.access-token';
const REFRESH_KEY = 'kpi-nexus.refresh-token';

export const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, accessToken);
  window.localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, body, ...rest } = init;
  const headers = new Headers(init.headers);
  if (body !== undefined && body !== null) {
    headers.set('content-type', 'application/json');
  }
  if (auth) {
    const token = getAccessToken();
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${apiBaseUrl}${path}`, { ...rest, headers, body });
  if (res.status === 204) {
    return undefined as T;
  }
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (payload ?? {}) as { message?: string; code?: string; details?: unknown };
    throw new ApiError(
      res.status,
      err.message ?? `HTTP ${res.status}`,
      err.code,
      err.details,
    );
  }
  return payload as T;
}

// =============================================================================
// Auth helpers — wrap the most common endpoints
// =============================================================================

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
  roleId: string | null;
  mfaEnabled?: boolean;
  status?: string;
  notificationSettings?: NotificationSettings | null;
}

export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface AuthPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function loginRequest(body: {
  email: string;
  password: string;
  organizationId?: string;
  mfaCode?: string;
}): Promise<AuthPair & { user: AuthUser }> {
  return api('/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
}

export async function registerRequest(body: {
  orgName: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
  adminFullName: string;
}): Promise<AuthPair & { user: AuthUser; organization: AuthOrganization }> {
  return api('/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
}

export async function meRequest(): Promise<{ user: AuthUser }> {
  return api('/auth/me');
}

// =============================================================================
// Resource helpers
// =============================================================================

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isAdmin: boolean;
  level: number;
  color: string | null;
  canAccessModules: string[];
  createdAt: string;
  updatedAt: string;
}

export async function listRoles(): Promise<RoleSummary[]> {
  return api('/roles');
}

export async function createRole(body: {
  name: string;
  description?: string;
  permissions?: string[];
  level?: number;
  color?: string;
}): Promise<RoleSummary> {
  return api('/roles', { method: 'POST', body: JSON.stringify(body) });
}

export async function deleteRole(id: string): Promise<void> {
  return api(`/roles/${id}`, { method: 'DELETE' });
}

// =============================================================================
// Organizations + terminology
// =============================================================================

export interface OrganizationSettings {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  timezone: string;
  currency: string;
  locale: string;
  weekStartsOn: number;
  // Terminology
  roleLabel: string;
  groupLabel: string;
  memberLabel: string;
  kpiLabel: string;
  dashboardLabel: string;
  scorecardLabel: string;
  objectiveLabel: string;
  taskLabel: string;
}

export interface Terminology {
  roleLabel: string;
  groupLabel: string;
  memberLabel: string;
  kpiLabel: string;
  dashboardLabel: string;
  scorecardLabel: string;
  objectiveLabel: string;
  taskLabel: string;
}

export const DEFAULT_TERMINOLOGY: Terminology = {
  roleLabel: 'Role',
  groupLabel: 'Team',
  memberLabel: 'Member',
  kpiLabel: 'KPI',
  dashboardLabel: 'Dashboard',
  scorecardLabel: 'Scorecard',
  objectiveLabel: 'Objective',
  taskLabel: 'Task',
};

export async function getMyOrganization(): Promise<OrganizationSettings> {
  return api('/organizations/me');
}

export async function getTerminology(): Promise<Terminology> {
  return api('/organizations/me/terminology');
}

export async function updateMyOrganization(
  patch: Partial<OrganizationSettings>,
): Promise<OrganizationSettings> {
  return api('/organizations/me', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

// =============================================================================
// Users + Invitations
// =============================================================================

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  status: 'INVITED' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' | 'DELETED';
  roleId: string | null;
  managerId: string | null;
  positionId: string | null;
  createdAt: string;
}

export interface InviteResult {
  user: UserSummary;
  inviteToken?: string;
  acceptUrl?: string;
}

export async function listUsers(): Promise<UserSummary[]> {
  return api('/users');
}

export async function inviteUser(body: {
  email: string;
  fullName: string;
  roleId?: string;
  positionId?: string;
}): Promise<InviteResult> {
  return api('/users', { method: 'POST', body: JSON.stringify(body) });
}

export async function acceptInvitation(body: {
  token: string;
  password: string;
}): Promise<AuthPair & { user: AuthUser }> {
  return api('/auth/accept-invitation', {
    method: 'POST',
    body: JSON.stringify(body),
    auth: false,
  });
}

// =============================================================================
// Positions
// =============================================================================

export type PositionTrack = 'IC' | 'MANAGEMENT' | 'EXECUTIVE';

export interface PositionSummary {
  id: string;
  name: string;
  level: number;
  track: PositionTrack | null;
  payGrade: string | null;
  description: string | null;
  orgUnitId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listPositions(): Promise<PositionSummary[]> {
  return api('/positions');
}

export async function createPosition(body: {
  name: string;
  level?: number;
  track?: PositionTrack;
  payGrade?: string;
  description?: string;
}): Promise<PositionSummary> {
  return api('/positions', { method: 'POST', body: JSON.stringify(body) });
}

export async function deletePosition(id: string): Promise<void> {
  return api(`/positions/${id}`, { method: 'DELETE' });
}

// =============================================================================
// Org units
// =============================================================================

export type OrgUnitStatus = 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type OrgUnitMemberRole = 'MEMBER' | 'MANAGER' | 'LEAD' | 'DEPUTY';

export interface OrgUnitSummary {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  orgUnitTypeId: string;
  parentUnitId: string | null;
  headUserId: string | null;
  status: OrgUnitStatus;
  visibilityInherits: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrgUnitMember {
  id: string;
  orgUnitId: string;
  userId: string;
  memberRole: OrgUnitMemberRole;
  joinedAt: string;
  leftAt: string | null;
}

export async function listOrgUnits(): Promise<OrgUnitSummary[]> {
  return api('/org-units');
}

export async function createOrgUnit(body: {
  name: string;
  parentUnitId?: string;
  description?: string;
}): Promise<OrgUnitSummary> {
  return api('/org-units', { method: 'POST', body: JSON.stringify(body) });
}

export async function deleteOrgUnit(id: string): Promise<void> {
  return api(`/org-units/${id}`, { method: 'DELETE' });
}

export async function listOrgUnitMembers(unitId: string): Promise<OrgUnitMember[]> {
  return api(`/org-units/${unitId}/members`);
}

export async function addOrgUnitMember(
  unitId: string,
  body: { userId: string; memberRole?: OrgUnitMemberRole },
): Promise<OrgUnitMember> {
  return api(`/org-units/${unitId}/members`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function removeOrgUnitMember(unitId: string, userId: string): Promise<void> {
  return api(`/org-units/${unitId}/members/${userId}`, { method: 'DELETE' });
}

// =============================================================================
// MFA
// =============================================================================

export interface MfaEnrollResult {
  secret: string;
  otpauthUrl: string;
  recoveryCodes: string[];
}

export async function enrollMfa(): Promise<MfaEnrollResult> {
  return api('/mfa/enroll', { method: 'POST', body: JSON.stringify({}) });
}

export async function confirmMfa(body: {
  code: string;
  recoveryCodes: string[];
}): Promise<void> {
  return api('/mfa/confirm', { method: 'POST', body: JSON.stringify(body) });
}

export async function disableMfa(body: { code: string }): Promise<void> {
  return api('/mfa/disable', { method: 'POST', body: JSON.stringify(body) });
}

export async function whoAmI(): Promise<{
  user: AuthUser & { mfaEnabled: boolean; status: string };
}> {
  return api('/auth/me');
}

// =============================================================================
// KPIs (P2)
// =============================================================================

export type KpiScope = 'ORG_WIDE' | 'PER_UNIT' | 'PER_USER';
export type KpiType =
  | 'NUMBER'
  | 'PERCENTAGE'
  | 'CURRENCY'
  | 'DURATION'
  | 'COUNT'
  | 'RATING'
  | 'BOOLEAN';
export type KpiDirection =
  | 'HIGHER_IS_BETTER'
  | 'LOWER_IS_BETTER'
  | 'TARGET_IS_BEST'
  | 'NEUTRAL';
export type KpiFrequency =
  | 'DAILY'
  | 'WEEKLY'
  | 'BIWEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'YEARLY'
  | 'CUSTOM'
  | 'REAL_TIME'
  | 'AD_HOC';
export type KpiStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'APPROVED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'DEPRECATED'
  | 'ARCHIVED';

export interface KpiSummary {
  id: string;
  organizationId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  scope: KpiScope;
  type: KpiType;
  direction: KpiDirection;
  frequency: KpiFrequency;
  aggregationMethod: string;
  status: KpiStatus;
  targetValue: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  allowNegative: boolean;
  ownerUserId: string | null;
  tags: string[];
  isActive: boolean;
  isArchived: boolean;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  orgUnitAssignments: Array<{ id: string; orgUnitId: string; createdAt: string }>;
  userAssignments: Array<{ id: string; userId: string; createdAt: string }>;
}

export interface DataPoint {
  id: string;
  kpiId: string;
  orgUnitId: string | null;
  userId: string | null;
  value: number;
  unit: string | null;
  periodStart: string;
  periodEnd: string;
  recordedAt: string;
  recordedById: string | null;
  sourceType: string;
  qualityFlag: string;
  note: string | null;
}

export async function listKpis(): Promise<KpiSummary[]> {
  return api('/kpis');
}

export async function createKpi(body: {
  name: string;
  scope: KpiScope;
  type?: KpiType;
  unit?: string;
  description?: string;
  frequency?: KpiFrequency;
  targetValue?: number;
  scorecardQuadrant?: string;
  orgUnitIds?: string[];
  userIds?: string[];
}): Promise<KpiSummary> {
  return api('/kpis', { method: 'POST', body: JSON.stringify(body) });
}

export async function deleteKpi(id: string): Promise<void> {
  return api(`/kpis/${id}`, { method: 'DELETE' });
}

export async function recordOrgWideDataPoint(
  kpiId: string,
  body: {
    value: number;
    periodStart: string;
    periodEnd: string;
    unit?: string;
    note?: string;
  },
): Promise<DataPoint> {
  return api(`/kpis/${kpiId}/data`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function listKpiDataPoints(
  kpiId: string,
  opts: { from?: string; to?: string } = {},
): Promise<DataPoint[]> {
  const search = new URLSearchParams();
  if (opts.from) search.set('from', opts.from);
  if (opts.to) search.set('to', opts.to);
  const qs = search.toString();
  return api(`/kpis/${kpiId}/data${qs ? `?${qs}` : ''}`);
}

export interface DashboardSummaryRow {
  kpiId: string;
  name: string;
  scope: KpiScope;
  unit: string | null;
  targetValue: number | null;
  latestValue: number | null;
  latestRecordedAt: string | null;
  aggregatedValue: number | null;
  pointCount: number;
  scorecardQuadrant: string | null;
}

export async function getDashboardSummary(
  opts: { from?: string; to?: string } = {},
): Promise<DashboardSummaryRow[]> {
  const search = new URLSearchParams();
  if (opts.from) search.set('from', opts.from);
  if (opts.to) search.set('to', opts.to);
  const qs = search.toString();
  return api(`/kpis/dashboard-summary${qs ? `?${qs}` : ''}`);
}

// =============================================================================
// Dashboards (P3)
// =============================================================================

export type WidgetType =
  | 'kpi_card'
  | 'line'
  | 'bar'
  | 'pie'
  | 'gauge'
  | 'number'
  | 'list'
  | 'trend'
  | 'activity'
  | 'strategy_map';

export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardWidget {
  id: string;
  widgetType: WidgetType;
  title: string | null;
  config: Record<string, unknown>;
  position: WidgetPosition;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Dashboard {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  ownerUserId: string | null;
  ownerRoleId: string | null;
  isShared: boolean;
  isDefault: boolean;
  layout: Record<string, unknown> | null;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
  widgets: DashboardWidget[];
}

export async function listDashboards(): Promise<Dashboard[]> {
  return api('/dashboards');
}

export async function getDashboard(id: string): Promise<Dashboard> {
  return api(`/dashboards/${id}`);
}

export async function createDashboard(body: {
  name: string;
  description?: string;
  isShared?: boolean;
}): Promise<Dashboard> {
  return api('/dashboards', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateDashboard(
  id: string,
  patch: {
    name?: string;
    description?: string;
    isShared?: boolean;
  },
  expectedVersion: number,
): Promise<Dashboard> {
  return api(`/dashboards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
    headers: { 'If-Match': `W/"${expectedVersion}"` },
  });
}

export async function deleteDashboard(id: string): Promise<void> {
  return api(`/dashboards/${id}`, { method: 'DELETE' });
}

export async function setDefaultDashboard(id: string): Promise<Dashboard> {
  return api(`/dashboards/${id}/set-default`, { method: 'POST' });
}

export async function addWidget(
  dashboardId: string,
  body: {
    widgetType: WidgetType;
    title?: string;
    config: Record<string, unknown>;
    position: WidgetPosition;
  },
): Promise<DashboardWidget> {
  return api(`/dashboards/${dashboardId}/widgets`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteWidget(
  dashboardId: string,
  widgetId: string,
): Promise<void> {
  return api(`/dashboards/${dashboardId}/widgets/${widgetId}`, {
    method: 'DELETE',
  });
}

export async function updateWidgetPosition(
  dashboardId: string,
  widgetId: string,
  position: WidgetPosition,
): Promise<DashboardWidget> {
  return api(`/dashboards/${dashboardId}/widgets/${widgetId}/position`, {
    method: 'POST',
    body: JSON.stringify(position),
  });
}

export async function updateWidget(
  dashboardId: string,
  widgetId: string,
  patch: Partial<Pick<DashboardWidget, 'title' | 'config' | 'position'>>,
): Promise<DashboardWidget> {
  return api(`/dashboards/${dashboardId}/widgets/${widgetId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

// =============================================================================
// Snapshots (P3)
// =============================================================================

export interface DashboardSnapshot {
  id: string;
  dashboardId: string;
  label: string | null;
  payload: Record<string, unknown>;
  takenAt: string;
  takenById: string | null;
  takenByName?: string | null;
}

export async function listSnapshots(dashboardId: string): Promise<DashboardSnapshot[]> {
  return api(`/dashboards/${dashboardId}/snapshots`);
}

export async function captureSnapshot(
  dashboardId: string,
  body: { label?: string } = {},
): Promise<DashboardSnapshot> {
  return api(`/dashboards/${dashboardId}/snapshots`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getSnapshot(snapshotId: string): Promise<DashboardSnapshot> {
  return api(`/dashboards/snapshots/${snapshotId}`);
}

export async function deleteSnapshot(snapshotId: string): Promise<void> {
  return api(`/dashboards/snapshots/${snapshotId}`, { method: 'DELETE' });
}

// =============================================================================
// Real-time SSE stream
// =============================================================================

export interface RealtimeEvent {
  type: string;
  payload: unknown;
}

/**
 * Subscribe to the SSE real-time stream. Uses fetch + ReadableStream
 * instead of EventSource so we can send the Authorization header.
 *
 * Returns a cleanup function that aborts the connection.
 */
export function subscribeRealtime(
  filters: { kpiId?: string; dashboardId?: string },
  onEvent: (evt: RealtimeEvent) => void,
): () => void {
  const controller = new AbortController();

  async function connect() {
    const token = getAccessToken();
    if (!token) return;

    const qs = new URLSearchParams();
    if (filters.kpiId) qs.set('kpiId', filters.kpiId);
    if (filters.dashboardId) qs.set('dashboardId', filters.dashboardId);
    const url = `${apiBaseUrl}/realtime/stream${qs.toString() ? `?${qs.toString()}` : ''}`;

    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      // SSE frame state
      let eventType = 'message';
      let dataLines: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        // Keep the last (potentially incomplete) line in the buffer
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (line === '') {
            // Blank line = end of SSE frame
            if (dataLines.length > 0) {
              const dataStr = dataLines.join('\n');
              try {
                const payload: unknown = JSON.parse(dataStr);
                onEvent({ type: eventType, payload });
              } catch {
                // non-JSON data — skip
              }
              eventType = 'message';
              dataLines = [];
            }
          } else if (line.startsWith(':')) {
            // SSE heartbeat / comment — ignore
          } else if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }
      }
    } catch (err) {
      // AbortError means cleanup — don't reconnect
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Other errors: attempt reconnect after 3 s
      if (!controller.signal.aborted) {
        await new Promise<void>((resolve) => setTimeout(resolve, 3000));
        if (!controller.signal.aborted) connect();
      }
    }
  }

  void connect();
  return () => controller.abort();
}

// =============================================================================
// Audit log
// =============================================================================

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'IMPERSONATE'
  | 'EXPORT'
  | 'INVITE'
  | 'PERMISSION_CHANGE'
  | 'CONFIG_CHANGE'
  | 'BILLING_EVENT'
  | 'SYSTEM_EVENT';

export interface AuditEntry {
  id: string;
  action: AuditAction;
  entityType: string | null;
  entityId: string | null;
  changes: unknown;
  userId: string | null;
  userEmail: string | null;
  metadata: unknown;
  redactedKeys: string[];
  createdAt: string;
}

export interface AuditListParams {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: AuditAction;
  limit?: number;
}

export async function listAudit(params: AuditListParams = {}): Promise<AuditEntry[]> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const qs = search.toString();
  return api(`/audit${qs ? `?${qs}` : ''}`);
}

// =============================================================================
// Reports (P3)
// =============================================================================

export type ReportFormat = 'CSV' | 'EXCEL' | 'PDF';
export type ReportRunStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface ReportRun {
  id: string;
  status: ReportRunStatus;
  ranAt: string | null;
  fileUrl: string | null;
  error: string | null;
  createdAt: string;
}

export interface ScheduledReport {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  cron: string;
  format: ReportFormat;
  recipients: string[];
  dashboardId: string | null;
  kpiIds: string[];
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runs: ReportRun[];
  createdAt: string;
  updatedAt: string;
}

export interface ShareLink {
  id: string;
  dashboardId: string;
  token: string;
  hasPassword: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface PublicWidget {
  id: string;
  widgetType: string;
  title: string | null;
  config: Record<string, unknown>;
  position: WidgetPosition;
  sortOrder: number;
}

export interface PublicKpiValue {
  kpiId: string;
  name: string;
  unit: string | null;
  latestValue: number | null;
  latestRecordedAt: string | null;
  thresholdStatus: string | null;
}

export interface PublicDashboardPayload {
  dashboard: {
    id: string;
    name: string;
    description: string | null;
  };
  widgets: PublicWidget[];
  kpiValues: PublicKpiValue[];
  viewCount?: number;
}

export interface SparklinePoint {
  recordedAt: string;
  value: number;
}

export interface EmbedKpiSnapshot {
  kpiId: string;
  kpiName: string;
  unit: string | null;
  latestValue: number | null;
  latestRecordedAt: string | null;
  sparkline: SparklinePoint[];
  thresholdStatus: string | null;
}

export interface BoardPackMover {
  kpiId: string;
  name: string;
  unit: string | null;
  previousValue: number | null;
  currentValue: number | null;
  change: number | null;
  changePct: number | null;
}

export interface BoardPackQuadrantKpi {
  kpiId: string;
  name: string;
  value: number | null;
  status: string | null;
}

export interface BoardPackQuadrant {
  name: string;
  kpis: BoardPackQuadrantKpi[];
  healthDistribution?: Record<string, number>;
}

export interface BoardPack {
  org: { id: string; name: string };
  period: { sinceDays: number; from: string; to: string };
  topMovers: BoardPackMover[];
  quadrants: BoardPackQuadrant[];
}

// Scheduled reports

export async function listScheduledReports(): Promise<ScheduledReport[]> {
  return api('/scheduled-reports');
}

export async function createScheduledReport(body: {
  name: string;
  cron: string;
  format: ReportFormat;
  recipients: string[];
  dashboardId?: string;
  kpiIds?: string[];
  description?: string;
}): Promise<ScheduledReport> {
  return api('/scheduled-reports', { method: 'POST', body: JSON.stringify(body) });
}

export async function getScheduledReport(id: string): Promise<ScheduledReport> {
  return api(`/scheduled-reports/${id}`);
}

export async function updateScheduledReport(
  id: string,
  patch: Partial<{
    name: string;
    cron: string;
    format: ReportFormat;
    recipients: string[];
    isActive: boolean;
    dashboardId: string;
    kpiIds: string[];
    description: string;
  }>,
): Promise<ScheduledReport> {
  return api(`/scheduled-reports/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

export async function deleteScheduledReport(id: string): Promise<void> {
  return api(`/scheduled-reports/${id}`, { method: 'DELETE' });
}

export async function triggerScheduledReport(id: string): Promise<void> {
  return api(`/scheduled-reports/${id}/trigger`, { method: 'POST', body: JSON.stringify({}) });
}

// On-demand report download (returns a blob and triggers browser download)

export async function downloadReport(body: {
  format: ReportFormat;
  dashboardId?: string;
  kpiIds?: string[];
  from?: string;
  to?: string;
}): Promise<void> {
  const token = getAccessToken();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;

  // The date-range bar emits bare `YYYY-MM-DD`; the API expects full ISO
  // datetimes, so normalize before sending.
  const toIso = (s: string | undefined): string | undefined =>
    s ? new Date(s).toISOString() : undefined;
  const payload = {
    ...body,
    from: toIso(body.from),
    to: toIso(body.to),
  };

  const res = await fetch(`${apiBaseUrl}/reports/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errPayload = await res.json().catch(() => ({})) as { message?: string };
    throw new ApiError(res.status, errPayload.message ?? `HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
  const filename = match?.[1]?.replace(/['"]/g, '') ?? `report.${body.format.toLowerCase()}`;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

// Board pack

export async function getBoardPack(sinceDays: number): Promise<BoardPack> {
  return api(`/reports/board-pack?sinceDays=${sinceDays}`);
}

// Embed token

export async function mintEmbedToken(kpiId: string): Promise<{ token: string }> {
  return api(`/reports/kpis/${kpiId}/embed-token`, { method: 'POST', body: JSON.stringify({}) });
}

// Share links (authenticated)

export async function listShareLinks(dashboardId: string): Promise<ShareLink[]> {
  return api(`/dashboards/${dashboardId}/share`);
}

export async function createShareLink(
  dashboardId: string,
  body: { expiresAt?: string; password?: string },
): Promise<ShareLink> {
  return api(`/dashboards/${dashboardId}/share`, { method: 'POST', body: JSON.stringify(body) });
}

export async function revokeShareLink(linkId: string): Promise<void> {
  return api(`/dashboards/share/${linkId}`, { method: 'DELETE' });
}

// Public dashboard resolve (NO auth)

export async function getPublicDashboard(token: string): Promise<PublicDashboardPayload> {
  return api(`/public/dashboards/${token}`, { auth: false });
}

export async function submitPublicDashboardPassword(
  token: string,
  password: string,
): Promise<PublicDashboardPayload> {
  return api(`/public/dashboards/${token}`, {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ password }),
  });
}

// Public embed resolve (NO auth)

export async function getPublicEmbedKpi(token: string): Promise<EmbedKpiSnapshot> {
  return api(`/public/embed/kpi/${token}`, { auth: false });
}

// =============================================================================
// Session
// =============================================================================

export async function logoutRequest(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await api('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // best-effort — clear local state regardless
    }
  }
  clearTokens();
}

// =============================================================================
// Alerting (P4)
// =============================================================================

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type AlertRuleType =
  | 'STATIC_THRESHOLD'
  | 'DYNAMIC_STDDEV'
  | 'RATE_OF_CHANGE'
  | 'NO_DATA'
  | 'COMPOSITE';

export interface EscalationLevelInput {
  delayMinutes: number;
  channelIds: string[];
  notifyRoleIds: string[];
  notifyUserIds: string[];
}

export interface AlertRule {
  id: string;
  organizationId: string;
  kpiId: string;
  name: string;
  description: string | null;
  ruleType: AlertRuleType;
  config: Record<string, unknown>;
  severity: AlertSeverity;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  escalationRule: { id: string; levels: unknown; createdAt: string; updatedAt: string } | null;
}

export interface Alert {
  id: string;
  organizationId: string;
  alertRuleId: string | null;
  kpiId: string;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  targetUserId: string | null;
  acknowledgedAt: string | null;
  acknowledgedById: string | null;
  resolvedAt: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationChannel {
  id: string;
  organizationId: string;
  name: string;
  kind: 'EMAIL' | 'SLACK' | 'TEAMS' | 'SMS' | 'IN_APP' | 'WEBHOOK';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listAlertRules(kpiId?: string): Promise<AlertRule[]> {
  const q = kpiId ? `?kpiId=${encodeURIComponent(kpiId)}` : '';
  return api(`/alert-rules${q}`);
}

export async function createAlertRule(body: {
  kpiId: string;
  name: string;
  description?: string;
  ruleType: AlertRuleType;
  severity?: AlertSeverity;
  isActive?: boolean;
  config: Record<string, unknown>;
  escalationLevels?: EscalationLevelInput[];
}): Promise<AlertRule> {
  return api('/alert-rules', { method: 'POST', body: JSON.stringify(body) });
}

export async function deleteAlertRule(id: string): Promise<void> {
  return api(`/alert-rules/${id}`, { method: 'DELETE' });
}

export async function listAlerts(filter: {
  status?: AlertStatus;
  severity?: AlertSeverity;
  kpiId?: string;
} = {}): Promise<Alert[]> {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.severity) params.set('severity', filter.severity);
  if (filter.kpiId) params.set('kpiId', filter.kpiId);
  const q = params.toString();
  return api(`/alerts${q ? `?${q}` : ''}`);
}

export async function getAlert(id: string): Promise<Alert> {
  return api(`/alerts/${id}`);
}

export async function acknowledgeAlert(id: string): Promise<Alert> {
  return api(`/alerts/${id}/acknowledge`, { method: 'POST' });
}

export async function resolveAlert(id: string): Promise<Alert> {
  return api(`/alerts/${id}/resolve`, { method: 'POST' });
}

export async function getAlertUnreadCount(): Promise<{ count: number }> {
  return api('/alerts/unread-count');
}

export async function listNotificationChannels(): Promise<NotificationChannel[]> {
  return api('/notification-channels');
}

export async function createNotificationChannel(body: {
  name: string;
  kind: NotificationChannel['kind'];
  config: Record<string, unknown>;
}): Promise<NotificationChannel> {
  return api('/notification-channels', { method: 'POST', body: JSON.stringify(body) });
}

export async function deleteNotificationChannel(id: string): Promise<void> {
  return api(`/notification-channels/${id}`, { method: 'DELETE' });
}

export async function testNotificationChannel(id: string): Promise<{ sent: boolean }> {
  return api(`/notification-channels/${id}/test`, { method: 'POST' });
}

// =============================================================================
// API keys + Webhooks (P4 admin settings)
// =============================================================================

export interface ApiKey {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdById: string;
}

export async function listApiKeys(): Promise<ApiKey[]> {
  return api('/api-keys');
}

export async function createApiKey(body: {
  name: string;
  scopes: string[];
  expiresAt?: string;
}): Promise<{ apiKey: ApiKey; plaintext: string }> {
  return api('/api-keys', { method: 'POST', body: JSON.stringify(body) });
}

export async function revokeApiKey(id: string): Promise<ApiKey> {
  return api(`/api-keys/${id}`, { method: 'DELETE' });
}

export interface WebhookSubscription {
  id: string;
  organizationId: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  lastDeliveredAt: string | null;
  lastStatus: number | null;
  failureCount: number;
  createdAt: string;
  createdById: string;
}

export async function listWebhooks(): Promise<WebhookSubscription[]> {
  return api('/webhooks');
}

export async function createWebhook(body: {
  name: string;
  url: string;
  events: string[];
}): Promise<{ webhook: WebhookSubscription; secret: string }> {
  return api('/webhooks', { method: 'POST', body: JSON.stringify(body) });
}

export async function rotateWebhookSecret(
  id: string,
): Promise<{ webhook: WebhookSubscription; secret: string }> {
  return api(`/webhooks/${id}/rotate-secret`, { method: 'POST' });
}

export async function setWebhookActive(
  id: string,
  isActive: boolean,
): Promise<WebhookSubscription> {
  return api(`/webhooks/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) });
}

export async function deleteWebhook(id: string): Promise<void> {
  return api(`/webhooks/${id}`, { method: 'DELETE' });
}

export async function testWebhook(id: string): Promise<{ queued: boolean }> {
  return api(`/webhooks/${id}/test`, { method: 'POST' });
}

// =============================================================================
// Per-user notification prefs + DLQ (P4 settings)
// =============================================================================

export interface NotificationSettings {
  digestMode?: 'OFF' | 'DAILY' | 'WEEKLY';
  muteStart?: string;
  muteEnd?: string;
  mutedChannelKinds?: string[];
}

export async function updateNotificationSettings(
  body: NotificationSettings,
): Promise<{ notificationSettings: NotificationSettings | null }> {
  return api('/auth/me/notification-settings', { method: 'PATCH', body: JSON.stringify(body) });
}

export type NotificationDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SUPPRESSED';

export interface NotificationDelivery {
  id: string;
  organizationId: string;
  alertId: string;
  channelId: string | null;
  targetUserId: string | null;
  status: NotificationDeliveryStatus;
  attempts: number;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
}

export async function listNotificationDeliveries(
  status?: NotificationDeliveryStatus,
): Promise<NotificationDelivery[]> {
  const q = status ? `?status=${status}` : '';
  return api(`/notification-deliveries${q}`);
}

export async function retryNotificationDelivery(id: string): Promise<NotificationDelivery> {
  return api(`/notification-deliveries/${id}/retry`, { method: 'POST' });
}

// =============================================================================
// KPI CSV import (P2)
// =============================================================================

export interface ImportRowError {
  row: number;
  column?: string;
  message: string;
}

export interface KpiImportDryRun {
  totalRows: number;
  valid: Array<Record<string, unknown>>;
  errors: ImportRowError[];
}

export async function importKpisDryRun(csv: string): Promise<KpiImportDryRun> {
  return api('/kpis/import/dry-run', { method: 'POST', body: JSON.stringify({ csv }) });
}

export async function importKpisCommit(
  csv: string,
): Promise<{ createdCount: number; createdIds: string[] }> {
  return api('/kpis/import/commit', { method: 'POST', body: JSON.stringify({ csv }) });
}

// =============================================================================
// KPI categories (P2)
// =============================================================================

export interface KpiCategory {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  _count: { kpis: number };
}

export async function listKpiCategories(): Promise<KpiCategory[]> {
  return api('/kpi-categories');
}

export async function createKpiCategory(body: {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
}): Promise<KpiCategory> {
  return api('/kpi-categories', { method: 'POST', body: JSON.stringify(body) });
}

export async function updateKpiCategory(
  id: string,
  body: Partial<{ name: string; description: string; color: string; icon: string; sortOrder: number }>,
): Promise<KpiCategory> {
  return api(`/kpi-categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function deleteKpiCategory(id: string): Promise<void> {
  return api(`/kpi-categories/${id}`, { method: 'DELETE' });
}

// =============================================================================
// KPI detail: single fetch + targets / threshold-bands / benchmarks / lineage
// =============================================================================

export async function getKpi(id: string): Promise<KpiSummary> {
  return api(`/kpis/${id}`);
}

export interface KpiTarget {
  id: string;
  kpiId: string;
  type: string;
  value: number | null;
  minValue: number | null;
  expectedValue: number | null;
  stretchValue: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  scenarioName: string | null;
  createdAt: string;
}

export async function listTargets(kpiId: string): Promise<KpiTarget[]> {
  return api(`/kpis/${kpiId}/targets`);
}
export async function createTarget(
  kpiId: string,
  body: { type: string; value?: number; minValue?: number; expectedValue?: number; stretchValue?: number; effectiveFrom?: string; effectiveTo?: string; scenarioName?: string },
): Promise<KpiTarget> {
  return api(`/kpis/${kpiId}/targets`, { method: 'POST', body: JSON.stringify(body) });
}
export async function deleteTarget(kpiId: string, targetId: string): Promise<void> {
  return api(`/kpis/${kpiId}/targets/${targetId}`, { method: 'DELETE' });
}

export interface ThresholdBand {
  id: string;
  kpiId: string;
  name: string;
  lower: number | null;
  upper: number | null;
  color: string;
  order: number;
  consecutivePointsRequired: number;
}
export interface ThresholdStatus {
  band: string | null;
  reason?: string;
  color?: string;
}
export async function listThresholdBands(kpiId: string): Promise<ThresholdBand[]> {
  return api(`/kpis/${kpiId}/threshold-bands`);
}
export async function createThresholdBand(
  kpiId: string,
  body: { name: string; lower?: number | null; upper?: number | null; color: string; order: number; consecutivePointsRequired?: number },
): Promise<ThresholdBand> {
  return api(`/kpis/${kpiId}/threshold-bands`, { method: 'POST', body: JSON.stringify(body) });
}
export async function deleteThresholdBand(kpiId: string, bandId: string): Promise<void> {
  return api(`/kpis/${kpiId}/threshold-bands/${bandId}`, { method: 'DELETE' });
}
export async function getThresholdStatus(kpiId: string): Promise<ThresholdStatus> {
  return api(`/kpis/${kpiId}/threshold-bands/status`);
}

export interface Benchmark {
  id: string;
  kpiId: string;
  kind: string;
  value: number;
  source: string | null;
  createdAt: string;
}
export async function listBenchmarks(kpiId: string): Promise<Benchmark[]> {
  return api(`/kpis/${kpiId}/benchmarks`);
}
export async function createBenchmark(
  kpiId: string,
  body: { kind: string; value: number; source?: string },
): Promise<Benchmark> {
  return api(`/kpis/${kpiId}/benchmarks`, { method: 'POST', body: JSON.stringify(body) });
}
export async function computeBenchmark(kpiId: string, days = 30): Promise<Benchmark> {
  return api(`/kpis/${kpiId}/benchmarks/compute`, { method: 'POST', body: JSON.stringify({ days }) });
}
export async function deleteBenchmark(kpiId: string, benchmarkId: string): Promise<void> {
  return api(`/kpis/${kpiId}/benchmarks/${benchmarkId}`, { method: 'DELETE' });
}

export interface LineageHop {
  type: string;
  id: string;
  via: string;
  edgeId: string;
}
export async function getLineageUpstream(type: string, id: string, depth = 1): Promise<LineageHop[]> {
  return api(`/lineage/${type}/${id}/upstream?depth=${depth}`);
}
export async function getLineageDownstream(type: string, id: string, depth = 1): Promise<LineageHop[]> {
  return api(`/lineage/${type}/${id}/downstream?depth=${depth}`);
}

export async function recomputeKpi(kpiId: string): Promise<{ value: number | null }> {
  return api(`/kpis/${kpiId}/recompute`, { method: 'POST', body: JSON.stringify({}) });
}

// =============================================================================
// KPI templates (marketplace)
// =============================================================================

export interface KpiTemplate {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: string;
  scorecardQuadrant: string | null;
  function: string | null;
  industry: string | null;
  unit: string | null;
  targetSummary: string | null;
  tags: string[];
  popularity: number;
  isGlobal: boolean;
}

export async function listTemplates(filters: { function?: string; search?: string } = {}): Promise<KpiTemplate[]> {
  const qs = new URLSearchParams();
  if (filters.function) qs.set('function', filters.function);
  if (filters.search) qs.set('search', filters.search);
  const s = qs.toString();
  return api(`/kpi-templates${s ? `?${s}` : ''}`);
}

export async function instantiateTemplate(id: string, body: { name?: string; targetValue?: number } = {}): Promise<KpiSummary> {
  return api(`/kpi-templates/${id}/instantiate`, { method: 'POST', body: JSON.stringify(body) });
}

// =============================================================================
// KPI formula, cascades, versions (detail-page Formula/Cascade/Audit tabs)
// =============================================================================

export interface FormulaExpr {
  id: string;
  kpiId: string;
  raw: string;
  createdAt: string;
}
export async function getFormula(kpiId: string): Promise<FormulaExpr | null> {
  return api(`/kpis/${kpiId}/formula`);
}
export async function putFormula(kpiId: string, raw: string): Promise<FormulaExpr> {
  return api(`/kpis/${kpiId}/formula`, { method: 'PUT', body: JSON.stringify({ raw }) });
}
export async function deleteFormula(kpiId: string): Promise<void> {
  return api(`/kpis/${kpiId}/formula`, { method: 'DELETE' });
}

export interface Cascade {
  id: string;
  parentKpiId: string;
  childKpiId: string;
  method: string;
  weight: number;
  level: number;
}
export async function listCascades(): Promise<Cascade[]> {
  return api('/kpi-cascades');
}
export async function attachCascade(body: { parentKpiId: string; childKpiId: string; method?: string; weight?: number }): Promise<Cascade> {
  return api('/kpi-cascades', { method: 'POST', body: JSON.stringify(body) });
}
export async function deleteCascade(id: string): Promise<void> {
  return api(`/kpi-cascades/${id}`, { method: 'DELETE' });
}

export interface CascadeTreeNode {
  parentKpiId: string;
  parentName: string;
  level: number;
  children: Array<{ childKpiId: string; childName: string; method: string; weight: number }>;
}
export async function getCascadeTree(): Promise<CascadeTreeNode[]> {
  return api('/kpi-cascades/all');
}

export interface KpiVersion {
  id: string;
  version: number;
  reason: string | null;
  createdAt: string;
  createdById: string | null;
}
export async function getKpiVersions(kpiId: string): Promise<KpiVersion[]> {
  return api(`/kpis/${kpiId}/versions`);
}
