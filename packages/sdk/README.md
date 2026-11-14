# @kpi-nexus/sdk

Typed client for the KPI Nexus API, generated from `apps/api/openapi.json`.

```ts
import { createKpiNexusClient } from '@kpi-nexus/sdk';

const api = createKpiNexusClient({ baseUrl: 'https://api.example.com', token: accessToken });

const { data, error } = await api.GET('/kpis/{id}/data', { params: { path: { id: kpiId } } });
await api.POST('/kpis/{id}/data', {
  params: { path: { id: kpiId } },
  body: { value: 42, periodStart: '2026-11-01T00:00:00Z', periodEnd: '2026-11-30T23:59:59Z' },
});
```

Paths, path parameters and request bodies are checked at compile time. Each
operation's required permissions are listed in the document as
`x-required-permissions`.

## Regenerating

The API serves its document at `/api/v1/openapi.json`. With the API running:

```bash
pnpm openapi:export   # writes apps/api/openapi.json
pnpm openapi:lint     # Spectral
pnpm sdk:regenerate   # writes packages/sdk/src/schema.d.ts
```

CI fails if either generated file is out of date.
