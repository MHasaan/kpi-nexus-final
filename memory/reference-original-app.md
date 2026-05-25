---
name: reference-original-app
description: Pointers to the original KPI Nexus app for feature reference — NOT for code copying.
type: reference
---

# Reference: Original KPI Nexus App

## Location

`C:\work\FYP\khan\KPI_NEXUS orignal\` — working React + Node/Express + PostgreSQL + Gemini app.

## What it contains (use as feature reference)

### Backend (`backend/`)
- **Stack**: Node.js + Express + TypeScript + Prisma + Vitest configured (no tests written yet)
- **25+ Prisma models**: Organization, User, RoleDefinition, KPI, KPIDataPoint, UserKPIAssignment, OrgUnit, Alert, AuditLog, OnboardingSession, Dashboard, etc.
- **23+ service files** in `backend/src/services/`: authService, organizationService, userKpiService, kpiStatusService, anomalyService, predictionService, aiInsightsService, geminiService, onboardingAiService, alertDispatcher, importExportService, etc.
- **90+ endpoints** across 23 router files
- **AI integration via Google Gemini**: 8 hardcoded API keys + rotation + model fallback chain
- **`prisma/seed.ts` is the depth gold standard** (~1945 lines): 10 roles, 14 positions, 11 org units, 50 users, 20 KPIs, 5 categories, 8-12 data points per assignment
- **Notable existing decisions**:
  - `KPIScope` enum (ORG_WIDE/PER_UNIT/PER_USER) already in place — see `docs/superpowers/specs/2026-05-18-kpi-per-user-isolation-design.yaml`
  - 14 permissions defined (rebuild expands to 18)
  - Multi-tenant by `organizationId` stamp on every row

### Frontend (`frontend/`)
- **Stack**: React 18 + Vite + Tailwind + React Router 6 + Recharts + Axios
- **18+ pages**: Dashboard (role-adaptive), TeamDashboard, Analytics, LiveMonitor (30s polling), Alerts, OperationalInsights (tabbed: Predictions/Anomalies/Recommendations), KPIWorkspace (tabbed), KPIBuilder, KPIAssignment, DashboardBuilder, Reporting, ImportExport, UserManagement, RoleManagement, OrganizationWorkspace, AdministrationWorkspace, Settings
- **9-step onboarding wizard** at `/signup/wizard` with AI co-pilot rail (DraftSyncProvider with 600ms debounced auto-save)
- **AuthContext + ThemeContext** (no Redux/Zustand)
- **Route guards**: ProtectedRoute, RequirePermission, PublicRoute, PermissionGuard

### Docs (`docs/superpowers/`)
- `specs/2026-05-17-onboarding-wizard-redesign-design.yaml` — onboarding wizard v2 spec
- `specs/2026-05-18-kpi-per-user-isolation-design.yaml` — the KPIScope bug-fix spec
- `specs/2026-05-18-inconsistency-cleanup-cycle1-design.yaml`
- `specs/2026-05-18-visual-polish-audit-design.yaml`
- `specs/2026-05-19-inconsistency-cleanup-cycle2-design.yaml`
- `plans/` — corresponding implementation plans

### Other notable files
- `another/todo.md` — 738-line execution checklist for the PRIOR rebuild attempt (Turborepo/NestJS/Timescale stack); ~80% checked off
- `another/` — partial code from prior rebuild attempt
- `projectReport.md` — beginner-friendly project explanation (not an FRD)
- `zzzTODOs.txt` — informal historical TODO list

## How to use it during the rebuild

- **For feature reference**: when implementing P{N}, check what the original app does for that feature surface to ensure parity (or improvement)
- **For schema reference**: look at `backend/prisma/schema.prisma` for proven patterns; do NOT copy 1:1 — the rebuild has different conventions
- **For seed depth**: when validating P6 (onboarding) exit criteria, the new onboarding must be able to reproduce the original `seed.ts` org in one session
- **For AI integration patterns**: `backend/src/services/geminiService.ts` shows the 8-key rotation + model fallback pattern — port the spirit, not the code (move keys to env vars, type properly, add tests)

## Critical correctness invariants to preserve from the original app

These came from real bugs in the original — must NOT recur:

1. **PER_USER data isolation** — user A cannot see user B's recorded values. Original app had this bug; was fixed via `KPIScope` enum + endpoint segregation. See `docs/superpowers/specs/2026-05-18-kpi-per-user-isolation-design.yaml`.
2. **No "no owner = visible to all" fallback** — an unassigned PER_USER KPI is visible only to admins.
3. **Global write endpoint rejects non-ORG_WIDE writes** with HTTP 422; the error message names the correct endpoint.
4. **Dashboard "current value" reads** come from `UserKPIAssignment.currentValue`, never from `kpi.dataPoints[0]` (the global stream).
5. **Scope changes blocked** when data points exist (HTTP 409).
