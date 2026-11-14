// Writes the running API's OpenAPI document to apps/api/openapi.json (committed;
// CI fails if it drifts from the routes). API_URL defaults to localhost:4000.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
const res = await fetch(`${apiUrl}/api/v1/openapi.json`);
if (!res.ok) {
  console.error(`GET /api/v1/openapi.json → ${res.status}`);
  process.exit(1);
}
const doc = await res.json();
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'openapi.json');
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`wrote ${out}: ${Object.keys(doc.paths).length} paths`);
