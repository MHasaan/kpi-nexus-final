# Dependency and CodeQL recheck — 2026-11-06

The registry audit is a dependency-version scan, not proof of exploitability. `pnpm audit --prod --json` reports 58 advisories (4 critical, 17 high, 31 moderate, 6 low). The shared config package declares tooling as dependencies, so `--prod` also includes Vitest, Vite, ESLint and their parsers. These are not all request-path exposures. Major dependency migrations remain outside this closure.

| Advisory | Severity | Installed | Remedy version range | Classification |
|---|---|---|---|---|
| [esbuild: esbuild enables any website to send any requests to the development server and read the response](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | moderate | 0.21.5 | >=0.25.0 | Build/test/config dependency; no runtime entry point demonstrated |
| [vite: Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) | moderate | 5.4.21 | >=6.4.2 | Build/test/config dependency; no runtime entry point demonstrated |
| [uuid: uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | moderate | 8.3.2 | >=11.1.1 | Runtime dependency path; applicability review below |
| [esbuild: esbuild allows arbitrary file read when running the development server on Windows](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) | low | 0.28.0 | >=0.28.1 | Build/test/config dependency; no runtime entry point demonstrated |
| [vite: launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | moderate | 5.4.21 | >=6.4.3 | Build/test/config dependency; no runtime entry point demonstrated |
| [js-yaml: JS-YAML: Quadratic-complexity DoS in merge key handling via repeated aliases](https://github.com/advisories/GHSA-h67p-54hq-rp68) | moderate | 4.1.1 | >=4.2.0 | Build/test/config dependency; no runtime entry point demonstrated |
| [protobufjs: protobufjs : Schema-derived names can shadow runtime-significant properties](https://github.com/advisories/GHSA-f38q-mgvj-vph7) | moderate | 7.6.1 | >=7.6.3 | Runtime dependency path; applicability review below |
| [brace-expansion: brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | high | 5.0.6 | >=5.0.7 | Build/test/config dependency; no runtime entry point demonstrated |
| [js-yaml: js-yaml: YAML merge-key chains can force quadratic CPU consumption](https://github.com/advisories/GHSA-52cp-r559-cp3m) | high | 4.1.1 | >=4.3.0 | Build/test/config dependency; no runtime entry point demonstrated |
| [protobufjs: protobufjs: Denial of Service via infinite loop in .proto option parsing](https://github.com/advisories/GHSA-j3f2-48v5-ccww) | moderate | 7.6.1 | >=7.6.5 | Runtime dependency path; applicability review below |
| [brace-expansion: brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | high | 5.0.6 | >=5.0.8 | Build/test/config dependency; no runtime entry point demonstrated |
| [brace-expansion: brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | high | 5.0.6 | >=5.0.9 | Build/test/config dependency; no runtime entry point demonstrated |
| [js-yaml: JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 fix not backported](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | high | 4.1.1 | >=4.3.1 | Build/test/config dependency; no runtime entry point demonstrated |
| [vitest: When Vitest UI server is listening, arbitrary file can be read and executed](https://github.com/advisories/GHSA-5xrq-8626-4rwp) | critical | 1.6.1 | >=3.2.6 | Build/test/config dependency; no runtime entry point demonstrated |
| [deepmerge-ts: DeepmergeTS has stack exhaustion when merging recursive object graphs](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) | high | 7.1.5 | >=8.0.0 | Runtime dependency path; applicability review below |
| [postcss-selector-parser: postcss-selector-parser allows denial of service through uncontrolled AST recursion](https://github.com/advisories/GHSA-w9m9-85wc-3x92) | low | 6.1.2 | >=6.1.3 | Build/test/config dependency; no runtime entry point demonstrated |
| [@opentelemetry/core: OpenTelemetry Core: Unbounded memory allocation in W3C Baggage propagation](https://github.com/advisories/GHSA-8988-4f7v-96qf) | moderate | 1.30.1 | >=2.8.0 | Runtime dependency path; applicability review below |
| [js-yaml: js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources](https://github.com/advisories/GHSA-2883-xcg3-v3hh) | high | 4.1.1 | >=4.3.2 | Build/test/config dependency; no runtime entry point demonstrated |
| [brace-expansion: brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | moderate | 5.0.6 | >=5.0.12 | Build/test/config dependency; no runtime entry point demonstrated |
| [brace-expansion: brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | high | 5.0.6 | >=5.0.11 | Build/test/config dependency; no runtime entry point demonstrated |
| [brace-expansion: brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | high | 5.0.6 | >=5.0.10 | Build/test/config dependency; no runtime entry point demonstrated |
| [source-map-js: source-map-js allows event-loop denial of service through indexed source-map section offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | high | 1.2.1 | >=1.2.2 | Runtime dependency path; applicability review below |
| [@opentelemetry/instrumentation-pg: Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute](https://github.com/advisories/GHSA-qqmp-wf37-98f9) | moderate | 0.50.0 | >=0.73.0 | Runtime dependency path; applicability review below |
| [@opentelemetry/instrumentation-mysql2: Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute](https://github.com/advisories/GHSA-qqmp-wf37-98f9) | moderate | 0.45.0 | >=0.67.0 | Runtime dependency path; applicability review below |
| [@opentelemetry/instrumentation-knex: Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute](https://github.com/advisories/GHSA-qqmp-wf37-98f9) | moderate | 0.44.0 | >=0.65.0 | Runtime dependency path; applicability review below |
| [@opentelemetry/instrumentation-mysql: Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute](https://github.com/advisories/GHSA-qqmp-wf37-98f9) | moderate | 0.45.0 | >=0.67.0 | Runtime dependency path; applicability review below |
| [@opentelemetry/instrumentation-mongoose: Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute](https://github.com/advisories/GHSA-qqmp-wf37-98f9) | moderate | 0.46.0 | >=0.67.0 | Runtime dependency path; applicability review below |
| [@opentelemetry/instrumentation-tedious: Multiple @opentelemetry/instrumentation-* packages expose database username via unconditional db.user span attribute](https://github.com/advisories/GHSA-qqmp-wf37-98f9) | moderate | 0.18.0 | >=0.40.0 | Runtime dependency path; applicability review below |
| [fast-copy: fast-copy: Stack exhaustion in fast-copy when copying deeply-nested values](https://github.com/advisories/GHSA-jggr-w7fw-pc2j) | moderate | 4.0.3 | >=4.1.0 | Runtime dependency path; applicability review below |
| [tinypool: Tinypool: Prototype Pollution gadget in worker options leads to Remote Code Execution](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) | critical | 0.8.4 | >=2.1.1 | Build/test/config dependency; no runtime entry point demonstrated |
| [tinypool: Tinypool: Prototype Pollution Gadget to RCE in run() options](https://github.com/advisories/GHSA-85c8-ppgw-ccpr) | critical | 0.8.4 | >=2.1.2 | Build/test/config dependency; no runtime entry point demonstrated |
| [vite: launch-editor: escapeCmdArgs() omits % escaping on Windows](https://github.com/advisories/GHSA-698v-4r3x-3vcv) | moderate | 5.4.21 | >=6.4.4 | Build/test/config dependency; no runtime entry point demonstrated |
| [vite: launch-editor: Editor CLI flag misinterpretation causing arbitrary command execution for some editors](https://github.com/advisories/GHSA-r825-w8mm-5pxw) | moderate | 5.4.21 | >=6.4.4 | Build/test/config dependency; no runtime entry point demonstrated |
| [vite: launch-editor: `fs.existsSync()` existence check can be bypassed on Windows](https://github.com/advisories/GHSA-587h-7wmj-h5pm) | high | 5.4.21 | >=6.4.4 | Build/test/config dependency; no runtime entry point demonstrated |
| [vite: Vite: Cross origin script execution through Vite custom middleware](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) | low | 5.4.21 | >=6.4.4 | Build/test/config dependency; no runtime entry point demonstrated |
| [vite: Vite: Files outside `server.fs.allow` could be served when project paths match system paths on non-Windows machine](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) | moderate | 5.4.21 | >=6.4.4 | Build/test/config dependency; no runtime entry point demonstrated |
| [next: Next.js: Unauthenticated Remote Code Execution in Image Optimization API when SVG files are used](https://github.com/advisories/GHSA-2464-fhr4-w9xw) | critical | 15.5.27 | >=15.5.28 | Runtime dependency path; applicability review below |
| [next: Next.js: Denial of Service in App Router using Server Actions](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) | high | 15.5.27 | >=15.5.28 | Runtime dependency path; applicability review below |
| [fastify: fastify is vulnerable to header validation bypass via case-sensitive propertyNames](https://github.com/advisories/GHSA-389g-gv7q-r4x8) | low | 5.12.5 | >=5.12.6 | Runtime dependency path; applicability review below |
| [zod: Zod can exhaust memory while validating oversized constrained collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | high | 3.25.76 | >=4.6.6 | Runtime dependency path; applicability review below |
| [undici: undici vulnerable to Denial of Service via unbounded memory in the EventSource parser](https://github.com/advisories/GHSA-4qv8-2p9j-2685) | moderate | 7.30.0 | >=7.30.1 | Runtime dependency path; applicability review below |
| [undici: undici vulnerable to Subresource Integrity bypass via non-lowercase algorithm tokens](https://github.com/advisories/GHSA-f72v-6w45-q472) | moderate | 7.30.0 | >=7.30.1 | Runtime dependency path; applicability review below |
| [nodemailer: Nodemailer: A nested comment ends early in addressparser, releasing the rest of the comment as a recipient](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8) | moderate | 10.0.13 | >=10.1.4 | Runtime dependency path; applicability review below |
| [nodemailer: Nodemailer: A ";" inside a quoted string or comment ends an address group early in addressparser, turning display text into a recipient](https://github.com/advisories/GHSA-m943-m63m-w62w) | moderate | 10.0.13 | >=10.1.4 | Runtime dependency path; applicability review below |
| [nodemailer: Nodemailer: A ">" inside a quoted local part ends an angle-addr early in addressparser, delivering to a domain the header does not name](https://github.com/advisories/GHSA-85x2-q946-cp5h) | moderate | 10.0.13 | >=10.1.4 | Runtime dependency path; applicability review below |
| [fast-uri: fast-uri vulnerable to URI scheme spoofing via percent-encoded scheme decoding](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) | moderate | 3.1.8 | >=3.1.9 | Runtime dependency path; applicability review below |
| [fast-uri: fast-uri vulnerable to improper path equivalence in relative reference normalization](https://github.com/advisories/GHSA-xhq7-xmqj-769h) | low | 3.1.8 | >=3.1.9 | Runtime dependency path; applicability review below |
| [fast-uri: fast-uri vulnerable to host confusion via unchecked WHATWG host canonicalization](https://github.com/advisories/GHSA-wjr9-j795-jxcr) | moderate | 3.1.8 | >=3.1.9 | Runtime dependency path; applicability review below |
| [fast-uri: fast-uri vulnerable to scheme injection via an unescaped first-segment colon in suffix references](https://github.com/advisories/GHSA-333x-w4r6-6crp) | low | 3.1.8 | >=3.1.9 | Runtime dependency path; applicability review below |
| [undici: undici vulnerable to Denial of Service via unhandled error on excessive content-encodings](https://github.com/advisories/GHSA-xjj6-f33q-929c) | high | 7.30.0 | >=7.30.1 | Runtime dependency path; applicability review below |
| [postcss-selector-parser: PostCSS: Quadratic complexity in flat selector parsing allows CPU exhaustion](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | moderate | 6.1.2 | >=6.1.5 | Build/test/config dependency; no runtime entry point demonstrated |
| [vite: vite: `server.fs.deny` bypass on Windows alternate paths](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | moderate | 5.4.21 | >=6.4.3 | Build/test/config dependency; no runtime entry point demonstrated |
| [undici: undici vulnerable to cache poisoning and cross-user disclosure via cross-origin redirects](https://github.com/advisories/GHSA-4w7w-5xrc-9h26) | high | 7.30.0 | >=7.30.1 | Runtime dependency path; applicability review below |
| [undici: undici vulnerable to TLS certificate validation bypass via dropped tls options in Agent](https://github.com/advisories/GHSA-2m5v-pch6-74hx) | high | 7.30.0 | >=7.30.1 | Runtime dependency path; applicability review below |
| [undici: undici vulnerable to Denial of Service via TLS 1.2 certificate-changing renegotiation](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm) | high | 7.30.0 | >=7.30.1 | Runtime dependency path; applicability review below |
| [undici: undici WebSocket client vulnerable to Denial of Service via unbounded automatic PONG buffering](https://github.com/advisories/GHSA-9fm3-97px-rjf6) | moderate | 7.30.0 | >=7.30.1 | Runtime dependency path; applicability review below |
| [undici: undici vulnerable to Denial of Service via unhandled exception in the decompress interceptor](https://github.com/advisories/GHSA-55wc-3pg8-jfw6) | moderate | 7.30.0 | >=7.30.1 | Runtime dependency path; applicability review below |
| [minimatch: minimatch has potential denial of service via globparts amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) | moderate | 10.2.5 | >=11.0.1 | Build/test/config dependency; no runtime entry point demonstrated |

## Existing CodeQL findings

GitHub code-scanning API queried freshly: five open alerts. None was dismissed or hidden.

| Alert | Location | Applicability and remedy |
|---|---|---|
| [5](https://github.com/MHasaan/kpi-nexus-final/security/code-scanning/5) | `apps/web/e2e/p9-polish.spec.ts` | Synthetic test-user password, not production credential generation. Optional cleanup: use crypto randomUUID for uniqueness. |
| [4](https://github.com/MHasaan/kpi-nexus-final/security/code-scanning/4) | `apps/api/test/integration/jira-webhook.spec.ts` | Random webhook secret exists only in a disposable test org. Optional cleanup: crypto.randomBytes for fixture generation. Production incoming signature verification is covered by separate regressions. |
| [2](https://github.com/MHasaan/kpi-nexus-final/security/code-scanning/2) | `apps/api/test/integration/kpi-data-scope.spec.ts` | Synthetic test credential/fixture uniqueness; optional crypto.randomUUID cleanup. |
| [1](https://github.com/MHasaan/kpi-nexus-final/security/code-scanning/1) | `apps/api/test/integration/invitation.spec.ts` | Synthetic test password, not production randomness. Optional crypto.randomUUID cleanup. |
| [3](https://github.com/MHasaan/kpi-nexus-final/security/code-scanning/3) | `apps/api/src/api-keys/api-keys.service.ts:34` | SHA-256 hashes machine-generated API keys with 24 cryptographically random bytes (192 bits), not human passwords. Slow password hashing is unnecessary for this entropy; keep indexed digest lookup. If accepting user-chosen keys ever becomes possible, reassess. |

## Runtime applicability

- Next.js 15.5.27 has two flagged advisories. The existing sharp override meets the vendor's SVG image optimization workaround. The source has no Server Actions. Next.js 15.5.28 is the vendor patch for both.
- Fastify, fast-uri, Undici and Nodemailer have compatible release lines with patches listed above. Fastify serves API traffic and Undici sends outbound requests. The outbound helper uses manual redirects and does not use the WebSocket, EventSource or cache interceptors. Invitation and scheduled-report recipient inputs use email validation. These observations narrow applicability and do not certify the affected versions as safe.
- Zod validates API request payloads. The Fastify request body limit bounds input size, but version remediation requires the separately scoped Zod 4 migration.
- Sentry initializes only when configured. Its transitive OpenTelemetry packages include affected baggage and database instrumentation. Review the configured propagation and telemetry exposure before upgrading Sentry and OpenTelemetry together.
- Prisma configuration, build-time CSS/source maps and test tooling have no demonstrated public input path in this project. ExcelJS calls UUID v4, outside the advisory's v3/v5/v6 calls with caller buffers. The configured tracing exporter is OTLP over HTTP and has no user-controlled protobuf schema.
- This recheck records version remedies. Dependency pins were not changed in the email or audit tooling commits. The existing GitHub advisory job is nonblocking, so a green Security workflow does not clear these advisory results.

## Update — 2026-11-11: in-major patches applied

Raised floors so the affected releases can no longer resolve: next 15.5.29 (covers the image-optimization RCE and Server Actions DoS advisories), undici 7.30.2, nodemailer 10.5.0, fastify 5.12.8 (dependency and root override) and fast-uri 3.1.9 (override). No major version moved; the lockfile otherwise only re-keyed ESLint's optional `jiti` peer and dropped `toad-cache`, which fastify 5.12.8 no longer uses.

`pnpm audit --prod` now reports **40 advisories (3 critical, 12 high, 22 moderate, 3 low)**, down from 58. None of the five patched packages is flagged. What remains, per the classification above:

| Package | Advisories | Status |
|---|---|---|
| vitest, tinypool, vite, esbuild | 3 critical, 1 high, 7 moderate, 2 low | Test/build tooling in the shared config package; needs the Vitest 4 migration (deferred PR #18) |
| brace-expansion, js-yaml, minimatch, postcss-selector-parser, source-map-js | 9 high, 4 moderate, 1 low | Build/lint/config tooling; no runtime entry point demonstrated |
| zod | 1 high | Request validation; fix requires the deferred Zod 4 migration (PR #20) |
| deepmerge-ts, fast-copy, uuid, protobufjs | 1 high, 4 moderate | Transitive runtime paths reviewed above; no reachable input demonstrated |
| @opentelemetry/core and six instrumentation packages | 7 moderate | Sentry/OpenTelemetry upgrade to be reviewed together (Dependabot #43) |
