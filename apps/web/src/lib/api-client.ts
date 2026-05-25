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
