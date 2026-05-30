/**
 * P8 integrations API helpers — connections, connectors, plugins. Thin typed
 * wrappers over the shared `api()` fetch client.
 */
import { api } from './api-client';

// --- Integration connections ---

export interface IntegrationConnection {
  id: string;
  provider: string;
  displayName: string | null;
  scopes: string[];
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
}
export function listIntegrations(): Promise<IntegrationConnection[]> {
  return api('/integrations');
}
export function connectIntegration(body: {
  provider: string;
  displayName?: string;
  tokens: Record<string, unknown>;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}): Promise<IntegrationConnection> {
  return api('/integrations', { method: 'POST', body: JSON.stringify(body) });
}
export function disconnectIntegration(id: string): Promise<void> {
  return api(`/integrations/${id}`, { method: 'DELETE' });
}

// --- Connectors ---

export type ConnectorType = 'REST' | 'GRAPHQL' | 'POSTGRES' | 'MYSQL' | 'S3' | 'GCS' | 'WEBHOOK';

export interface Connector {
  id: string;
  name: string;
  type: ConnectorType;
  config: Record<string, unknown>;
  schedule: string | null;
  isActive: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}
export function listConnectors(): Promise<Connector[]> {
  return api('/connectors');
}
export function getConnector(id: string): Promise<Connector> {
  return api(`/connectors/${id}`);
}
export function createConnector(body: {
  name: string;
  type: ConnectorType;
  config: Record<string, unknown>;
  schedule?: string;
  isActive?: boolean;
}): Promise<Connector> {
  return api('/connectors', { method: 'POST', body: JSON.stringify(body) });
}
export function deleteConnector(id: string): Promise<void> {
  return api(`/connectors/${id}`, { method: 'DELETE' });
}
export function runConnector(id: string): Promise<{ status: string; rowCount: number; jobId: string; error?: string }> {
  return api(`/connectors/${id}/run`, { method: 'POST' });
}
export function listConnectorRuns(id: string): Promise<Array<{ id: string; kind: string; status: string; createdAt: string }>> {
  return api(`/connectors/${id}/runs`);
}

// --- Plugins ---

export type PluginType = 'WIDGET' | 'TEMPLATE' | 'FORMULA_FN' | 'CONNECTOR';

export interface Plugin {
  id: string;
  name: string;
  type: PluginType;
  version: string;
  entryUrl: string;
  description: string | null;
  isEnabled: boolean;
}
export function listPlugins(): Promise<Plugin[]> {
  return api('/plugins');
}
export function installPlugin(body: {
  name: string;
  type: PluginType;
  version: string;
  entryUrl: string;
  description?: string;
}): Promise<Plugin> {
  return api('/plugins', { method: 'POST', body: JSON.stringify(body) });
}
export function setPluginEnabled(id: string, isEnabled: boolean): Promise<Plugin> {
  return api(`/plugins/${id}`, { method: 'PATCH', body: JSON.stringify({ isEnabled }) });
}
export function deletePlugin(id: string): Promise<void> {
  return api(`/plugins/${id}`, { method: 'DELETE' });
}
