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
  return api(`/snapshots/${snapshotId}`);
}

export async function deleteSnapshot(snapshotId: string): Promise<void> {
  return api(`/snapshots/${snapshotId}`, { method: 'DELETE' });
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
