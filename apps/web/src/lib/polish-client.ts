/**
 * P9 client helpers — global search, activity feed, SCIM tokens, retention,
 * SSO config. Thin wrappers over the shared `api()` fetch client.
 */
import { api } from './api-client';

// --- Search ---

export interface SearchResult {
  type: 'kpi' | 'dashboard' | 'user' | 'orgUnit';
  id: string;
  label: string;
  sublabel?: string;
  score: number;
}
export function globalSearch(q: string): Promise<SearchResult[]> {
  return api(`/search?q=${encodeURIComponent(q)}`);
}

// --- Activity ---

export interface ActivityItem {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}
export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null;
}
export function listActivity(params: { cursor?: string; entityType?: string; limit?: number } = {}): Promise<ActivityPage> {
  const sp = new URLSearchParams();
  if (params.entityType) sp.set('entityType', params.entityType);
  if (params.cursor) sp.set('cursor', params.cursor);
  if (typeof params.limit === 'number') sp.set('limit', String(params.limit));
  const q = sp.toString();
  return api(`/activity${q ? `?${q}` : ''}`);
}

// --- SCIM tokens ---

export interface ScimTokenRow {
  id: string;
  label: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
export function listScimTokens(): Promise<ScimTokenRow[]> {
  return api('/scim/tokens');
}
export function mintScimToken(label: string): Promise<{ id: string; token: string }> {
  return api('/scim/tokens', { method: 'POST', body: JSON.stringify({ label }) });
}
export function revokeScimToken(id: string): Promise<void> {
  return api(`/scim/tokens/${id}`, { method: 'DELETE' });
}

// --- Retention ---

export interface RetentionPolicyRow {
  id: string;
  entityType: string;
  days: number;
}
export function listRetention(): Promise<RetentionPolicyRow[]> {
  return api('/retention-policies');
}
export function listRetentionTiers(): Promise<Array<{ tier: string; days: number }>> {
  return api('/retention-policies/tiers/list');
}
export function applyRetentionTier(tier: string): Promise<RetentionPolicyRow[]> {
  return api('/retention-policies/apply-tier', { method: 'POST', body: JSON.stringify({ tier }) });
}

// --- SSO config ---

export interface SsoConfig {
  id: string;
  protocol: 'SAML' | 'OIDC';
  idpEntityId: string | null;
  idpSsoUrl: string | null;
  allowJitProvisioning: boolean;
  isActive: boolean;
}
export function getSsoConfig(): Promise<SsoConfig | null> {
  return api('/sso/config');
}
export function upsertSsoConfig(body: {
  protocol: 'SAML' | 'OIDC';
  idpEntityId?: string;
  idpSsoUrl?: string;
  allowJitProvisioning?: boolean;
  isActive?: boolean;
}): Promise<SsoConfig> {
  return api('/sso/config', { method: 'PUT', body: JSON.stringify(body) });
}
