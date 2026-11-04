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
| 23, 24 | Superseded provisionally: verify every dependency/lockfile effect before final disposition |
| 5 | Partial: replace remaining checkout v4 with main's v7, never downgrade existing v7 |
| 3 | Candidate: CodeQL v4, after baseline green |
| 10 | Candidate: dotenv 1.2.2 |
| 7 | Candidate: statsmodels 0.14.6 |
| 11 | Candidate: FastAPI 0.136.3, only if compatible without major migration |
| 6, 8, 9 | Deferred: Python/scientific-stack majors |
| 12, 14, 15, 16, 17, 18, 19, 20 | Deferred: framework/client/compiler/lint/validation migrations or runtime mismatch |

No PR closures or branch deletions authorized by this plan.

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

Prisma-generation prerequisite: local GREEN — frozen clean install; generated client; uncached lint/typecheck/test/build, 32 tasks successful, 1,854 TS/JS tests. Hosted checks pending. Existing import-order warnings remain; no lint errors.

Ruling: current remote inventory contains 17 work branches (7 feat + 9 phase + 1 audit), not the handoff’s 18. All are ancestors; no code omitted.
