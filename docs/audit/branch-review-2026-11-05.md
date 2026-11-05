# Branch integration ledger — 2026-11-05

## Baseline and recovery

- Approved plan: carefully verify and integrate relevant branches, safe updates first, GitHub main via individual PRs.
- Initial main: `50d3b7ac463c0d242b2e50a81ade05a68e1db9a3`.
- Backup tag: `backup/pre-branch-review-2026-11-05`.
- Verified local full-history bundle: original checkout `.cache/pre-branch-review-2026-11-05.bundle`.
- Isolated worktree: `branch-review`; original app/database/environment untouched.
- Before any merge: exact-head checks and review. After merge: `git revert -m 1 <merge-sha>` through a rollback PR; never reset/force-push main.
- Prerequisite 1 RED: fresh frozen install followed by uncached DB build fails TS2305 (missing generated Prisma exports), matching hosted run 41858017448. No existing generated client or build cache used.
- Prerequisite 1 change: generate Prisma after install in the CI Node matrix. No schema/database changes.
- Hosted baseline CI fails test/build/typecheck and integration; latest Security succeeds.
- Local baseline from previous setup: typechecks/builds/lint and 1,854 TS/JS unit + 48 ML + 133 integration passed; historical evidence only. Three integration skips documented by suite.

## Dispositions

All 17 feat/phase/audit tips below are ancestors of initial main: no missing progress.

| PR | Disposition |
|---|---|
| 1, 2, 4 | Superseded: pnpm v6, artifact v7, setup-node v7 already on main |
| 23, 24 | Superseded: every direct NestJS/OpenTelemetry target equals or trails main; diffs contain only manifests/generated lockfile changes. Preserve main’s newer versions and security overrides. |
| 5 | Partial: replace remaining checkout v4 with main's v7, never downgrade existing v7 |
| 3 | Integrated by PR #31: CodeQL v4; exact source commit retained |
| 10 | Integrated by PR #32: dotenv1.2.2; source commit retained |
| 7 | Candidate: statsmodels 0.14.6 |
| 11 | Candidate: FastAPI 0.136.3, only if compatible without major migration |
| 6, 8, 9 | Deferred: Python/scientific-stack majors |
| 12, 14, 15, 16, 17, 18, 19, 20 | Deferred: framework/client/compiler/lint/validation migrations or runtime mismatch |

No manual closure of superseded/deferred PRs or branch deletions is authorized by this plan. Accepted candidates are integrated through normal PR merges.

## Exact initial remote tips

```text
origin 50d3b7ac463c0d242b2e50a81ade05a68e1db9a3
origin/dependabot/docker/apps/ml/python-3.14-slim fae1f4fe0596783e66e9d01afd26989718bb110d
origin/dependabot/github_actions/actions/checkout-6 158d9e2120669ae0660841055ddaca79ed667bea
origin/dependabot/github_actions/actions/setup-node-6 9b3b113c0854bce5ba0b3b5e4e64a25b84abc11f
origin/dependabot/github_actions/actions/upload-artifact-7 7adac1770511abc279c87dc79ce9e55919186b1b
origin/dependabot/github_actions/github/codeql-action-4 12c975224d71fb0e547696aab84addedcb27376e
origin/dependabot/github_actions/pnpm/action-setup-6 8fa691101272184352091aaacf4215b99a58115f
origin/dependabot/npm_and_yarn/eslint-10.4.0 deecb2b9957d8a2044a9c3141458dfb04d268853
origin/dependabot/npm_and_yarn/eslint/js-10.0.1 3df8e42f65089b27ae46866bbdff6c67ab710454
origin/dependabot/npm_and_yarn/nestjs-0cecc97cdf bc4694c4cf14b90b9ad223b6978acda46d0f5ab9
origin/dependabot/npm_and_yarn/next-d35b2cbc55 42d687d3928bacf34e09248b36309d495e0ebaec
origin/dependabot/npm_and_yarn/opentelemetry-d6355199e5 8f8f4440836195548058ba8983980dd186f1aa2c
origin/dependabot/npm_and_yarn/prisma-ae68fa5e13 f36a56c8563011b51ff7cdbd49cad00e2c42632f
origin/dependabot/npm_and_yarn/types/node-25.9.1 576f675878c476dcc298b571a003df38a48ccc4e
origin/dependabot/npm_and_yarn/typescript-6.0.3 952be12602f853ff9520c293304ea52ab9845919
origin/dependabot/npm_and_yarn/vitest/coverage-v8-4.1.7 5c3fcd10a80436513c74d9a514d7480ae9fb5e3a
origin/dependabot/npm_and_yarn/zod-4.4.3 a14d3f0247b26f802bc36334020e2b14c33551c7
origin/dependabot/pip/apps/ml/fastapi-0.136.3 81ed1e1677e07f46c78a347afe3c84b00b650ffb
origin/dependabot/pip/apps/ml/numpy-2.4.6 a584e584f3e97bfea460944e8d1058249f9fbc1e
origin/dependabot/pip/apps/ml/pandas-3.0.3 6088cfa99630390d7b1abe19e6f7f5dbee8a3f2e
origin/dependabot/pip/apps/ml/python-dotenv-1.2.2 b89e20757490da2990acf8edebb90e8cb07787b2
origin/dependabot/pip/apps/ml/statsmodels-0.14.6 686cd5dc52239ab2b20a075e402f5905345d72b6
origin/feat/access-roadmap-phases 5a88317aa13c6682989f8b1505b3a49f8a0e7591
origin/feat/ai-improvements ef518606c9a7ff0a0c96adccd42f21c3064fcbb4
origin/feat/dashboards-pages 65a2e6207a0139c279a7eb2b55c3e892f98d1b48
origin/feat/frontend-design 4e4d8a841342b932da45d635e244aa967a587f42
origin/feat/kpi-pages f81753f3aa32a0b26695d136eadd6e0c8d412923
origin/feat/okrs-tasks-pages 2971f872e263a8fee06064be356e23eb6f912a0b
origin/feat/user-settings-page 00a237564e8ad4b1e50d4f30aa6b1c7d1e36bbda
origin/fix/full-audit d10e492cf1c5ce9bdfaa7cca0a6803cabdb8c80f
origin/main 50d3b7ac463c0d242b2e50a81ade05a68e1db9a3
origin/phase/p1-identity b23ae416e715f351f2b8f8c6dcbd5b5a0bb4e718
origin/phase/p2-kpi-engine 6e873d3141345e839eaaf876e4919ace0e41391b
origin/phase/p3-visualization f5c329c5b136a757ec7ff7c8b373109d64115f6f
origin/phase/p4-alerting 9a8030308f5790000e6f4d5157625555c1814f5b
origin/phase/p5-ai-layer 7fd4eb665128ca902c7bba88c57eb3fcdd455d00
origin/phase/p6-onboarding a82962cb898ed115a564ac016a29b1c7b1088c10
origin/phase/p7-collaboration 45926d9d6ccb998501171fbc4a1a65b9dbc81a7b
origin/phase/p8-integrations d4d40a730ee91c5c42e8536c84d757c0691ff1a1
origin/phase/p9-polish 6a53a6e7030e5300c740c637213ad3ed8c1814d1
```

## Execution

Prisma-generation prerequisite: local GREEN — frozen clean install; generated client; uncached lint/typecheck/test/build, 32 tasks successful, 1,854 TS/JS tests. Hosted PR #26: all Node jobs and Security passed; integration failed on the independently reproduced Plan RLS bug. Merged as prerequisite with merge commit `a9de8a1a3331aa1b5322f074f87e90aba0a81dc7`; rollback: `git revert -m 1 a9de8a1a3331aa1b5322f074f87e90aba0a81dc7`. Main post-merge Security passed and CI retains the same known Plan integration limitation. Existing import-order warnings remain; no lint errors.

Ruling: current remote inventory contains 17 work branches (7 feat + 9 phase + 1 audit), not the handoff’s 18. All are ancestors; no code omitted.

## Additional prerequisite: CI report storage

PR #27 proves billing fresh-DB initialization passes in hosted CI; its integration suite now fails only scheduled-report upload: ECONNREFUSED 127.0.0.1:9000. CI never started S3. Add the same pinned SeaweedFS gateway and read-only credential config used by local compose, waiting for its authenticated gateway (anonymous 403) before tests.

Ruling: fix missing CI infrastructure in a separate prerequisite PR before finishing #27. No dependency candidate merges until main CI and Security are fully green. The independent Plan failure remains expected on the infrastructure-only branch. No application/schema/policy changes.

CI storage validation: exact gateway command on separate port 29000 passed anonymous-403 readiness, authenticated upload, and presigned content download. Independent review approved. Separate billing branch also passes 174 local Chrome browser tests (zero retries), with only the opt-in audit crawler skipped; 133 live integration tests + 3 intentional skips; all workspace and 48 ML tests pass. PR #27 hosted fresh-DB regression succeeds; only report upload fails because CI had no S3 service.

## Additional prerequisite: supported Playwright runner

Combined billing/storage PR #27 head d5cf864 passes fresh-DB regression and all API integration tests in hosted run 41871015000. Browser installation then fails explicitly: Playwright 1.60.0 does not support ubuntu26.04-x64 (ubuntu-latest). Pin only web-e2e to ubuntu-24.04, supported by the existing pinned browser package. No Playwright/framework upgrade or application change. Existing integration-only Plan failure remains expected on this infrastructure-only branch until #27 is merged.

## Billing prerequisite — completed (historical execution record)

- Isolated Docker project `kpi-review`, separate ports 15432/16379 and its own volumes. No development DB access.
- RED: empty Plan catalog count 0; registration 201; first KPI POST 500. Unit test also rejects catalog initialization under tenant context.
- Fix: initialize the global catalog in explicit system context, preserving request-role read-only policies and restoring tenant context.
- Added dedicated opt-in fresh-DB suite before normal CI integration tests: concurrent first KPI creation, idempotent three-plan catalog, request-role write rejection, cross-tenant 404/list isolation. Does not truncate or delete any database data.
- Existing catalogs remain unchanged. GREEN: 2 unit regressions; fresh-DB concurrent/privilege/isolation regression; 133 integration passed + 3 intentional alerting skips; all 32 uncached workspace checks (1,856 TS/JS tests), 48 ML tests. Independent code review approved. Initial integration harness failures were traced to unmapped scratch SMTP/S3 ports and resolved in ignored test configuration only. Browser and hosted checks pending.

Storage prerequisite #28 merged as `68955cf20cb54a378e66980431e5a9a14231870b`; rollback: `git revert -m 1 68955cf20cb54a378e66980431e5a9a14231870b`. All relevant checks/Security passed; remaining integration failure was confirmed Plan RLS only. Incorporated into billing PR #27; documentation-only conflict resolved preserving both verification histories. Billing browser validation: 174 passed, one explicit audit-crawler skip, zero retries. Hosted combined baseline checks pending.

Runner prerequisite #29 merged as `018b896563c3c509ad626a4f2f1ef8df34df4896`; rollback: `git revert -m 1 018b896563c3c509ad626a4f2f1ef8df34df4896`. Relevant Node/Security checks green; only known independent Plan failure remained. Billing PR refreshed against this main; documentation-only conflict resolved preserving both histories.

Recovery proof: backup tag also pushed to GitHub. In a separate /tmp clone, reversing #28 then #26 via recorded merge-revert commands restores the exact original `50d3b7a` tree. No working checkout/database was modified by the exercise.

## Verified green baseline and first dependency trial

- Billing #27 merged as `d69c04ee3ef4638dd12337cdd6ee1ab4b88085f8`; rollback `git revert -m 1 d69c04ee3ef4638dd12337cdd6ee1ab4b88085f8`.
- Exact resulting main CI [41874623263](https://github.com/MHasaan/kpi-nexus-final/actions/runs/41874623263) and Security [41874623698](https://github.com/MHasaan/kpi-nexus-final/actions/runs/41874623698) both SUCCESS. Dependency gate satisfied only now.
- OT-007 closed with actual hosted evidence: Prisma generation, scoped global Plan initialization, S3 test storage, supported browser runner.
- First candidate: replacement for PR #5 (head `158d9e2120669ae0660841055ddaca79ed667bea`). Main already uses checkout v7 in CI/audit; only two security v4 refs are upgraded to v7. Original v6 branch is not merged because it would downgrade existing v7 refs. No package or application changes.
- Python baseline resolved versions captured separately for reproducible rollback. The existing optional statsmodels0.14.4/SciPy1.17 import incompatibility is recorded for candidate #7; currently implemented ML routes and tests pass.

Checkout replacement local validation: frozen install + generation + all 32 uncached workspace tasks pass (1,856 TS/JS tests). Independent review approved; no application/DB/permission/dependency changes. Hosted candidate checks pending. Original ML Dockerfile baseline image built successfully as `kpi-review-ml:baseline`.

## Checkout replacement complete; CodeQL trial

- Replacement PR #30 merged as `f7b8336ab5af38e49e675b4c90391c8eb3055efa`; rollback: `git revert -m 1 f7b8336ab5af38e49e675b4c90391c8eb3055efa`.
- Exact candidate CI41891515703/Security41891515726 and resulting main CI41892608202/Security41892608384 all SUCCESS. Verified all five merged changes can be reversed in a temporary clone to restore exact initial50d3b7a tree.
- CodeQL source PR #3 refreshed at `12c975224d71fb0e547696aab84addedcb27376e`: only init/analyze v3→v4. Trial based on verified main. Adjacent-line conflict resolved by preserving all main checkout v7 references and applying only the two CodeQL updates.
- Official compatibility: [CodeQL v4 release notice](https://github.blog/changelog/2025-10-28-upcoming-deprecation-of-codeql-action-v3/) uses Node24, already supported by this repository’s working checkout/setup actions and hosted runners. No application/package/schema/permission changes.
- Baseline ML container: original Dockerfile build succeeds; 48 container tests and 36 real HTTP/HMAC/edge probes pass, with identical resolved application dependency versions to the recorded Python baseline.
- CodeQL local validation: frozen install/generation + all32uncached workspace tasks pass (1856TS/JS tests); independent review approved. Exact-head hosted validation pending. Repository automatic branch deletion confirmed disabled; superseded/deferred branches remain untouched.

CodeQL trial security finding: merging the old source branch widened Gitleaks’ first-parent range to 244 historical commits. It flagged a dummy password used only to provision synthetic .test.local users in commit6c4284d (already an ancestor of main). Checksum-verified CI scanner8.24.3 reproduced exactly one fingerprint. Added only `6c4284d5e20012a6b0cbda73898a7c62ef124064:apps/web/e2e/permission-nav.spec.ts:generic-api-key:147` to .gitleaksignore, with no rule/path-wide exemptions or history rewrite. Exact-range scan passes; a fresh unprefixed synthetic generic-api-key in a different file remains detected (exit2, one finding). The first explicitly test-labelled positive-control fixture was not detected by default heuristics and was replaced; no success claim relies on it. Independent security review independently reproduced all three outcomes. Updated-head hosted CI and Security remain required before merge.

## CodeQL complete; dotenv trial

- CodeQL PR #31 merged as `6716540a419b71efb7619d797dc90c3fb969ef95`; rollback: `git revert -m 1 6716540a419b71efb7619d797dc90c3fb969ef95`. Exact reviewed head68d01f0 CI41895663658/Security41895663423 and resulting main CI41896668463/Security41896668609 all SUCCESS. Both CodeQL v4 language jobs executed successfully.
- Post-merge local scan: 244 historical commits, zero findings. All six merges reversed in a temporary clone restore exact initial50d3b7a tree. Local integration133passed/3intentional skips. Browser167passed/8skipped initially because ignored runner env omitted ML port; reran all7ML cases with correct sidecar port, all7passed. Only opt-in audit crawler remains uncovered.
- Dotenv source PR #10 refreshed at `b89e20757490da2990acf8edebb90e8cb07787b2`; trial from verified6716540. Only requirements pin1.0.1→1.2.2. [Official changelog](https://github.com/theskumar/python-dotenv/blob/v1.2.2/CHANGELOG.md): removed oldPython support and changed symlink editing behavior; project runsPython3.12 and has no file-mutating dotenv calls. Optional consumer is uvicorn env-file loading. No schema/API changes.
- Fresh Python3.12 trial resolves exactly the baseline50packages except dotenv. Dependency consistency and all48ML tests pass. Uvicorn env-file loading, existing-env precedence, quoted values, variable expansion, explicit override pass. Container and workspace checks pending. Initial merge stopped before changes because local committer identity was absent; repeated with command-local identity and used another fresh environment for the actual candidate.

Dotenv final local gates: all32uncached workspace tasks/1856TS-JS tests pass; original Dockerfile builds image1604696e19a6. Fresh host and container each pass dependency consistency and48MLtests; all50canonical dependency versions match. Host/container each pass36/36health/endpoint/edge/HMAC probes. All7live API-to-ML/browser cases pass. Initial host probe used default HMAC instead of disposable env; rerun with actual test env passes. Independent review found no actionable issue. Exact-head hosted gates pending.

## Dotenv complete; statsmodels trial

- Dotenv PR #32 merged as `3fa2e0b7d05cb4b335a55f197bb9b14e2a750e35`; rollback: `git revert -m 1 3fa2e0b7d05cb4b335a55f197bb9b14e2a750e35`. Exact candidate CI41898865814/Security41898865646 and resulting main CI41900002324/Security41900003573 all SUCCESS. Hosted browser installation was slow but completed without a repair.
- Candidate full regression:133integration passed/3documented skips,174browser passed/1opt-in audit crawler skip. Post-merge36ML probes +7API/browser cases pass; reviewed and merged trees identical. Seven reverse-order merge reverts restore exact50d3b7a initial tree.
- Statsmodels source PR #7 refreshed at `686cd5dc52239ab2b20a075e402f5905345d72b6`, trial based on verified3fa2e0b. Preserve dotenv1.2.2; change only statsmodels0.14.4→0.14.6. [Official0.14.5 notes](https://github.com/statsmodels/statsmodels/releases/tag/v0.14.5) fix imports with SciPy1.16+; [0.14.6 notes](https://github.com/statsmodels/statsmodels/releases/tag/v0.14.6) further improve pandas/NumPy compatibility. No Python/NumPy/pandas/SciPy major migration, API, or schema change.
- Added import/OLS regression: RED against actual previous environment with SciPy1.17.1 because `_lazywhere` import is removed. Fit verifies coefficients and out-of-sample prediction, guarding library usability without enabling deferred product features. Fresh candidate resolves the same50packages except statsmodels. Remaining local/hosted gates pending.

Statsmodels local gates complete: regression RED→GREEN;49ML tests on fresh host and original-Dockerfile image0f5e40f0672e; dependency consistency passes; all50canonical package versions match; host/container each pass36HTTP/HMAC probes. Workspace32uncached tasks/1856TS-JS tests,133integration/3documented skips,174browser/1opt-in crawler skip all pass. Independent review approved; hosted exact-head gates pending.
