/**
 * Onboarding API client. The onboarding flow is PUBLIC (pre-auth) and gated by
 * a per-session draft token sent as `X-Draft-Token`, so these calls use
 * `auth: false` + the header rather than the bearer token. The draft handle
 * ({sessionId, draftToken}) is cached in localStorage so a session survives a
 * browser crash / reload (the "draft survives crash" exit criterion).
 */
import { api } from './api-client';

const DRAFT_KEY = 'kpi-nexus.onboarding-draft';

export interface OnboardingStart {
  sessionId: string;
  draftToken: string;
}

export interface DraftPayload {
  organization?: { name?: string; industry?: string; type?: string; sizeTier?: string };
  roles?: unknown[];
  positions?: unknown[];
  orgUnitTypes?: unknown[];
  orgUnits?: unknown[];
  kpiCategories?: unknown[];
  kpis?: unknown[];
}

export interface DraftView {
  sessionId: string;
  status: string;
  lastEditedStep: string | null;
  payload: DraftPayload;
}

export interface TemplateSummary {
  slug: string;
  name: string;
  description: string | null;
  tier: string;
  counts: { roles: number; positions: number; orgUnits: number; kpis: number; kpiCategories: number };
}

export interface CachedDraft extends OnboardingStart {
  organizationName: string;
}

function draftHeaders(token: string): Record<string, string> {
  return { 'x-draft-token': token };
}

export function listTemplates(): Promise<TemplateSummary[]> {
  return api<TemplateSummary[]>('/org-templates', { auth: false });
}

export function startOnboarding(email: string, organizationName: string, entryMode?: string): Promise<OnboardingStart> {
  return api<OnboardingStart>('/onboarding/start', {
    auth: false,
    method: 'POST',
    body: JSON.stringify({ email, organizationName, entryMode }),
  });
}

export function getDraft(sessionId: string, token: string): Promise<DraftView> {
  return api<DraftView>(`/onboarding/${sessionId}`, { auth: false, headers: draftHeaders(token) });
}

export function patchDraft(sessionId: string, token: string, patch: Record<string, unknown>, lastEditedStep?: string): Promise<{ payload: DraftPayload }> {
  return api(`/onboarding/${sessionId}`, {
    auth: false,
    method: 'PUT',
    headers: draftHeaders(token),
    body: JSON.stringify({ patch, lastEditedStep }),
  });
}

export function applyTemplate(sessionId: string, token: string, slug: string): Promise<{ payload: DraftPayload }> {
  return api(`/onboarding/${sessionId}/apply-template`, {
    auth: false,
    method: 'POST',
    headers: draftHeaders(token),
    body: JSON.stringify({ slug }),
  });
}

export interface CompletePayload {
  adminEmail: string;
  adminPassword: string;
  adminFullName: string;
  slug: string;
}

export function completeOnboarding(sessionId: string, token: string, body: CompletePayload): Promise<{ accessToken: string; refreshToken: string }> {
  return api(`/onboarding/${sessionId}/complete`, {
    auth: false,
    method: 'POST',
    headers: draftHeaders(token),
    body: JSON.stringify(body),
  });
}

export interface GenerateResult {
  interactionId: string;
  counts: { roles: number; positions: number; orgUnitTypes: number; orgUnits: number; kpiCategories: number; kpis: number };
}

export function aiGenerate(sessionId: string, token: string, prompt: string): Promise<GenerateResult> {
  return api('/onboarding/ai/generate', {
    auth: false,
    method: 'POST',
    headers: draftHeaders(token),
    body: JSON.stringify({ sessionId, prompt }),
  });
}

export function aiApply(
  sessionId: string,
  token: string,
  interactionId: string,
  appliedSections: string[],
  rejectedSections: string[] = [],
): Promise<{ applied: string[] }> {
  return api('/onboarding/ai/apply', {
    auth: false,
    method: 'POST',
    headers: draftHeaders(token),
    body: JSON.stringify({ sessionId, interactionId, appliedSections, rejectedSections }),
  });
}

/** Assistant mode: an RFC 6902 patch against the draft (applied client-side, see lib/copilot). */
export function aiAssistant(sessionId: string, token: string, instruction: string): Promise<{ interactionId: string; patch: unknown[] }> {
  return api('/onboarding/ai/assistant', {
    auth: false,
    method: 'POST',
    headers: draftHeaders(token),
    body: JSON.stringify({ sessionId, instruction }),
  });
}

export function aiSuggest(sessionId: string, token: string, fieldPath: string, context?: string): Promise<{ interactionId: string; suggestions: string[] }> {
  return api('/onboarding/ai/suggest', {
    auth: false,
    method: 'POST',
    headers: draftHeaders(token),
    body: JSON.stringify({ sessionId, fieldPath, ...(context ? { context } : {}) }),
  });
}

export function aiExplain(sessionId: string, token: string, fieldPath: string): Promise<{ interactionId: string; explanation: string }> {
  return api('/onboarding/ai/explain', {
    auth: false,
    method: 'POST',
    headers: draftHeaders(token),
    body: JSON.stringify({ sessionId, fieldPath }),
  });
}

// ---- localStorage draft handle (resume across reload/crash) ----

export function cacheDraft(d: CachedDraft): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
}

export function readCachedDraft(): CachedDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null') as CachedDraft | null;
  } catch {
    return null;
  }
}

export function clearCachedDraft(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DRAFT_KEY);
}
