/**
 * Seed: "Helios Cloud, Inc." — a realistic 40-employee B2B SaaS company.
 *
 * This seed is intentionally exhaustive: it populates (almost) every model in
 * the schema with realistic, internally-consistent data so that every feature
 * of the product can be exercised end-to-end — RBAC, granular access control,
 * KPIs across all 3 scopes with 12 months of history, cascades + formulas +
 * lineage, dashboards, alerting, AI layer, onboarding, collaboration (tasks /
 * comments / OKRs / approvals), integrations, and SSO/SCIM/governance.
 *
 * IDEMPOTENT: on run it first deletes any existing `helios` org and all of its
 * org-scoped rows (including the scalar-FK tables Prisma can't cascade), then
 * recreates everything. Global rows (Plan / KPITemplate / OrgTemplate) are
 * upserted. It NEVER touches other orgs.
 *
 * Run (from the repo root):  pnpm --filter @kpi-nexus/db exec prisma db seed
 *   or:  cd packages/db && npx tsx prisma/seed.ts
 *
 * Re-running is safe — it wipes and recreates the `helios` org each time.
 * For a pristine DB from scratch (drops ALL tenants, re-applies TimescaleDB
 * extensions/hypertables/CAGGs, then seeds):
 *   pnpm --filter @kpi-nexus/db exec prisma db push --force-reset --skip-generate
 *   pnpm db:setup
 *   cd packages/db && npx tsx prisma/seed.ts
 *
 * Login after seeding:  admin@helios.io / Password123!   (every user shares it)
 *
 * Dates are ANCHORED: 12 monthly periods ending at SEED_ANCHOR (default: the
 * current month; SEED_ANCHOR=2026-06 gives the original 2025-07 … 2026-06).
 * Series are DETERMINISTIC (index-based interpolation + a deterministic wobble —
 * no Math.random), so charts look real but are fully reproducible.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ORG_SLUG = 'helios';
const ADMIN_EMAIL = 'admin@helios.io';
const DEMO_PASSWORD = 'Password123!';

/**
 * Pre-computed bcrypt hash of `Password123!` at cost factor 12 — the SAME cost
 * and algorithm ($2b$) the API uses (apps/api/src/auth/auth.service.ts), so it
 * verifies under the API's bcrypt.compare at login. Hardcoded because the
 * packages/db workspace has no bcrypt dependency; the embedded salt makes the
 * one hash valid for every user.
 *
 * Regenerate (if the password ever changes):
 *   cd apps/api && node -e "console.log(require('bcrypt').hashSync('Password123!',12))"
 */
const PASSWORD_HASH =
  '$2b$12$5a26fuj5QmvnrbeO5TFbKeUVXyT7krdfm6.H5VDg.eDCiiBqlB4CG';

// ---------------------------------------------------------------------------
// Timeline. Every date below was authored against June 2026 and is shifted by
// whole months so the newest monthly period is SEED_ANCHOR. It defaults to the
// current UTC month — fixed dates go stale, and the dashboard's last-N-days
// windows then show "No data" for every KPI. Pin it with SEED_ANCHOR=YYYY-MM
// (SEED_ANCHOR=2026-06 reproduces the originally-authored dates exactly).
// ---------------------------------------------------------------------------
const AUTHORED_ANCHOR = '2026-06';
const SEED_ANCHOR = process.env.SEED_ANCHOR ?? new Date().toISOString().slice(0, 7);
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(SEED_ANCHOR)) {
  throw new Error(`SEED_ANCHOR must be YYYY-MM, got "${SEED_ANCHOR}"`);
}

function monthIndex(ym: string): number {
  return Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
}
function monthKey(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

const MONTH_SHIFT = monthIndex(SEED_ANCHOR) - monthIndex(AUTHORED_ANCHOR);

/** An authored timestamp moved by MONTH_SHIFT months (day clamped to the target month's length). */
function at(iso: string): Date {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + MONTH_SHIFT);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, daysInMonth));
  return d;
}

/** "May 2026"-style label for an authored month, after shifting. */
function monthLabel(authoredYm: string): string {
  return at(`${authoredYm}-01T00:00:00.000Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// The seed's "now", so verified/completed timestamps are deterministic for a
// given anchor. Clamped so seeding early in a month never writes future "past" events.
const SEED_NOW = new Date(Math.min(at('2026-06-05T00:00:00.000Z').getTime(), Date.now()));

// Monthly periods: the 12 months ending at SEED_ANCHOR (index 0..11).
const MONTHS: readonly string[] = Array.from({ length: 12 }, (_, i) => monthKey(monthIndex(SEED_ANCHOR) - 11 + i));

function periodStart(m: string): Date {
  return new Date(`${m}-01T00:00:00.000Z`);
}
function periodEnd(m: string): Date {
  return new Date(`${m}-28T00:00:00.000Z`);
}
function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

/**
 * Deterministic 12-point monthly series from `start` to `end`. Adds a small
 * index-based sinusoidal wobble (0 at both endpoints) so the line looks real
 * but is fully reproducible (NO Math.random). Endpoints are forced exact.
 */
function series(start: number, end: number, decimals = 2, wobbleFraction = 0.05): number[] {
  const span = end - start;
  const out: number[] = [];
  for (let i = 0; i < MONTHS.length; i++) {
    const t = i / (MONTHS.length - 1); // 0..1
    const linear = start + span * t;
    const envelope = Math.sin(Math.PI * t); // 0 at ends, 1 mid
    const wave = Math.sin(i * 1.7) * envelope;
    const wobble = wave * Math.abs(span || start || 1) * wobbleFraction;
    out.push(round(linear + wobble, decimals));
  }
  out[0] = round(start, decimals);
  out[out.length - 1] = round(end, decimals);
  return out;
}

/** direction-aware status string used on assignment rows. */
function statusFor(direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER', value: number, target: number): string {
  const ratio = target === 0 ? 1 : value / target;
  if (direction === 'HIGHER_IS_BETTER') {
    if (ratio >= 1.05) return 'exceeded';
    if (ratio >= 0.98) return 'on_track';
    if (ratio >= 0.9) return 'at_risk';
    return 'behind';
  } else {
    if (ratio <= 0.95) return 'exceeded';
    if (ratio <= 1.02) return 'on_track';
    if (ratio <= 1.1) return 'at_risk';
    return 'behind';
  }
}

// ---------------------------------------------------------------------------
// 25 canonical permission keys (mirror packages/contracts/src/permissions.ts;
// ADR-001 expanded 18→25). Admin role gets the full set.
// ---------------------------------------------------------------------------
const ALL_PERMISSIONS = [
  'KPI_VIEW', 'KPI_CREATE', 'KPI_EDIT', 'KPI_DELETE', 'KPI_DATA_ENTRY',
  'DASHBOARD_VIEW', 'DASHBOARD_MANAGE',
  'USERS_VIEW', 'USERS_MANAGE', 'ROLES_MANAGE', 'POSITIONS_MANAGE',
  'GROUPS_VIEW', 'GROUPS_MANAGE',
  'ALERTS_VIEW', 'ALERTS_MANAGE',
  'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW',
  'TASKS_VIEW', 'TASKS_MANAGE',
  'OBJECTIVES_VIEW', 'OBJECTIVES_MANAGE',
  'INTEGRATIONS_MANAGE', 'AI_USE',
  'ORG_SETTINGS',
] as const;

// ---------------------------------------------------------------------------
// Roles (RBAC). A couple carry granular-access config to exercise the 5 layers.
// ---------------------------------------------------------------------------
interface RoleSpec {
  name: string; isAdmin: boolean; level: number; color: string;
  permissions: readonly string[]; description: string;
  scopeConfig?: Record<string, string>;
  dataLimits?: { historyWindowDays?: number; maxListRows?: number; maxExportRows?: number };
  pageAccess?: { allow?: string[]; deny?: string[] };
}
const ROLE_SPECS: RoleSpec[] = [
  {
    name: 'Administrator', isAdmin: true, level: 1, color: '#0284c7',
    permissions: ALL_PERMISSIONS, description: 'Full access to everything in the organization.',
  },
  {
    name: 'Executive', isAdmin: false, level: 2, color: '#7c3aed',
    description: 'Org-wide read access plus dashboards and analytics; no destructive admin.',
    permissions: ['KPI_VIEW', 'DASHBOARD_VIEW', 'DASHBOARD_MANAGE', 'USERS_VIEW', 'GROUPS_VIEW', 'ALERTS_VIEW', 'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW', 'TASKS_VIEW', 'OBJECTIVES_VIEW', 'OBJECTIVES_MANAGE', 'AI_USE'],
    scopeConfig: { KPIS: 'ORG', DASHBOARDS: 'ORG', OBJECTIVES: 'ORG', TASKS: 'ORG', ALERTS: 'ORG', REPORTS: 'ORG' },
  },
  {
    name: 'Department Manager', isAdmin: false, level: 3, color: '#0891b2',
    description: 'Manages KPIs, dashboards and people within their department.',
    permissions: ['KPI_VIEW', 'KPI_CREATE', 'KPI_EDIT', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'DASHBOARD_MANAGE', 'USERS_VIEW', 'GROUPS_VIEW', 'ALERTS_VIEW', 'ALERTS_MANAGE', 'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW', 'TASKS_VIEW', 'TASKS_MANAGE', 'OBJECTIVES_VIEW', 'OBJECTIVES_MANAGE', 'AI_USE'],
    scopeConfig: { KPIS: 'UNITS', DASHBOARDS: 'UNITS', TASKS: 'UNITS', OBJECTIVES: 'UNITS', ALERTS: 'UNITS' },
  },
  {
    name: 'Senior Contributor', isAdmin: false, level: 4, color: '#059669',
    description: 'Experienced IC who can create and edit KPIs and enter data.',
    permissions: ['KPI_VIEW', 'KPI_CREATE', 'KPI_EDIT', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'ALERTS_VIEW', 'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW', 'TASKS_VIEW', 'TASKS_MANAGE', 'OBJECTIVES_VIEW', 'AI_USE'],
    scopeConfig: { KPIS: 'UNITS', DASHBOARDS: 'SELF', TASKS: 'SELF' },
  },
  {
    name: 'Analyst', isAdmin: false, level: 4, color: '#d97706',
    description: 'Enters data and builds analytics, with a 180-day history window.',
    permissions: ['KPI_VIEW', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW', 'TASKS_VIEW', 'AI_USE'],
    scopeConfig: { KPIS: 'UNITS', DASHBOARDS: 'UNITS' },
    dataLimits: { historyWindowDays: 180, maxListRows: 500, maxExportRows: 5000 },
  },
  {
    name: 'Contributor', isAdmin: false, level: 5, color: '#475569',
    description: 'Records their own KPI data and sees team dashboards.',
    permissions: ['KPI_VIEW', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'ALERTS_VIEW', 'TASKS_VIEW'],
    scopeConfig: { KPIS: 'SELF', DASHBOARDS: 'SELF', TASKS: 'SELF' },
    dataLimits: { historyWindowDays: 90, maxListRows: 200, maxExportRows: 1000 },
  },
  {
    name: 'Viewer', isAdmin: false, level: 6, color: '#94a3b8',
    description: 'Read-only access to KPIs and dashboards; settings pages hidden.',
    permissions: ['KPI_VIEW', 'DASHBOARD_VIEW'],
    scopeConfig: { KPIS: 'SELF', DASHBOARDS: 'SELF' },
    pageAccess: { deny: ['/settings', '/settings/access', '/roles', '/users'] },
  },
];

// ---------------------------------------------------------------------------
// Positions (job titles)
// ---------------------------------------------------------------------------
interface PositionSpec { name: string; level: number; track: 'IC' | 'MANAGEMENT' | 'EXECUTIVE'; payGrade: string }
const POSITION_SPECS: PositionSpec[] = [
  { name: 'Chief Executive Officer', level: 1, track: 'EXECUTIVE', payGrade: 'E1' },
  { name: 'Chief Operating Officer', level: 1, track: 'EXECUTIVE', payGrade: 'E1' },
  { name: 'Chief Financial Officer', level: 1, track: 'EXECUTIVE', payGrade: 'E1' },
  { name: 'Chief Technology Officer', level: 1, track: 'EXECUTIVE', payGrade: 'E1' },
  { name: 'VP Engineering', level: 2, track: 'MANAGEMENT', payGrade: 'M4' },
  { name: 'VP Sales', level: 2, track: 'MANAGEMENT', payGrade: 'M4' },
  { name: 'Head of Product', level: 3, track: 'MANAGEMENT', payGrade: 'M3' },
  { name: 'Engineering Manager', level: 3, track: 'MANAGEMENT', payGrade: 'M3' },
  { name: 'Sales Manager', level: 3, track: 'MANAGEMENT', payGrade: 'M3' },
  { name: 'Customer Success Lead', level: 3, track: 'MANAGEMENT', payGrade: 'M3' },
  { name: 'Marketing Manager', level: 3, track: 'MANAGEMENT', payGrade: 'M3' },
  { name: 'People Operations Manager', level: 3, track: 'MANAGEMENT', payGrade: 'M3' },
  { name: 'Operations Manager', level: 3, track: 'MANAGEMENT', payGrade: 'M3' },
  { name: 'Finance Manager', level: 3, track: 'MANAGEMENT', payGrade: 'M3' },
  { name: 'Senior Software Engineer', level: 4, track: 'IC', payGrade: 'IC4' },
  { name: 'Software Engineer', level: 5, track: 'IC', payGrade: 'IC3' },
  { name: 'Product Manager', level: 4, track: 'IC', payGrade: 'IC4' },
  { name: 'Product Designer', level: 4, track: 'IC', payGrade: 'IC4' },
  { name: 'Account Executive', level: 4, track: 'IC', payGrade: 'IC4' },
  { name: 'Sales Development Rep', level: 5, track: 'IC', payGrade: 'IC2' },
  { name: 'Customer Success Manager', level: 4, track: 'IC', payGrade: 'IC4' },
  { name: 'Support Specialist', level: 5, track: 'IC', payGrade: 'IC2' },
  { name: 'Finance Analyst', level: 4, track: 'IC', payGrade: 'IC3' },
  { name: 'Operations Analyst', level: 4, track: 'IC', payGrade: 'IC3' },
  { name: 'Recruiter', level: 4, track: 'IC', payGrade: 'IC3' },
  { name: 'Growth Marketer', level: 4, track: 'IC', payGrade: 'IC4' },
  { name: 'Content Marketer', level: 5, track: 'IC', payGrade: 'IC3' },
  { name: 'Marketing Designer', level: 5, track: 'IC', payGrade: 'IC3' },
];

// ---------------------------------------------------------------------------
// Org units (departments)
// ---------------------------------------------------------------------------
interface UnitSpec { key: string; name: string; code: string }
const UNIT_SPECS: UnitSpec[] = [
  { key: 'exec', name: 'Executive', code: 'EXEC' },
  { key: 'eng', name: 'Engineering', code: 'ENG' },
  { key: 'prod', name: 'Product', code: 'PROD' },
  { key: 'sales', name: 'Sales', code: 'SALES' },
  { key: 'mkt', name: 'Marketing', code: 'MKT' },
  { key: 'cs', name: 'Customer Success', code: 'CS' },
  { key: 'fin', name: 'Finance', code: 'FIN' },
  { key: 'ppl', name: 'People & Culture', code: 'PPL' },
  { key: 'ops', name: 'Operations', code: 'OPS' },
];

// ---------------------------------------------------------------------------
// Users (40 staff). Managers always precede their reports (single-pass create).
// ---------------------------------------------------------------------------
type UnitRole = 'MEMBER' | 'MANAGER' | 'LEAD' | 'DEPUTY';
interface UserSpec {
  key: string; fullName: string; email: string; role: string; position: string;
  unit: string; managerKey: string | null; unitRole: UnitRole; title?: string;
}
const USER_SPECS: UserSpec[] = [
  // Executive
  { key: 'ceo', fullName: 'Olivia Hart', email: 'olivia.hart@helios.io', role: 'Administrator', position: 'Chief Executive Officer', unit: 'exec', managerKey: null, unitRole: 'MANAGER' },
  { key: 'coo', fullName: 'Marcus Webb', email: 'marcus.webb@helios.io', role: 'Administrator', position: 'Chief Operating Officer', unit: 'exec', managerKey: 'ceo', unitRole: 'MEMBER' },
  { key: 'cfo', fullName: 'Diane Foster', email: 'diane.foster@helios.io', role: 'Executive', position: 'Chief Financial Officer', unit: 'fin', managerKey: 'ceo', unitRole: 'MANAGER' },
  { key: 'cto', fullName: 'Raj Malhotra', email: 'raj.malhotra@helios.io', role: 'Executive', position: 'Chief Technology Officer', unit: 'eng', managerKey: 'ceo', unitRole: 'MANAGER' },
  // Engineering
  { key: 'vpe', fullName: 'Priya Nair', email: 'priya.nair@helios.io', role: 'Executive', position: 'VP Engineering', unit: 'eng', managerKey: 'cto', unitRole: 'DEPUTY' },
  { key: 'em1', fullName: 'Devon Reyes', email: 'devon.reyes@helios.io', role: 'Department Manager', position: 'Engineering Manager', unit: 'eng', managerKey: 'vpe', unitRole: 'LEAD' },
  { key: 'em2', fullName: 'Sara Lin', email: 'sara.lin@helios.io', role: 'Department Manager', position: 'Engineering Manager', unit: 'eng', managerKey: 'vpe', unitRole: 'LEAD' },
  { key: 'eng1', fullName: 'Aisha Khan', email: 'aisha.khan@helios.io', role: 'Senior Contributor', position: 'Senior Software Engineer', unit: 'eng', managerKey: 'em1', unitRole: 'MEMBER' },
  { key: 'eng2', fullName: 'Tom Becker', email: 'tom.becker@helios.io', role: 'Contributor', position: 'Software Engineer', unit: 'eng', managerKey: 'em1', unitRole: 'MEMBER' },
  { key: 'eng3', fullName: 'Lin Zhao', email: 'lin.zhao@helios.io', role: 'Senior Contributor', position: 'Senior Software Engineer', unit: 'eng', managerKey: 'em1', unitRole: 'MEMBER' },
  { key: 'eng4', fullName: 'Omar Farouk', email: 'omar.farouk@helios.io', role: 'Contributor', position: 'Software Engineer', unit: 'eng', managerKey: 'em2', unitRole: 'MEMBER' },
  { key: 'eng5', fullName: 'Hannah Webb', email: 'hannah.webb@helios.io', role: 'Contributor', position: 'Software Engineer', unit: 'eng', managerKey: 'em2', unitRole: 'MEMBER' },
  { key: 'eng6', fullName: 'Kevin Wu', email: 'kevin.wu@helios.io', role: 'Senior Contributor', position: 'Senior Software Engineer', unit: 'eng', managerKey: 'em2', unitRole: 'MEMBER' },
  // Product
  { key: 'hop', fullName: 'Elena Sokolova', email: 'elena.sokolova@helios.io', role: 'Department Manager', position: 'Head of Product', unit: 'prod', managerKey: 'coo', unitRole: 'MANAGER' },
  { key: 'pm1', fullName: 'Daniel Cruz', email: 'daniel.cruz@helios.io', role: 'Senior Contributor', position: 'Product Manager', unit: 'prod', managerKey: 'hop', unitRole: 'MEMBER' },
  { key: 'pm2', fullName: 'Grace Park', email: 'grace.park@helios.io', role: 'Contributor', position: 'Product Manager', unit: 'prod', managerKey: 'hop', unitRole: 'MEMBER' },
  { key: 'des1', fullName: 'Ivan Petrov', email: 'ivan.petrov@helios.io', role: 'Contributor', position: 'Product Designer', unit: 'prod', managerKey: 'hop', unitRole: 'MEMBER' },
  // Sales
  { key: 'vps', fullName: 'Greg Sullivan', email: 'greg.sullivan@helios.io', role: 'Executive', position: 'VP Sales', unit: 'sales', managerKey: 'coo', unitRole: 'MANAGER' },
  { key: 'sm', fullName: 'Bianca Rossi', email: 'bianca.rossi@helios.io', role: 'Department Manager', position: 'Sales Manager', unit: 'sales', managerKey: 'vps', unitRole: 'LEAD' },
  { key: 'ae1', fullName: 'Carlos Mendez', email: 'carlos.mendez@helios.io', role: 'Contributor', position: 'Account Executive', unit: 'sales', managerKey: 'sm', unitRole: 'MEMBER' },
  { key: 'ae2', fullName: 'Nina Patel', email: 'nina.patel@helios.io', role: 'Contributor', position: 'Account Executive', unit: 'sales', managerKey: 'sm', unitRole: 'MEMBER' },
  { key: 'ae3', fullName: 'Jake Turner', email: 'jake.turner@helios.io', role: 'Contributor', position: 'Account Executive', unit: 'sales', managerKey: 'sm', unitRole: 'MEMBER' },
  { key: 'ae4', fullName: 'Maria Santos', email: 'maria.santos@helios.io', role: 'Contributor', position: 'Account Executive', unit: 'sales', managerKey: 'sm', unitRole: 'MEMBER' },
  { key: 'sdr1', fullName: 'Leo Martins', email: 'leo.martins@helios.io', role: 'Contributor', position: 'Sales Development Rep', unit: 'sales', managerKey: 'sm', unitRole: 'MEMBER' },
  { key: 'sdr2', fullName: 'Yuki Tanaka', email: 'yuki.tanaka@helios.io', role: 'Contributor', position: 'Sales Development Rep', unit: 'sales', managerKey: 'sm', unitRole: 'MEMBER' },
  // Marketing
  { key: 'mm', fullName: 'Felix Braun', email: 'felix.braun@helios.io', role: 'Department Manager', position: 'Marketing Manager', unit: 'mkt', managerKey: 'coo', unitRole: 'MANAGER' },
  { key: 'gm', fullName: 'Zoe Adler', email: 'zoe.adler@helios.io', role: 'Senior Contributor', position: 'Growth Marketer', unit: 'mkt', managerKey: 'mm', unitRole: 'MEMBER' },
  { key: 'cm', fullName: 'Noah Bennett', email: 'noah.bennett@helios.io', role: 'Contributor', position: 'Content Marketer', unit: 'mkt', managerKey: 'mm', unitRole: 'MEMBER' },
  { key: 'mdes', fullName: 'Chloe Dubois', email: 'chloe.dubois@helios.io', role: 'Contributor', position: 'Marketing Designer', unit: 'mkt', managerKey: 'mm', unitRole: 'MEMBER' },
  // Customer Success
  { key: 'csl', fullName: 'Maya Gupta', email: 'maya.gupta@helios.io', role: 'Department Manager', position: 'Customer Success Lead', unit: 'cs', managerKey: 'coo', unitRole: 'MANAGER' },
  { key: 'csm1', fullName: 'Leah Kim', email: 'leah.kim@helios.io', role: 'Contributor', position: 'Customer Success Manager', unit: 'cs', managerKey: 'csl', unitRole: 'MEMBER' },
  { key: 'csm2', fullName: "Ryan O'Neil", email: 'ryan.oneil@helios.io', role: 'Contributor', position: 'Customer Success Manager', unit: 'cs', managerKey: 'csl', unitRole: 'MEMBER' },
  { key: 'csm3', fullName: 'Sofia Alvarez', email: 'sofia.alvarez@helios.io', role: 'Contributor', position: 'Customer Success Manager', unit: 'cs', managerKey: 'csl', unitRole: 'MEMBER' },
  { key: 'sup1', fullName: 'Aaron Cole', email: 'aaron.cole@helios.io', role: 'Contributor', position: 'Support Specialist', unit: 'cs', managerKey: 'csl', unitRole: 'MEMBER' },
  // Finance
  { key: 'fm', fullName: 'Hugo Almeida', email: 'hugo.almeida@helios.io', role: 'Department Manager', position: 'Finance Manager', unit: 'fin', managerKey: 'cfo', unitRole: 'LEAD' },
  { key: 'fa', fullName: 'Emma Lewis', email: 'emma.lewis@helios.io', role: 'Analyst', position: 'Finance Analyst', unit: 'fin', managerKey: 'fm', unitRole: 'MEMBER' },
  // People & Culture
  { key: 'pplm', fullName: 'Rachel Green', email: 'rachel.green@helios.io', role: 'Department Manager', position: 'People Operations Manager', unit: 'ppl', managerKey: 'coo', unitRole: 'MANAGER' },
  { key: 'rec', fullName: 'Priscilla Vance', email: 'priscilla.vance@helios.io', role: 'Contributor', position: 'Recruiter', unit: 'ppl', managerKey: 'pplm', unitRole: 'MEMBER' },
  // Operations
  { key: 'opsm', fullName: 'Victor Sng', email: 'victor.sng@helios.io', role: 'Department Manager', position: 'Operations Manager', unit: 'ops', managerKey: 'coo', unitRole: 'MANAGER' },
  { key: 'opsa', fullName: 'Fatima Noor', email: 'fatima.noor@helios.io', role: 'Analyst', position: 'Operations Analyst', unit: 'ops', managerKey: 'opsm', unitRole: 'MEMBER' },
];

// Dedicated admin login alias so the documented admin@helios.io works.
const ADMIN_SPEC: UserSpec = {
  key: 'admin', fullName: 'Helios Admin', email: ADMIN_EMAIL,
  role: 'Administrator', position: 'Chief Executive Officer', unit: 'exec',
  managerKey: null, unitRole: 'MEMBER',
};

// ---------------------------------------------------------------------------
// KPI categories
// ---------------------------------------------------------------------------
const CATEGORY_SPECS: { name: string; color: string; icon: string; sortOrder: number }[] = [
  { name: 'Financial', color: '#0284c7', icon: 'dollar-sign', sortOrder: 1 },
  { name: 'Sales & Growth', color: '#059669', icon: 'trending-up', sortOrder: 2 },
  { name: 'Marketing', color: '#db2777', icon: 'megaphone', sortOrder: 3 },
  { name: 'Customer Success', color: '#7c3aed', icon: 'heart-handshake', sortOrder: 4 },
  { name: 'Product & Engineering', color: '#d97706', icon: 'cpu', sortOrder: 5 },
  { name: 'People & Culture', color: '#0891b2', icon: 'users', sortOrder: 6 },
  { name: 'Operations', color: '#64748b', icon: 'settings', sortOrder: 7 },
];

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------
type Scope = 'ORG_WIDE' | 'PER_UNIT' | 'PER_USER';
type KType = 'NUMBER' | 'PERCENTAGE' | 'CURRENCY' | 'COUNT' | 'DURATION' | 'RATING';
type KDir = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
type KAgg = 'LAST' | 'SUM' | 'AVG';
interface KpiSpec {
  key: string; name: string; category: string; scope: Scope; type: KType; unit: string;
  direction: KDir; aggregation: KAgg; target: number; start: number; end: number;
  decimals?: number; unitKey?: string; userKeys?: string[];
  userSeries?: Record<string, [number, number]>; owner: string;
  quadrant?: string; tags?: string[]; desc?: string;
}
const KPI_SPECS: KpiSpec[] = [
  // ===== ORG_WIDE =====
  { key: 'mrr', name: 'Monthly Recurring Revenue', category: 'Financial', scope: 'ORG_WIDE', type: 'CURRENCY', unit: 'USD', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 520000, start: 380000, end: 498000, owner: 'cfo', quadrant: 'FINANCIAL', tags: ['north-star', 'revenue'], desc: 'Total recurring subscription revenue billed this month.' },
  { key: 'arr', name: 'Annual Recurring Revenue', category: 'Financial', scope: 'ORG_WIDE', type: 'CURRENCY', unit: 'USD', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 6240000, start: 4560000, end: 5976000, owner: 'cfo', quadrant: 'FINANCIAL', tags: ['revenue'] },
  { key: 'nrr', name: 'Net Revenue Retention', category: 'Financial', scope: 'ORG_WIDE', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 115, start: 106, end: 112, owner: 'cfo', quadrant: 'FINANCIAL' },
  { key: 'churn', name: 'Gross Logo Churn', category: 'Financial', scope: 'ORG_WIDE', type: 'PERCENTAGE', unit: '%', direction: 'LOWER_IS_BETTER', aggregation: 'LAST', target: 2.5, start: 3.1, end: 3.6, decimals: 1, owner: 'cfo', quadrant: 'FINANCIAL', tags: ['risk'] },
  { key: 'margin', name: 'Gross Margin', category: 'Financial', scope: 'ORG_WIDE', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 80, start: 74, end: 78, decimals: 0, owner: 'cfo', quadrant: 'FINANCIAL' },
  { key: 'burn', name: 'Monthly Burn Rate', category: 'Financial', scope: 'ORG_WIDE', type: 'CURRENCY', unit: 'USD', direction: 'LOWER_IS_BETTER', aggregation: 'LAST', target: 600000, start: 680000, end: 590000, owner: 'cfo', quadrant: 'FINANCIAL' },
  { key: 'runway', name: 'Cash Runway', category: 'Financial', scope: 'ORG_WIDE', type: 'NUMBER', unit: 'months', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 24, start: 19, end: 23, decimals: 0, owner: 'cfo', quadrant: 'FINANCIAL' },
  { key: 'cac', name: 'Customer Acquisition Cost', category: 'Sales & Growth', scope: 'ORG_WIDE', type: 'CURRENCY', unit: 'USD', direction: 'LOWER_IS_BETTER', aggregation: 'LAST', target: 1200, start: 1180, end: 1420, owner: 'vps', quadrant: 'CUSTOMER', tags: ['unit-economics'] },
  { key: 'ltv', name: 'Customer Lifetime Value', category: 'Sales & Growth', scope: 'ORG_WIDE', type: 'CURRENCY', unit: 'USD', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 14000, start: 11500, end: 13200, owner: 'vps', quadrant: 'CUSTOMER', tags: ['unit-economics'] },
  { key: 'ltvcac', name: 'LTV:CAC Ratio', category: 'Financial', scope: 'ORG_WIDE', type: 'NUMBER', unit: 'x', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 3.0, start: 9.7, end: 9.3, decimals: 1, owner: 'cfo', quadrant: 'FINANCIAL', desc: 'Computed: Customer Lifetime Value ÷ Customer Acquisition Cost.' },
  { key: 'nps', name: 'Net Promoter Score', category: 'Customer Success', scope: 'ORG_WIDE', type: 'NUMBER', unit: 'pts', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 55, start: 46, end: 53, decimals: 0, owner: 'csl', quadrant: 'CUSTOMER' },
  { key: 'headcount', name: 'Total Headcount', category: 'People & Culture', scope: 'ORG_WIDE', type: 'COUNT', unit: 'people', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 45, start: 34, end: 41, decimals: 0, owner: 'pplm', quadrant: 'LEARNING_GROWTH' },

  // ===== PER_UNIT — Sales =====
  { key: 'winrate', name: 'Sales Win Rate', category: 'Sales & Growth', scope: 'PER_UNIT', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 30, start: 24, end: 28, decimals: 0, unitKey: 'sales', owner: 'sm', quadrant: 'CUSTOMER' },
  { key: 'cycle', name: 'Sales Cycle Length', category: 'Sales & Growth', scope: 'PER_UNIT', type: 'NUMBER', unit: 'days', direction: 'LOWER_IS_BETTER', aggregation: 'AVG', target: 28, start: 34, end: 30, decimals: 0, unitKey: 'sales', owner: 'sm', quadrant: 'CUSTOMER' },
  { key: 'newlogos', name: 'New Logos per Month', category: 'Sales & Growth', scope: 'PER_UNIT', type: 'COUNT', unit: 'logos', direction: 'HIGHER_IS_BETTER', aggregation: 'SUM', target: 30, start: 20, end: 28, decimals: 0, unitKey: 'sales', owner: 'sm', quadrant: 'CUSTOMER' },
  { key: 'pipeline', name: 'Pipeline Coverage', category: 'Sales & Growth', scope: 'PER_UNIT', type: 'NUMBER', unit: 'x', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 3.5, start: 2.9, end: 3.6, decimals: 1, unitKey: 'sales', owner: 'vps', quadrant: 'CUSTOMER' },
  // Customer Success
  { key: 'csat', name: 'Customer Satisfaction (CSAT)', category: 'Customer Success', scope: 'PER_UNIT', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'AVG', target: 93, start: 90, end: 94, decimals: 0, unitKey: 'cs', owner: 'csl', quadrant: 'CUSTOMER' },
  { key: 'ticket', name: 'Avg. Ticket Resolution Time', category: 'Customer Success', scope: 'PER_UNIT', type: 'DURATION', unit: 'hours', direction: 'LOWER_IS_BETTER', aggregation: 'AVG', target: 4.0, start: 5.4, end: 3.9, decimals: 1, unitKey: 'cs', owner: 'csl', quadrant: 'CUSTOMER' },
  // Engineering
  { key: 'deploys', name: 'Deployment Frequency', category: 'Product & Engineering', scope: 'PER_UNIT', type: 'COUNT', unit: 'deploys/wk', direction: 'HIGHER_IS_BETTER', aggregation: 'AVG', target: 18, start: 10, end: 17, decimals: 0, unitKey: 'eng', owner: 'em1', quadrant: 'INTERNAL_PROCESS' },
  { key: 'leadtime', name: 'Change Lead Time', category: 'Product & Engineering', scope: 'PER_UNIT', type: 'DURATION', unit: 'hours', direction: 'LOWER_IS_BETTER', aggregation: 'AVG', target: 20, start: 32, end: 19, decimals: 0, unitKey: 'eng', owner: 'em1', quadrant: 'INTERNAL_PROCESS' },
  { key: 'incidents', name: 'Production Incidents', category: 'Product & Engineering', scope: 'PER_UNIT', type: 'COUNT', unit: 'incidents', direction: 'LOWER_IS_BETTER', aggregation: 'SUM', target: 3, start: 6, end: 4, decimals: 0, unitKey: 'eng', owner: 'em2', quadrant: 'INTERNAL_PROCESS' },
  { key: 'mttr', name: 'Mean Time To Recovery', category: 'Product & Engineering', scope: 'PER_UNIT', type: 'DURATION', unit: 'minutes', direction: 'LOWER_IS_BETTER', aggregation: 'AVG', target: 45, start: 72, end: 48, decimals: 0, unitKey: 'eng', owner: 'em2', quadrant: 'INTERNAL_PROCESS' },
  { key: 'uptime', name: 'Platform Uptime', category: 'Product & Engineering', scope: 'PER_UNIT', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'AVG', target: 99.95, start: 99.8, end: 99.97, decimals: 2, unitKey: 'eng', owner: 'cto', quadrant: 'INTERNAL_PROCESS', tags: ['sla'] },
  // Product
  { key: 'mau', name: 'Monthly Active Users', category: 'Product & Engineering', scope: 'PER_UNIT', type: 'COUNT', unit: 'users', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 50000, start: 32000, end: 47000, decimals: 0, unitKey: 'prod', owner: 'hop', quadrant: 'CUSTOMER' },
  { key: 'adoption', name: 'Feature Adoption Rate', category: 'Product & Engineering', scope: 'PER_UNIT', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 60, start: 41, end: 56, decimals: 0, unitKey: 'prod', owner: 'hop', quadrant: 'CUSTOMER' },
  // Marketing
  { key: 'mql', name: 'Marketing Qualified Leads', category: 'Marketing', scope: 'PER_UNIT', type: 'COUNT', unit: 'MQLs', direction: 'HIGHER_IS_BETTER', aggregation: 'SUM', target: 600, start: 420, end: 560, decimals: 0, unitKey: 'mkt', owner: 'mm', quadrant: 'CUSTOMER' },
  { key: 'convrate', name: 'Website Conversion Rate', category: 'Marketing', scope: 'PER_UNIT', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 3.2, start: 2.2, end: 2.9, decimals: 1, unitKey: 'mkt', owner: 'mm', quadrant: 'CUSTOMER' },
  { key: 'cpl', name: 'Cost per Lead', category: 'Marketing', scope: 'PER_UNIT', type: 'CURRENCY', unit: 'USD', direction: 'LOWER_IS_BETTER', aggregation: 'AVG', target: 45, start: 58, end: 47, decimals: 0, unitKey: 'mkt', owner: 'mm', quadrant: 'CUSTOMER' },
  // People & Culture
  { key: 'attrition', name: 'Voluntary Attrition', category: 'People & Culture', scope: 'PER_UNIT', type: 'PERCENTAGE', unit: '%', direction: 'LOWER_IS_BETTER', aggregation: 'LAST', target: 8, start: 11, end: 7, decimals: 0, unitKey: 'ppl', owner: 'pplm', quadrant: 'LEARNING_GROWTH' },
  { key: 'timetohire', name: 'Time to Hire', category: 'People & Culture', scope: 'PER_UNIT', type: 'NUMBER', unit: 'days', direction: 'LOWER_IS_BETTER', aggregation: 'AVG', target: 35, start: 48, end: 38, decimals: 0, unitKey: 'ppl', owner: 'pplm', quadrant: 'LEARNING_GROWTH' },
  // Operations
  { key: 'vendorspend', name: 'Vendor Spend', category: 'Operations', scope: 'PER_UNIT', type: 'CURRENCY', unit: 'USD', direction: 'LOWER_IS_BETTER', aggregation: 'SUM', target: 85000, start: 96000, end: 88000, decimals: 0, unitKey: 'ops', owner: 'opsm', quadrant: 'INTERNAL_PROCESS' },

  // ===== PER_USER =====
  { key: 'quota', name: 'Sales Quota Attainment', category: 'Sales & Growth', scope: 'PER_USER', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 100, start: 80, end: 100, decimals: 0, owner: 'sm', quadrant: 'CUSTOMER', userKeys: ['ae1', 'ae2', 'ae3', 'ae4'], userSeries: { ae1: [88, 108], ae2: [72, 94], ae3: [96, 116], ae4: [64, 82] } },
  { key: 'meetings', name: 'Qualified Meetings Booked', category: 'Sales & Growth', scope: 'PER_USER', type: 'COUNT', unit: 'meetings', direction: 'HIGHER_IS_BETTER', aggregation: 'SUM', target: 20, start: 12, end: 22, decimals: 0, owner: 'sm', quadrant: 'CUSTOMER', userKeys: ['sdr1', 'sdr2'], userSeries: { sdr1: [14, 26], sdr2: [10, 18] } },
  { key: 'renewal', name: 'Renewal Rate', category: 'Customer Success', scope: 'PER_USER', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 95, start: 88, end: 95, decimals: 0, owner: 'csl', quadrant: 'CUSTOMER', userKeys: ['csm1', 'csm2', 'csm3'], userSeries: { csm1: [89, 96], csm2: [92, 98], csm3: [84, 90] } },
  { key: 'onboarding', name: 'Customer Onboarding Completion', category: 'Customer Success', scope: 'PER_USER', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 90, start: 76, end: 91, decimals: 0, owner: 'csl', quadrant: 'CUSTOMER', userKeys: ['csm1', 'csm2', 'csm3'], userSeries: { csm1: [80, 93], csm2: [76, 89], csm3: [82, 95] } },
  { key: 'prs', name: 'Pull Requests Merged', category: 'Product & Engineering', scope: 'PER_USER', type: 'COUNT', unit: 'PRs', direction: 'HIGHER_IS_BETTER', aggregation: 'SUM', target: 14, start: 8, end: 15, decimals: 0, owner: 'em1', quadrant: 'INTERNAL_PROCESS', userKeys: ['eng1', 'eng2', 'eng3', 'eng4', 'eng5', 'eng6'], userSeries: { eng1: [11, 18], eng2: [7, 12], eng3: [12, 17], eng4: [6, 11], eng5: [8, 14], eng6: [10, 16] } },
  { key: 'reviewtime', name: 'Code Review Turnaround', category: 'Product & Engineering', scope: 'PER_USER', type: 'DURATION', unit: 'hours', direction: 'LOWER_IS_BETTER', aggregation: 'AVG', target: 6, start: 10, end: 5, decimals: 1, owner: 'em1', quadrant: 'INTERNAL_PROCESS', userKeys: ['eng1', 'eng3', 'eng6'], userSeries: { eng1: [9, 4.5], eng3: [11, 5.5], eng6: [8, 4] } },
];

// Threshold bands keyed by KPI key.
interface BandSpec { name: string; lower: number | null; upper: number | null; color: string }
const BAND_SETS: Record<string, BandSpec[]> = {
  mrr: [
    { name: 'Off Track', lower: null, upper: 440000, color: '#dc2626' },
    { name: 'At Risk', lower: 440000, upper: 500000, color: '#d97706' },
    { name: 'On Track', lower: 500000, upper: null, color: '#059669' },
  ],
  nrr: [
    { name: 'Off Track', lower: null, upper: 100, color: '#dc2626' },
    { name: 'At Risk', lower: 100, upper: 110, color: '#d97706' },
    { name: 'On Track', lower: 110, upper: null, color: '#059669' },
  ],
  churn: [
    { name: 'On Track', lower: null, upper: 2.5, color: '#059669' },
    { name: 'At Risk', lower: 2.5, upper: 3.5, color: '#d97706' },
    { name: 'Off Track', lower: 3.5, upper: null, color: '#dc2626' },
  ],
  cac: [
    { name: 'On Track', lower: null, upper: 1200, color: '#059669' },
    { name: 'At Risk', lower: 1200, upper: 1400, color: '#d97706' },
    { name: 'Off Track', lower: 1400, upper: null, color: '#dc2626' },
  ],
  uptime: [
    { name: 'Off Track', lower: null, upper: 99.9, color: '#dc2626' },
    { name: 'At Risk', lower: 99.9, upper: 99.95, color: '#d97706' },
    { name: 'On Track', lower: 99.95, upper: null, color: '#059669' },
  ],
  csat: [
    { name: 'At Risk', lower: null, upper: 90, color: '#d97706' },
    { name: 'On Track', lower: 90, upper: null, color: '#059669' },
  ],
};

// ===========================================================================
// Helpers for idempotent teardown of a prior helios org.
// ===========================================================================
/**
 * `saas-starter` org template in the TemplatePayload shape that onboarding
 * consumes (apps/api/src/org-templates/template-payload.ts). Older seeds stored
 * a legacy `{ roles: string[], units: string[], kpis: string[] }`, which 500'd
 * GET /org-templates for every org (BE-001). Same intent: the Helios roles and
 * departments plus four core SaaS KPIs.
 */
function buildSaasStarterPayload() {
  const kpiNames = ['Monthly Recurring Revenue', 'Net Revenue Retention', 'Customer Acquisition Cost', 'Net Promoter Score'];
  const kpis = KPI_SPECS.filter((k) => kpiNames.includes(k.name));
  return {
    organization: { name: 'B2B SaaS Starter', industry: 'SaaS', type: 'B2B', sizeTier: 'small' },
    roles: ROLE_SPECS.map((r) => ({ name: r.name, isAdmin: r.isAdmin, level: r.level, color: r.color, permissions: [...r.permissions] })),
    positions: POSITION_SPECS.map((p) => ({ name: p.name, track: p.track === 'IC' ? 'INDIVIDUAL_CONTRIBUTOR' : p.track })),
    orgUnitTypes: [{ name: 'Department', dimension: 'Department' }],
    orgUnits: UNIT_SPECS.map((u) => ({ name: u.name, type: 'Department', code: u.code })),
    kpiCategories: CATEGORY_SPECS.filter((c) => kpis.some((k) => k.category === c.name)).map((c) => ({ name: c.name, color: c.color })),
    kpis: kpis.map((k) => ({
      name: k.name,
      description: k.desc,
      category: k.category,
      scope: k.scope,
      type: k.type,
      direction: k.direction,
      frequency: 'MONTHLY',
      unit: k.unit,
      scorecardQuadrant: k.quadrant,
    })),
  };
}

async function wipeExistingOrg(orgId: string, log: (m: string) => void): Promise<void> {
  // Order matters only loosely (most have explicit org-scoped scalar FKs).
  // We delete child/leaf rows first, then the org (which cascades the
  // relational-FK tables). The scalar-FK tables below are NOT cascaded by the
  // org delete, so we clear them explicitly.
  const ops: Array<Promise<unknown>> = [
    prisma.notificationDelivery.deleteMany({ where: { organizationId: orgId } }),
    prisma.escalationRule.deleteMany({ where: { organizationId: orgId } }),
    prisma.alert.deleteMany({ where: { organizationId: orgId } }),
    prisma.recommendation.deleteMany({ where: { organizationId: orgId } }),
    prisma.kPIInsight.deleteMany({ where: { organizationId: orgId } }),
    prisma.nLQQuery.deleteMany({ where: { organizationId: orgId } }),
    prisma.anomalyDetection.deleteMany({ where: { organizationId: orgId } }),
    prisma.forecast.deleteMany({ where: { organizationId: orgId } }),
    prisma.aiCallLog.deleteMany({ where: { organizationId: orgId } }),
    prisma.aiFeatureConfig.deleteMany({ where: { organizationId: orgId } }),
    prisma.aiProvider.deleteMany({ where: { organizationId: orgId } }),
    prisma.aiBudget.deleteMany({ where: { organizationId: orgId } }),
    prisma.kpiCatalogEmbedding.deleteMany({ where: { organizationId: orgId } }),
    prisma.kPITarget.deleteMany({ where: { organizationId: orgId } }),
    prisma.kPIThresholdBand.deleteMany({ where: { organizationId: orgId } }),
    prisma.kPIBenchmark.deleteMany({ where: { organizationId: orgId } }),
    prisma.formulaExpression.deleteMany({ where: { organizationId: orgId } }),
    prisma.kPIDependency.deleteMany({ where: { organizationId: orgId } }),
    prisma.lineageEdge.deleteMany({ where: { organizationId: orgId } }),
    prisma.mention.deleteMany({ where: { organizationId: orgId } }),
    prisma.comment.deleteMany({ where: { organizationId: orgId } }),
    prisma.task.deleteMany({ where: { organizationId: orgId } }),
    prisma.keyResult.deleteMany({ where: { organizationId: orgId } }),
    prisma.objective.deleteMany({ where: { organizationId: orgId } }),
    prisma.approvalRequest.deleteMany({ where: { organizationId: orgId } }),
    prisma.approvalWorkflow.deleteMany({ where: { organizationId: orgId } }),
    prisma.workflow.deleteMany({ where: { organizationId: orgId } }),
    prisma.pipeline.deleteMany({ where: { organizationId: orgId } }),
    prisma.connector.deleteMany({ where: { organizationId: orgId } }),
    prisma.integrationConnection.deleteMany({ where: { organizationId: orgId } }),
    prisma.ingestionJob.deleteMany({ where: { organizationId: orgId } }),
    prisma.plugin.deleteMany({ where: { organizationId: orgId } }),
    prisma.onboardingTask.deleteMany({ where: { organizationId: orgId } }),
    prisma.scimToken.deleteMany({ where: { organizationId: orgId } }),
    prisma.tenantQuota.deleteMany({ where: { organizationId: orgId } }),
    prisma.featureFlag.deleteMany({ where: { organizationId: orgId } }),
    prisma.costMetric.deleteMany({ where: { organizationId: orgId } }),
    prisma.retentionPolicy.deleteMany({ where: { organizationId: orgId } }),
  ];
  await Promise.all(ops);
  await prisma.ssoConfig.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  // OnboardingSession is keyed by userEmail; clear helios drafts.
  await prisma.onboardingSession.deleteMany({ where: { userEmail: { endsWith: '@helios.io' } } });
  // Finally remove the org — cascades users, roles, units, kpis, dashboards,
  // alert rules, reports, channels, webhooks, api keys, data points, etc.
  await prisma.organization.delete({ where: { id: orgId } });
  log(`Wiped existing "${ORG_SLUG}" org (${orgId}) and its data.`);
}

// ===========================================================================
// Main
// ===========================================================================
async function main(): Promise<void> {
  // eslint-disable-next-line no-console -- seed script is a CLI tool
  const log = (m: string): void => console.log(`[seed] ${m}`);

  const existing = await prisma.organization.findFirst({ where: { slug: ORG_SLUG }, select: { id: true } });
  if (existing) {
    await wipeExistingOrg(existing.id, log);
  }

  // --- Global Plans (upsert; survive across orgs) ------------------------
  const PLANS = [
    { key: 'FREE', displayName: 'Free', monthlyPriceUsd: 0, annualPriceUsd: 0, sortOrder: 1, features: ['3 dashboards', '10 KPIs', 'Community support'], quotas: { kpis: 10, dashboards: 3, users: 5, aiCallsPerDay: 0 } },
    { key: 'PRO', displayName: 'Pro', monthlyPriceUsd: 99, annualPriceUsd: 990, sortOrder: 2, features: ['Unlimited dashboards', '200 KPIs', 'Alerting', 'AI insights'], quotas: { kpis: 200, dashboards: 50, users: 50, aiCallsPerDay: 200 } },
    { key: 'ENTERPRISE', displayName: 'Enterprise', monthlyPriceUsd: 0, annualPriceUsd: 0, sortOrder: 3, features: ['Unlimited everything', 'SSO/SCIM', 'Custom domains', 'Priority support'], quotas: { kpis: 0, dashboards: 0, users: 0, aiCallsPerDay: 2000 } },
  ];
  for (const p of PLANS) {
    await prisma.plan.upsert({ where: { key: p.key }, update: { ...p }, create: { ...p } });
  }
  log(`Upserted ${PLANS.length} global plans`);

  // --- Organization ------------------------------------------------------
  const org = await prisma.organization.create({
    data: {
      name: 'Helios Cloud, Inc.',
      slug: ORG_SLUG,
      tenantStatus: 'ACTIVE',
      sizeTier: 'MEDIUM',
      industry: 'Software / Observability SaaS',
      type: 'B2B',
      currency: 'USD',
      locale: 'en-US',
      timezone: 'America/Los_Angeles',
      weekStartsOn: 1,
      planKey: 'ENTERPRISE',
      planStartedAt: at('2024-09-01T00:00:00.000Z'),
      primaryColor: '#0284c7',
      secondaryColor: '#7c3aed',
      complianceProfile: ['SOC2', 'GDPR'],
      supportedCurrencies: ['USD', 'EUR', 'GBP'],
      supportedLocales: ['en-US', 'en-GB', 'de-DE'],
      supportedTimezones: ['America/Los_Angeles', 'America/New_York', 'Europe/London'],
    },
    select: { id: true },
  });
  const orgId = org.id;
  log(`Created organization ${orgId} (Helios Cloud, Inc. / ${ORG_SLUG})`);

  // --- Roles -------------------------------------------------------------
  const roleIds = new Map<string, string>();
  for (const r of ROLE_SPECS) {
    const role = await prisma.roleDefinition.create({
      data: {
        organizationId: orgId, name: r.name, description: r.description,
        permissions: [...r.permissions], isAdmin: r.isAdmin, level: r.level, color: r.color,
        scopeConfig: r.scopeConfig ?? undefined,
        dataLimits: r.dataLimits ?? undefined,
        pageAccess: r.pageAccess ?? undefined,
      },
      select: { id: true },
    });
    roleIds.set(r.name, role.id);
  }
  log(`Created ${roleIds.size} roles`);

  // Role inheritance edges (informational hierarchy).
  await prisma.roleInheritance.create({ data: { organizationId: orgId, parentRoleId: roleIds.get('Department Manager')!, childRoleId: roleIds.get('Senior Contributor')!, inheritsPermissions: true } });
  await prisma.roleInheritance.create({ data: { organizationId: orgId, parentRoleId: roleIds.get('Senior Contributor')!, childRoleId: roleIds.get('Contributor')!, inheritsPermissions: true } });
  await prisma.roleInheritance.create({ data: { organizationId: orgId, parentRoleId: roleIds.get('Contributor')!, childRoleId: roleIds.get('Viewer')!, inheritsPermissions: false } });

  // --- Positions ---------------------------------------------------------
  const positionIds = new Map<string, string>();
  for (const p of POSITION_SPECS) {
    const pos = await prisma.position.create({
      data: { organizationId: orgId, name: p.name, level: p.level, track: p.track, payGrade: p.payGrade },
      select: { id: true },
    });
    positionIds.set(p.name, pos.id);
  }
  log(`Created ${positionIds.size} positions`);

  // --- Org structure: dimension + type + units ---------------------------
  const dimension = await prisma.orgUnitDimension.create({
    data: { organizationId: orgId, name: 'Department', isDefault: true },
    select: { id: true },
  });
  const unitType = await prisma.orgUnitType.create({
    data: { organizationId: orgId, dimensionId: dimension.id, name: 'Department', namePlural: 'Departments', icon: 'building-2', color: '#0284c7', sortOrder: 1 },
    select: { id: true },
  });
  const unitIds = new Map<string, string>();
  for (const u of UNIT_SPECS) {
    const unit = await prisma.orgUnit.create({
      data: { organizationId: orgId, orgUnitTypeId: unitType.id, name: u.name, code: u.code, status: 'ACTIVE' },
      select: { id: true },
    });
    unitIds.set(u.key, unit.id);
  }
  log(`Created org-unit dimension + type + ${unitIds.size} units`);

  // --- Users (managers precede reports → single pass) --------------------
  const userIds = new Map<string, string>();
  for (const u of [...USER_SPECS, ADMIN_SPEC]) {
    const roleId = roleIds.get(u.role);
    const positionId = positionIds.get(u.position);
    if (!roleId) throw new Error(`Unknown role "${u.role}" for user ${u.key}`);
    if (!positionId) throw new Error(`Unknown position "${u.position}" for user ${u.key}`);
    const managerId = u.managerKey ? userIds.get(u.managerKey) ?? null : null;
    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: u.email,
        fullName: u.fullName,
        passwordHash: PASSWORD_HASH,
        status: 'ACTIVE',
        isActive: true,
        emailVerifiedAt: SEED_NOW,
        onboardingCompletedAt: SEED_NOW,
        timezone: 'America/Los_Angeles',
        roleId,
        positionId,
        managerId,
      },
      select: { id: true },
    });
    userIds.set(u.key, user.id);

    if (u.key !== 'admin') {
      const orgUnitId = unitIds.get(u.unit);
      if (!orgUnitId) throw new Error(`Unknown unit "${u.unit}" for user ${u.key}`);
      await prisma.orgUnitMember.create({
        data: { organizationId: orgId, orgUnitId, userId: user.id, memberRole: u.unitRole, joinedAt: at('2024-09-15T00:00:00.000Z') },
      });
    }
  }
  log(`Created ${userIds.size} users (incl. ${ADMIN_EMAIL}) + memberships`);

  // --- Set each unit's head to its MANAGER -------------------------------
  for (const u of USER_SPECS) {
    if (u.unitRole !== 'MANAGER') continue;
    const orgUnitId = unitIds.get(u.unit);
    const headUserId = userIds.get(u.key);
    if (orgUnitId && headUserId) {
      await prisma.orgUnit.update({ where: { id: orgUnitId }, data: { headUserId } });
    }
  }

  // --- Platform admin + a unit rename history record ---------------------
  await prisma.platformAdmin.create({ data: { userId: userIds.get('admin')!, grantedBy: 'system-seed' } });
  await prisma.orgUnitNameHistory.create({ data: { orgUnitId: unitIds.get('cs')!, previousName: 'Support', changedById: userIds.get('coo')! } });

  const adminId = userIds.get('ceo')!; // CEO is the "created by" actor for most records

  // --- KPI categories ----------------------------------------------------
  const categoryIds = new Map<string, string>();
  for (const c of CATEGORY_SPECS) {
    const cat = await prisma.kPICategory.create({
      data: { organizationId: orgId, name: c.name, color: c.color, icon: c.icon, sortOrder: c.sortOrder },
      select: { id: true },
    });
    categoryIds.set(c.name, cat.id);
  }
  log(`Created ${categoryIds.size} KPI categories`);

  // --- KPIs + assignments + targets + data points ------------------------
  const kpiIds = new Map<string, string>();
  // Capture last-month values per kpi (org) and per user/unit for downstream rows.
  const lastOrgValue = new Map<string, number>();
  let kpiCount = 0;
  let orgUnitAssignmentCount = 0;
  let userAssignmentCount = 0;
  let dataPointCount = 0;
  const byScope: Record<Scope, number> = { ORG_WIDE: 0, PER_UNIT: 0, PER_USER: 0 };

  for (const k of KPI_SPECS) {
    const categoryId = categoryIds.get(k.category);
    if (!categoryId) throw new Error(`Unknown category "${k.category}" for KPI ${k.key}`);
    const ownerUserId = userIds.get(k.owner);
    if (!ownerUserId) throw new Error(`Unknown owner "${k.owner}" for KPI ${k.key}`);
    const decimals = k.decimals ?? 2;

    const kpi = await prisma.kPI.create({
      data: {
        organizationId: orgId,
        categoryId,
        name: k.name,
        description: k.desc,
        unit: k.unit,
        scope: k.scope,
        type: k.type,
        direction: k.direction,
        frequency: 'MONTHLY',
        aggregationMethod: k.aggregation,
        status: 'ACTIVE',
        scorecardQuadrant: k.quadrant,
        tags: k.tags ?? [],
        targetValue: k.target,
        ownerUserId,
        createdById: adminId,
      },
      select: { id: true },
    });
    kpiIds.set(k.key, kpi.id);
    kpiCount += 1;
    byScope[k.scope] += 1;

    // Effective static target (the KPI detail "Targets" tab reads these).
    await prisma.kPITarget.create({
      data: { organizationId: orgId, kpiId: kpi.id, type: 'STATIC', value: k.target, effectiveFrom: periodStart(MONTHS[0]), createdById: adminId },
    });

    if (k.scope === 'ORG_WIDE') {
      const vals = series(k.start, k.end, decimals);
      lastOrgValue.set(k.key, vals[vals.length - 1]!);
      await prisma.kPIDataPoint.createMany({
        data: MONTHS.map((m, i) => ({
          id: `dp_${kpi.id}_${m}`,
          organizationId: orgId,
          kpiId: kpi.id,
          value: vals[i]!,
          unit: k.unit,
          periodStart: periodStart(m),
          periodEnd: periodEnd(m),
          recordedAt: periodEnd(m),
          recordedById: ownerUserId,
          sourceType: 'MANUAL' as const,
          qualityFlag: 'HIGH' as const,
        })),
      });
      dataPointCount += MONTHS.length;
    } else if (k.scope === 'PER_UNIT') {
      const orgUnitId = unitIds.get(k.unitKey!);
      if (!orgUnitId) throw new Error(`Unknown unitKey "${k.unitKey}" for KPI ${k.key}`);
      const vals = series(k.start, k.end, decimals);
      const last = vals[vals.length - 1]!;
      lastOrgValue.set(k.key, last);
      await prisma.kPIAssignmentOrgUnit.create({
        data: { organizationId: orgId, kpiId: kpi.id, orgUnitId, targetValue: k.target, currentValue: last, status: statusFor(k.direction, last, k.target) },
      });
      orgUnitAssignmentCount += 1;
      await prisma.kPIDataPoint.createMany({
        data: MONTHS.map((m, i) => ({
          id: `dp_${kpi.id}_${orgUnitId}_${m}`,
          organizationId: orgId,
          kpiId: kpi.id,
          orgUnitId,
          value: vals[i]!,
          unit: k.unit,
          periodStart: periodStart(m),
          periodEnd: periodEnd(m),
          recordedAt: periodEnd(m),
          recordedById: ownerUserId,
          sourceType: 'MANUAL' as const,
          qualityFlag: 'HIGH' as const,
        })),
      });
      dataPointCount += MONTHS.length;
    } else {
      // PER_USER — each assignee gets their own assignment + isolated points.
      for (const uk of k.userKeys ?? []) {
        const userId = userIds.get(uk);
        if (!userId) throw new Error(`Unknown userKey "${uk}" for KPI ${k.key}`);
        const range = k.userSeries?.[uk] ?? [k.start, k.end];
        const vals = series(range[0], range[1], decimals);
        const last = vals[vals.length - 1]!;
        await prisma.kPIAssignmentUser.create({
          data: { organizationId: orgId, kpiId: kpi.id, userId, targetValue: k.target, currentValue: last, status: statusFor(k.direction, last, k.target) },
        });
        userAssignmentCount += 1;
        await prisma.kPIDataPoint.createMany({
          data: MONTHS.map((m, i) => ({
            id: `dp_${kpi.id}_${userId}_${m}`,
            organizationId: orgId,
            kpiId: kpi.id,
            userId,
            value: vals[i]!,
            unit: k.unit,
            periodStart: periodStart(m),
            periodEnd: periodEnd(m),
            recordedAt: periodEnd(m),
            recordedById: userId,
            sourceType: 'MANUAL' as const,
            qualityFlag: 'HIGH' as const,
          })),
        });
        dataPointCount += MONTHS.length;
      }
    }
  }
  log(`Created ${kpiCount} KPIs (ORG_WIDE ${byScope.ORG_WIDE}, PER_UNIT ${byScope.PER_UNIT}, PER_USER ${byScope.PER_USER})`);
  log(`Created ${orgUnitAssignmentCount} org-unit assignments + ${userAssignmentCount} user assignments + ${dataPointCount} data points`);

  // --- Extra target types + benchmarks + a KPI version -------------------
  // TIERED target on MRR.
  await prisma.kPITarget.create({
    data: { organizationId: orgId, kpiId: kpiIds.get('mrr')!, type: 'TIERED', minValue: 460000, expectedValue: 520000, stretchValue: 580000, effectiveFrom: periodStart(MONTHS[0]), createdById: adminId },
  });
  // DYNAMIC formula target on LTV:CAC.
  await prisma.kPITarget.create({
    data: { organizationId: orgId, kpiId: kpiIds.get('ltvcac')!, type: 'DYNAMIC', formula: 'ltv / cac', effectiveFrom: periodStart(MONTHS[0]), createdById: adminId },
  });
  // TIME_VARYING target on New Logos.
  await prisma.kPITarget.create({
    data: { organizationId: orgId, kpiId: kpiIds.get('newlogos')!, type: 'TIME_VARYING', value: 30, effectiveFrom: periodStart(MONTHS[6]), createdById: adminId, scenarioName: 'H1 ramp' },
  });
  // Benchmarks.
  await prisma.kPIBenchmark.create({ data: { organizationId: orgId, kpiId: kpiIds.get('nps')!, kind: 'EXTERNAL_INDUSTRY', value: 41, source: 'SaaS Benchmarks 2026 (median)', createdById: adminId } });
  await prisma.kPIBenchmark.create({ data: { organizationId: orgId, kpiId: kpiIds.get('uptime')!, kind: 'EXTERNAL_INDUSTRY', value: 99.9, source: 'Cloud SLA peer set', createdById: adminId } });
  await prisma.kPIBenchmark.create({ data: { organizationId: orgId, kpiId: kpiIds.get('mrr')!, kind: 'INTERNAL_HISTORICAL', value: 440000, periodStart: periodStart(MONTHS[0]), periodEnd: periodEnd(MONTHS[5]), createdById: adminId } });
  // A version-history row for MRR.
  await prisma.kPIVersion.create({ data: { kpiId: kpiIds.get('mrr')!, version: 1, snapshot: { name: 'Monthly Recurring Revenue', targetValue: 500000 }, reason: 'Initial definition', createdById: adminId } });

  // --- Threshold bands ---------------------------------------------------
  let bandCount = 0;
  for (const [kpiKey, bands] of Object.entries(BAND_SETS)) {
    const kpiId = kpiIds.get(kpiKey);
    if (!kpiId) continue;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i]!;
      await prisma.kPIThresholdBand.create({
        data: { organizationId: orgId, kpiId, name: b.name, lower: b.lower, upper: b.upper, color: b.color, order: i, createdById: adminId },
      });
      bandCount += 1;
    }
  }
  log(`Created ${bandCount} threshold bands`);

  // --- Cascade + formula + dependency + lineage --------------------------
  // ARR rolls up from MRR (×12).
  await prisma.kPICascade.create({
    data: { organizationId: orgId, parentKpiId: kpiIds.get('arr')!, childKpiId: kpiIds.get('mrr')!, method: 'CUSTOM_FORMULA', customFormula: 'mrr * 12', weight: 1, level: 0, lastComputedAt: SEED_NOW },
  });
  // LTV:CAC is a computed KPI: formula + dependency edges.
  await prisma.formulaExpression.create({
    data: { organizationId: orgId, kpiId: kpiIds.get('ltvcac')!, raw: 'ltv / cac', ast: { op: '/', left: { ref: 'ltv' }, right: { ref: 'cac' } } },
  });
  await prisma.kPIDependency.create({ data: { organizationId: orgId, sourceKpiId: kpiIds.get('ltv')!, dependentKpiId: kpiIds.get('ltvcac')!, formulaRef: 'ltv' } });
  await prisma.kPIDependency.create({ data: { organizationId: orgId, sourceKpiId: kpiIds.get('cac')!, dependentKpiId: kpiIds.get('ltvcac')!, formulaRef: 'cac' } });
  await prisma.lineageEdge.create({ data: { organizationId: orgId, sourceType: 'kpi', sourceId: kpiIds.get('mrr')!, targetType: 'kpi', targetId: kpiIds.get('arr')!, transformType: 'CASCADE_ROLLUP' } });
  await prisma.lineageEdge.create({ data: { organizationId: orgId, sourceType: 'kpi', sourceId: kpiIds.get('ltv')!, targetType: 'kpi', targetId: kpiIds.get('ltvcac')!, transformType: 'FORMULA' } });
  log('Created cascade + formula + 2 dependency edges + 2 lineage edges');

  // --- Global KPI templates + org template -------------------------------
  await prisma.kPITemplate.upsert({
    where: { slug: 'saas-mrr' }, update: {},
    create: { slug: 'saas-mrr', name: 'Monthly Recurring Revenue', description: 'Recurring subscription revenue per month.', type: 'CURRENCY', direction: 'HIGHER_IS_BETTER', frequency: 'MONTHLY', aggregationMethod: 'LAST', scorecardQuadrant: 'FINANCIAL', function: 'Finance', industry: 'SaaS', unit: 'USD', tags: ['revenue', 'saas'], popularity: 980, isGlobal: true, isBuiltin: true },
  });
  await prisma.kPITemplate.upsert({
    where: { slug: 'saas-nps' }, update: {},
    create: { slug: 'saas-nps', name: 'Net Promoter Score', description: 'Customer loyalty survey score.', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', frequency: 'QUARTERLY', aggregationMethod: 'LAST', scorecardQuadrant: 'CUSTOMER', function: 'Customer Success', industry: 'SaaS', unit: 'pts', tags: ['customer'], popularity: 760, isGlobal: true, isBuiltin: true },
  });
  // `update` repairs rows written by older seeds in a legacy shape (BE-001).
  const saasStarterPayload = buildSaasStarterPayload();
  await prisma.orgTemplate.upsert({
    where: { slug: 'saas-starter' }, update: { payload: saasStarterPayload },
    create: { slug: 'saas-starter', name: 'B2B SaaS Starter', description: 'Roles, units and KPIs for an early-stage B2B SaaS company.', tier: 'starter', orgType: 'B2B', industry: 'SaaS', isBuiltin: true, isPublic: true, popularity: 120, payload: saasStarterPayload },
  });
  log('Upserted 2 global KPI templates + 1 org template');

  // --- Dashboards + widgets + assignment + snapshot + share link ---------
  const widget = (
    dashboardId: string, type: string, title: string, kpiKey: string,
    x: number, y: number, w: number, h: number, sortOrder: number,
  ) => prisma.dashboardWidget.create({
    data: { organizationId: orgId, dashboardId, widgetType: type, title, config: { kpiId: kpiIds.get(kpiKey) }, position: { x, y, w, h }, sortOrder },
  });

  // 1) Company Overview (default + shared)
  const dashOverview = await prisma.dashboard.create({
    data: { organizationId: orgId, name: 'Company Overview', description: 'Org health at a glance — revenue, retention, and risk.', ownerUserId: adminId, isShared: true, isDefault: true, createdById: adminId },
    select: { id: true },
  });
  await widget(dashOverview.id, 'kpi_card', 'Monthly Recurring Revenue', 'mrr', 0, 0, 3, 2, 0);
  await widget(dashOverview.id, 'kpi_card', 'Net Revenue Retention', 'nrr', 3, 0, 3, 2, 1);
  await widget(dashOverview.id, 'kpi_card', 'Gross Logo Churn', 'churn', 6, 0, 3, 2, 2);
  await widget(dashOverview.id, 'kpi_card', 'Net Promoter Score', 'nps', 9, 0, 3, 2, 3);
  await widget(dashOverview.id, 'line', 'MRR trend', 'mrr', 0, 2, 8, 4, 4);
  await widget(dashOverview.id, 'gauge', 'LTV:CAC Ratio', 'ltvcac', 8, 2, 4, 4, 5);

  // 2) Sales Performance (shared, published to Sales unit)
  const dashSales = await prisma.dashboard.create({
    data: { organizationId: orgId, name: 'Sales Performance', description: 'Pipeline, win rate, and rep quota attainment.', ownerUserId: userIds.get('vps')!, isShared: true, createdById: userIds.get('vps')! },
    select: { id: true },
  });
  await widget(dashSales.id, 'kpi_card', 'Win Rate', 'winrate', 0, 0, 4, 2, 0);
  await widget(dashSales.id, 'kpi_card', 'New Logos', 'newlogos', 4, 0, 4, 2, 1);
  await widget(dashSales.id, 'kpi_card', 'Pipeline Coverage', 'pipeline', 8, 0, 4, 2, 2);
  await widget(dashSales.id, 'bar', 'Quota Attainment by Rep', 'quota', 0, 2, 12, 4, 3);
  await prisma.dashboardAssignmentOrgUnit.create({ data: { organizationId: orgId, dashboardId: dashSales.id, orgUnitId: unitIds.get('sales')!, createdById: userIds.get('vps')! } });

  // 3) Engineering Health (shared, published to Eng unit)
  const dashEng = await prisma.dashboard.create({
    data: { organizationId: orgId, name: 'Engineering Health', description: 'DORA metrics + reliability.', ownerUserId: userIds.get('cto')!, isShared: true, createdById: userIds.get('cto')! },
    select: { id: true },
  });
  await widget(dashEng.id, 'kpi_card', 'Deployment Frequency', 'deploys', 0, 0, 4, 2, 0);
  await widget(dashEng.id, 'kpi_card', 'Change Lead Time', 'leadtime', 4, 0, 4, 2, 1);
  await widget(dashEng.id, 'kpi_card', 'Uptime', 'uptime', 8, 0, 4, 2, 2);
  await widget(dashEng.id, 'line', 'Incidents trend', 'incidents', 0, 2, 6, 4, 3);
  await widget(dashEng.id, 'line', 'MTTR trend', 'mttr', 6, 2, 6, 4, 4);
  await prisma.dashboardAssignmentOrgUnit.create({ data: { organizationId: orgId, dashboardId: dashEng.id, orgUnitId: unitIds.get('eng')!, createdById: userIds.get('cto')! } });

  // 4) CFO private dashboard
  const dashFin = await prisma.dashboard.create({
    data: { organizationId: orgId, name: 'Finance (CFO)', description: 'Private financial cockpit.', ownerUserId: userIds.get('cfo')!, isShared: false, createdById: userIds.get('cfo')! },
    select: { id: true },
  });
  await widget(dashFin.id, 'kpi_card', 'Burn Rate', 'burn', 0, 0, 4, 2, 0);
  await widget(dashFin.id, 'kpi_card', 'Runway', 'runway', 4, 0, 4, 2, 1);
  await widget(dashFin.id, 'kpi_card', 'Gross Margin', 'margin', 8, 0, 4, 2, 2);

  // Snapshot of the overview + a public share link.
  await prisma.dashboardSnapshot.create({
    data: { organizationId: orgId, dashboardId: dashOverview.id, label: 'Q2 board review', takenById: adminId, payload: { dashboardName: 'Company Overview', capturedAt: SEED_NOW.toISOString(), kpis: { mrr: lastOrgValue.get('mrr'), nrr: lastOrgValue.get('nrr'), churn: lastOrgValue.get('churn') } } },
  });
  await prisma.dashboardShareLink.create({
    data: { organizationId: orgId, dashboardId: dashOverview.id, token: 'helios_share_overview_demo_0001', viewCount: 7, lastViewedAt: SEED_NOW, createdById: adminId },
  });
  log('Created 4 dashboards + widgets + 2 unit assignments + 1 snapshot + 1 share link');

  // --- Scheduled reports + report runs -----------------------------------
  const reportWeekly = await prisma.scheduledReport.create({
    data: { organizationId: orgId, name: 'Weekly Exec Summary', description: 'Top-line KPIs every Monday 8am.', dashboardId: dashOverview.id, kpiIds: [kpiIds.get('mrr')!, kpiIds.get('nrr')!, kpiIds.get('churn')!, kpiIds.get('nps')!], cron: '0 8 * * 1', format: 'PDF', recipients: ['olivia.hart@helios.io', 'marcus.webb@helios.io', 'diane.foster@helios.io'], isActive: true, lastRunAt: at('2026-06-01T08:00:00.000Z'), nextRunAt: at('2026-06-08T08:00:00.000Z'), createdById: adminId },
    select: { id: true },
  });
  const reportMonthly = await prisma.scheduledReport.create({
    data: { organizationId: orgId, name: 'Monthly Sales Report', dashboardId: dashSales.id, kpiIds: [kpiIds.get('winrate')!, kpiIds.get('newlogos')!], cron: '0 9 1 * *', format: 'EXCEL', recipients: ['greg.sullivan@helios.io'], isActive: true, nextRunAt: at('2026-07-01T09:00:00.000Z'), createdById: userIds.get('vps')! },
    select: { id: true },
  });
  await prisma.reportRun.create({ data: { organizationId: orgId, scheduledReportId: reportWeekly.id, status: 'SUCCEEDED', format: 'PDF', fileUrl: `https://files.helios.io/reports/weekly-${at('2026-06-01T00:00:00.000Z').toISOString().slice(0, 10)}.pdf`, startedAt: at('2026-06-01T08:00:00.000Z'), finishedAt: at('2026-06-01T08:00:42.000Z'), ranAt: at('2026-06-01T08:00:00.000Z') } });
  await prisma.reportRun.create({ data: { organizationId: orgId, scheduledReportId: reportMonthly.id, status: 'FAILED', format: 'EXCEL', error: 'SMTP timeout while emailing recipients', startedAt: at('2026-06-01T09:00:00.000Z'), finishedAt: at('2026-06-01T09:00:30.000Z'), ranAt: at('2026-06-01T09:00:00.000Z') } });
  await prisma.reportRun.create({ data: { organizationId: orgId, triggeredById: adminId, status: 'SUCCEEDED', format: 'CSV', fileUrl: 'https://files.helios.io/reports/adhoc-mrr.csv', startedAt: SEED_NOW, finishedAt: SEED_NOW, ranAt: SEED_NOW } });
  log('Created 2 scheduled reports + 3 report runs');

  // --- Notification channels --------------------------------------------
  const chEmail = await prisma.notificationChannel.create({ data: { organizationId: orgId, name: 'Default Email', kind: 'EMAIL', config: { from: 'alerts@helios.io' }, isActive: true }, select: { id: true } });
  const chSlack = await prisma.notificationChannel.create({ data: { organizationId: orgId, name: '#alerts (Slack)', kind: 'SLACK', config: { channel: '#alerts', webhookRef: 'enc:slack-webhook' }, isActive: true }, select: { id: true } });
  const chInApp = await prisma.notificationChannel.create({ data: { organizationId: orgId, name: 'In-App', kind: 'IN_APP', config: {}, isActive: true }, select: { id: true } });

  // --- Alert rules + escalation + alerts + deliveries --------------------
  const ruleChurn = await prisma.alertRule.create({ data: { organizationId: orgId, kpiId: kpiIds.get('churn')!, name: 'Gross Logo Churn above 3.0%', description: 'Churn climbing past tolerance.', ruleType: 'STATIC_THRESHOLD', config: { comparator: 'gt', threshold: 3.0 }, severity: 'HIGH', isActive: true, createdById: adminId }, select: { id: true } });
  const ruleCac = await prisma.alertRule.create({ data: { organizationId: orgId, kpiId: kpiIds.get('cac')!, name: 'CAC above $1,200 target', ruleType: 'STATIC_THRESHOLD', config: { comparator: 'gt', threshold: 1200 }, severity: 'MEDIUM', isActive: true, createdById: adminId }, select: { id: true } });
  const ruleUptime = await prisma.alertRule.create({ data: { organizationId: orgId, kpiId: kpiIds.get('uptime')!, name: 'Uptime below 99.9% SLA', ruleType: 'STATIC_THRESHOLD', config: { comparator: 'lt', threshold: 99.9 }, severity: 'HIGH', isActive: true, createdById: userIds.get('cto')! }, select: { id: true } });
  await prisma.alertRule.create({ data: { organizationId: orgId, kpiId: kpiIds.get('mrr')!, name: 'MRR no-data watchdog', ruleType: 'NO_DATA', config: { maxStaleHours: 720 }, severity: 'LOW', isActive: true, createdById: adminId } });

  await prisma.escalationRule.create({
    data: { organizationId: orgId, alertRuleId: ruleChurn.id, levels: [
      { delayMinutes: 0, channelIds: [chSlack.id, chInApp.id], notifyUserIds: [userIds.get('csl')!] },
      { delayMinutes: 60, channelIds: [chEmail.id], notifyUserIds: [userIds.get('coo')!, userIds.get('ceo')!] },
    ] },
  });

  // Raised alert instances (open / acknowledged / resolved).
  const alertChurn = await prisma.alert.create({ data: { organizationId: orgId, alertRuleId: ruleChurn.id, kpiId: kpiIds.get('churn')!, message: 'Gross Logo Churn reached 3.6% (target ≤ 2.5%).', severity: 'HIGH', status: 'OPEN', meta: { value: 3.6, threshold: 3.0 }, createdAt: at('2026-06-02T06:00:00.000Z') }, select: { id: true } });
  const alertCac = await prisma.alert.create({ data: { organizationId: orgId, alertRuleId: ruleCac.id, kpiId: kpiIds.get('cac')!, message: 'CAC reached $1,420 (target ≤ $1,200).', severity: 'MEDIUM', status: 'ACKNOWLEDGED', acknowledgedAt: at('2026-06-03T15:00:00.000Z'), acknowledgedById: userIds.get('vps')!, meta: { value: 1420 }, createdAt: at('2026-06-03T06:00:00.000Z') }, select: { id: true } });
  await prisma.alert.create({ data: { organizationId: orgId, alertRuleId: ruleUptime.id, kpiId: kpiIds.get('uptime')!, message: `Uptime dipped to 99.85% during the ${monthLabel('2026-04').slice(0, 3)} incident.`, severity: 'HIGH', status: 'RESOLVED', resolvedAt: at('2026-04-20T12:00:00.000Z'), meta: { value: 99.85 }, createdAt: at('2026-04-18T09:00:00.000Z') } });

  await prisma.notificationDelivery.create({ data: { organizationId: orgId, alertId: alertChurn.id, channelId: chSlack.id, status: 'SENT', attempts: 1, sentAt: at('2026-06-02T06:00:05.000Z') } });
  await prisma.notificationDelivery.create({ data: { organizationId: orgId, alertId: alertChurn.id, channelId: chEmail.id, targetUserId: userIds.get('ceo')!, status: 'SENT', attempts: 1, sentAt: at('2026-06-02T07:00:05.000Z') } });
  await prisma.notificationDelivery.create({ data: { organizationId: orgId, alertId: alertCac.id, channelId: chSlack.id, status: 'FAILED', attempts: 3, error: 'Slack 429 rate limited' } });
  log('Created 4 alert rules + 1 escalation + 3 alerts + 3 deliveries + 3 channels');

  // --- Webhooks + API keys -----------------------------------------------
  await prisma.webhookSubscription.create({ data: { organizationId: orgId, name: 'Ops webhook', url: 'https://hooks.helios.io/ingest', events: ['alert.created', 'kpi.threshold_breached'], secret: 'whsec_demo_helios_0001', isActive: true, lastDeliveredAt: SEED_NOW, lastStatus: 200, createdById: userIds.get('opsm')! } });
  await prisma.apiKey.create({ data: { organizationId: orgId, name: 'CI ingestion key', hashedKey: 'hashed_kpinx_demo_helios_0001', keyPrefix: 'kpinx_HE1', scopes: ['KPI_DATA_ENTRY', 'KPI_VIEW'], lastUsedAt: SEED_NOW, createdById: userIds.get('opsm')! } });
  log('Created 1 webhook + 1 API key');

  // --- AI layer ----------------------------------------------------------
  const provGemini = await prisma.aiProvider.create({ data: { organizationId: orgId, key: 'GEMINI', displayName: 'Google Gemini', isEnabled: true, supportedFeatures: ['insight', 'nlq', 'recommendation', 'onboarding'] }, select: { id: true } });
  const provClaude = await prisma.aiProvider.create({ data: { organizationId: orgId, key: 'CLAUDE', displayName: 'Anthropic Claude', isEnabled: true, supportedFeatures: ['insight', 'nlq', 'recommendation'] }, select: { id: true } });
  await prisma.aiProvider.create({ data: { organizationId: orgId, key: 'OPENAI', displayName: 'OpenAI', isEnabled: false, supportedFeatures: ['insight', 'nlq'] } });
  await prisma.aiFeatureConfig.create({ data: { organizationId: orgId, feature: 'insight', providerId: provGemini.id, model: 'gemini-2.0-flash', fallbackProviderId: provClaude.id, fallbackModel: 'claude-haiku-4-5', perFeatureCapUsd: 5 } });
  await prisma.aiFeatureConfig.create({ data: { organizationId: orgId, feature: 'nlq', providerId: provGemini.id, model: 'gemini-2.0-flash' } });
  await prisma.aiBudget.create({ data: { organizationId: orgId, dailyCapUsd: 5, monthlyCapUsd: 100, currentDailySpend: 0.42, currentMonthlySpend: 18.7, dailyPeriodStart: SEED_NOW, monthlyPeriodStart: at('2026-06-01T00:00:00.000Z') } });

  for (let i = 0; i < 6; i++) {
    await prisma.aiCallLog.create({ data: { organizationId: orgId, feature: i % 2 === 0 ? 'insight' : 'nlq', providerKey: 'GEMINI', modelId: 'gemini-2.0-flash', inputTokens: 800 + i * 120, outputTokens: 220 + i * 40, costUsd: round(0.003 + i * 0.001, 4), latencyMs: 900 + i * 110, status: 'SUCCESS', requestId: `req_helios_${i}` } });
  }
  await prisma.aiCallLog.create({ data: { organizationId: orgId, feature: 'insight', providerKey: 'GEMINI', modelId: 'gemini-2.0-flash', inputTokens: 1200, outputTokens: 0, costUsd: 0, latencyMs: 4200, status: 'FAILED', errorCode: 'PROVIDER_TIMEOUT', requestId: 'req_helios_timeout' } });

  await prisma.kPIInsight.create({ data: { organizationId: orgId, kpiId: kpiIds.get('mrr')!, narrative: 'MRR grew ~31% over the last 12 months to $498k, tracking just below the $520k target. Growth decelerated slightly in Q1 before re-accelerating in Q2.', model: 'gemini-2.0-flash', promptTokens: 920, completionTokens: 180, confidence: 0.82 } });
  await prisma.kPIInsight.create({ data: { organizationId: orgId, kpiId: kpiIds.get('churn')!, narrative: 'Gross logo churn rose from 3.1% to 3.6%, breaching the 2.5% target. The increase concentrates in SMB accounts onboarded in Q4.', model: 'claude-haiku-4-5', promptTokens: 870, completionTokens: 210, confidence: 0.74 } });
  await prisma.kPIInsight.create({ data: { organizationId: orgId, kpiId: kpiIds.get('nps')!, narrative: 'NPS improved to 53, above the industry median of 41 and approaching the 55 target.', model: 'gemini-2.0-flash', promptTokens: 640, completionTokens: 120, confidence: 0.88 } });

  const recChurn = await prisma.recommendation.create({ data: { organizationId: orgId, kpiId: kpiIds.get('churn')!, alertId: alertChurn.id, confidence: 0.76, status: 'PENDING', content: { summary: 'Churn is driven by SMB accounts lacking onboarding completion.', rootCauseHypotheses: ['Incomplete onboarding correlates with churn', 'Pricing change in Q4 affected price-sensitive SMBs'], suggestedActions: ['Launch a 30-day onboarding nudge sequence', 'Offer a retention discount to at-risk SMB cohort'] } }, select: { id: true } });

  await prisma.anomalyDetection.create({ data: { organizationId: orgId, kpiId: kpiIds.get('cac')!, score: 3.4, method: 'ENSEMBLE', isConfirmed: true, detectedAt: at('2026-06-03T05:00:00.000Z') } });
  await prisma.anomalyDetection.create({ data: { organizationId: orgId, kpiId: kpiIds.get('uptime')!, score: 2.1, method: 'ZSCORE', isConfirmed: false, detectedAt: at('2026-04-19T05:00:00.000Z') } });

  await prisma.forecast.create({ data: { organizationId: orgId, kpiId: kpiIds.get('mrr')!, horizon: 6, model: 'PROPHET', fitMetrics: { rmse: 9200, mape: 0.018 }, predictions: MONTHS.slice(6).map((m, i) => ({ ds: `2026-0${7 + i}`, yhat: round(498000 + (i + 1) * 16000, 0), yhat_lower_80: round(498000 + (i + 1) * 16000 - 12000, 0), yhat_upper_80: round(498000 + (i + 1) * 16000 + 12000, 0) })) } });

  await prisma.nLQQuery.create({ data: { organizationId: orgId, userId: adminId, question: 'What was MRR last month?', response: { answer: `MRR in ${monthLabel('2026-05')} was approximately $482k.`, sources: ['kpi:mrr'] }, latencyMs: 1100, costUsd: 0.004, inputTokens: 700, outputTokens: 90, providerKey: 'GEMINI', modelId: 'gemini-2.0-flash', status: 'SUCCESS' } });
  await prisma.nLQQuery.create({ data: { organizationId: orgId, userId: userIds.get('vps')!, question: 'Which AE has the highest quota attainment?', response: { answer: 'Jake Turner leads quota attainment at ~116%.', sources: ['kpi:quota'] }, latencyMs: 1340, costUsd: 0.005, inputTokens: 820, outputTokens: 110, providerKey: 'GEMINI', modelId: 'gemini-2.0-flash', status: 'SUCCESS' } });

  // KPI catalog embeddings (vectors written via raw SQL in prod; here scalar-only rows).
  await prisma.kpiCatalogEmbedding.create({ data: { organizationId: orgId, kpiId: kpiIds.get('mrr')!, sourceText: 'Monthly Recurring Revenue — total recurring subscription revenue', providerKey: 'GEMINI' } });
  await prisma.kpiCatalogEmbedding.create({ data: { organizationId: orgId, kpiId: kpiIds.get('nps')!, sourceText: 'Net Promoter Score — customer loyalty', providerKey: 'GEMINI' } });
  log('Created AI providers/configs/budget + call logs + insights + recommendation + anomalies + forecast + NLQ + embeddings');

  // --- Onboarding (session + interaction + checklist tasks) --------------
  const onbSession = await prisma.onboardingSession.create({ data: { organizationId: orgId, organizationName: 'Helios Cloud, Inc.', userId: adminId, userEmail: ADMIN_EMAIL, payload: { step: 'review', org: { name: 'Helios Cloud, Inc.' }, kpisSelected: ['MRR', 'NRR', 'CAC', 'NPS'] }, status: 'completed', entryMode: 'full', completedAt: at('2024-09-01T01:00:00.000Z') }, select: { id: true } });
  await prisma.onboardingAIInteraction.create({ data: { sessionId: onbSession.id, mode: 'generator', prompt: 'We are a B2B SaaS observability company, ~40 people. Suggest a KPI set.', response: 'Recommended starter KPIs: MRR, NRR, Gross Churn, CAC, LTV:CAC, NPS, Uptime, Deployment Frequency.', appliedSections: ['kpis'], editedSections: ['units'], rejectedSections: [], promptTokens: 540, completionTokens: 260, latencyMs: 2100, providerKey: 'GEMINI', modelId: 'gemini-2.0-flash', costUsd: 0.006 } });
  const checklist: Array<[string, string]> = [
    ['invite_team', 'completed'], ['create_first_dashboard', 'completed'], ['connect_data_source', 'completed'],
    ['set_up_alerts', 'completed'], ['define_okrs', 'in_progress'], ['configure_sso', 'pending'],
    ['customize_branding', 'completed'], ['invite_billing_admin', 'pending'],
  ];
  for (const [key, status] of checklist) {
    await prisma.onboardingTask.create({ data: { organizationId: orgId, key, status, completedAt: status === 'completed' ? at('2024-09-05T00:00:00.000Z') : null, completedById: status === 'completed' ? adminId : null } });
  }
  log(`Created onboarding session + interaction + ${checklist.length} checklist tasks`);

  // --- Collaboration: tasks + comments + mentions ------------------------
  const taskSpecs: Array<{ key: string; title: string; desc?: string; kpiKey?: string; alertId?: string; assignee: string; status: string; priority: string; dueDays: number; creator: string }> = [
    { key: 't_churn', title: 'Investigate Q4 SMB churn spike', desc: 'Pull cohort data and identify the churn driver.', kpiKey: 'churn', alertId: alertChurn.id, assignee: 'csl', status: 'IN_PROGRESS', priority: 'HIGH', dueDays: 5, creator: 'coo' },
    { key: 't_cac', title: 'Review paid-acquisition spend driving CAC up', kpiKey: 'cac', assignee: 'mm', status: 'TODO', priority: 'MEDIUM', dueDays: 10, creator: 'vps' },
    { key: 't_uptime', title: 'Post-mortem for April uptime incident', kpiKey: 'uptime', assignee: 'em2', status: 'DONE', priority: 'HIGH', dueDays: -20, creator: 'cto' },
    { key: 't_onboard', title: 'Ship onboarding nudge email sequence', assignee: 'csm1', status: 'TODO', priority: 'HIGH', dueDays: 7, creator: 'csl' },
    { key: 't_hiring', title: 'Close two senior engineer reqs', kpiKey: 'timetohire', assignee: 'rec', status: 'IN_PROGRESS', priority: 'MEDIUM', dueDays: 21, creator: 'pplm' },
    { key: 't_board', title: 'Prepare Q2 board deck', assignee: 'cfo', status: 'BLOCKED', priority: 'URGENT', dueDays: 3, creator: 'ceo' },
  ];
  const taskIds = new Map<string, string>();
  for (const t of taskSpecs) {
    const due = new Date(SEED_NOW.getTime() + t.dueDays * 24 * 3600 * 1000);
    const task = await prisma.task.create({
      data: { organizationId: orgId, title: t.title, description: t.desc, kpiId: t.kpiKey ? kpiIds.get(t.kpiKey) : null, alertId: t.alertId ?? null, assigneeUserId: userIds.get(t.assignee)!, status: t.status as never, priority: t.priority as never, dueAt: due, createdById: userIds.get(t.creator)! },
      select: { id: true },
    });
    taskIds.set(t.key, task.id);
  }
  // A threaded comment on the churn task with a mention.
  const comment1 = await prisma.comment.create({ data: { organizationId: orgId, entityType: 'task', entityId: taskIds.get('t_churn')!, authorId: userIds.get('coo')!, body: 'Looping in @maya — can your team own the cohort analysis this week?', mentionedUserIds: [userIds.get('csl')!] }, select: { id: true } });
  await prisma.mention.create({ data: { organizationId: orgId, commentId: comment1.id, mentionedUserId: userIds.get('csl')! } });
  await prisma.comment.create({ data: { organizationId: orgId, entityType: 'task', entityId: taskIds.get('t_churn')!, parentCommentId: comment1.id, authorId: userIds.get('csl')!, body: 'On it — will share the SMB cohort breakdown by Thursday.', mentionedUserIds: [] } });
  await prisma.comment.create({ data: { organizationId: orgId, entityType: 'kpi', entityId: kpiIds.get('mrr')!, authorId: userIds.get('cfo')!, body: 'MRR re-accelerated nicely in Q2 — great work team.', mentionedUserIds: [] } });
  log(`Created ${taskSpecs.length} tasks + 3 comments + 1 mention`);

  // --- OKRs: aligned objective tree + key results ------------------------
  const qStart = at('2026-04-01T00:00:00.000Z');
  const qEnd = at('2026-06-30T00:00:00.000Z');
  const objCompany = await prisma.objective.create({ data: { organizationId: orgId, name: 'Reach $520k MRR with healthy retention', ownerUserId: adminId, periodStart: qStart, periodEnd: qEnd, status: 'ACTIVE', progress: 0.72 }, select: { id: true } });
  const objSales = await prisma.objective.create({ data: { organizationId: orgId, name: 'Accelerate new-logo acquisition', ownerUserId: userIds.get('vps')!, parentObjectiveId: objCompany.id, periodStart: qStart, periodEnd: qEnd, status: 'ACTIVE', progress: 0.65 }, select: { id: true } });
  const objCs = await prisma.objective.create({ data: { organizationId: orgId, name: 'Drive net revenue retention to 115%', ownerUserId: userIds.get('csl')!, parentObjectiveId: objCompany.id, periodStart: qStart, periodEnd: qEnd, status: 'AT_RISK', progress: 0.48 }, select: { id: true } });
  await prisma.keyResult.create({ data: { organizationId: orgId, objectiveId: objCompany.id, name: 'Grow MRR to $520k', kpiId: kpiIds.get('mrr')!, baselineValue: 380000, targetValue: 520000, currentValue: lastOrgValue.get('mrr')!, weight: 1, progress: 0.84 } });
  await prisma.keyResult.create({ data: { organizationId: orgId, objectiveId: objSales.id, name: 'Close 30 new logos / month', kpiId: kpiIds.get('newlogos')!, baselineValue: 20, targetValue: 30, currentValue: lastOrgValue.get('newlogos')!, weight: 1, progress: 0.65 } });
  await prisma.keyResult.create({ data: { organizationId: orgId, objectiveId: objSales.id, name: 'Lift win rate to 30%', kpiId: kpiIds.get('winrate')!, baselineValue: 24, targetValue: 30, currentValue: lastOrgValue.get('winrate')!, weight: 0.8, progress: 0.6 } });
  await prisma.keyResult.create({ data: { organizationId: orgId, objectiveId: objCs.id, name: 'Reduce gross churn to 2.5%', kpiId: kpiIds.get('churn')!, baselineValue: 3.1, targetValue: 2.5, currentValue: lastOrgValue.get('churn')!, weight: 1, progress: 0.3 } });
  await prisma.keyResult.create({ data: { organizationId: orgId, objectiveId: objCs.id, name: 'NRR to 115%', kpiId: kpiIds.get('nrr')!, baselineValue: 106, targetValue: 115, currentValue: lastOrgValue.get('nrr')!, weight: 1, progress: 0.66 } });
  log('Created 3 aligned objectives + 5 key results');

  // --- Approvals + automation workflow -----------------------------------
  const apWorkflow = await prisma.approvalWorkflow.create({ data: { organizationId: orgId, entityType: 'KPI_TARGET', requiredApproverRoleIds: [roleIds.get('Administrator')!, roleIds.get('Executive')!], requireAll: false, isActive: true }, select: { id: true } });
  await prisma.approvalRequest.create({ data: { organizationId: orgId, workflowId: apWorkflow.id, entityType: 'KPI_TARGET', entityId: kpiIds.get('newlogos')!, requesterUserId: userIds.get('sm')!, status: 'PENDING', proposedPayload: { kpiId: kpiIds.get('newlogos'), type: 'STATIC', value: 35 }, currentPayload: { kpiId: kpiIds.get('newlogos'), type: 'STATIC', value: 30 }, decisions: [] } });
  await prisma.workflow.create({ data: { organizationId: orgId, name: 'Auto-create task on HIGH alert', description: 'When a HIGH-severity alert fires, create a follow-up task for the KPI owner.', triggers: ['alert'], rule: { all: [{ fact: 'alert.severity', operator: 'equal', value: 'HIGH' }] }, action: { type: 'create_task', params: { assignTo: 'kpi_owner', priority: 'HIGH' } }, isActive: true, lastRunAt: at('2026-06-02T06:00:10.000Z'), createdById: adminId } });
  log('Created approval workflow + pending request + 1 automation workflow');

  // --- Integrations: connection + connector + pipeline + ingestion + plugin
  await prisma.integrationConnection.create({ data: { organizationId: orgId, provider: 'slack', displayName: 'Helios Slack', encryptedTokens: { ct: 'enc:slack' }, scopes: ['chat:write', 'channels:read'], status: 'CONNECTED', lastSyncAt: SEED_NOW, createdById: userIds.get('opsm')! } });
  await prisma.integrationConnection.create({ data: { organizationId: orgId, provider: 'jira', displayName: 'Engineering Jira', encryptedTokens: { ct: 'enc:jira' }, scopes: ['read:jira-work', 'write:jira-work'], status: 'CONNECTED', lastSyncAt: SEED_NOW, createdById: userIds.get('cto')! } });
  const connector = await prisma.connector.create({ data: { organizationId: orgId, name: 'Stripe MRR sync', type: 'REST', config: { url: 'https://api.stripe.com/v1/subscriptions', valuePath: 'data.mrr', authRef: 'enc:stripe-key' }, schedule: '0 */6 * * *', isActive: true, lastRunAt: SEED_NOW, lastRunStatus: 'SUCCEEDED', createdById: userIds.get('fm')! }, select: { id: true } });
  await prisma.pipeline.create({ data: { organizationId: orgId, connectorId: connector.id, name: 'Stripe → MRR KPI', steps: [{ stage: 'source', connectorId: connector.id }, { stage: 'load', kpiId: kpiIds.get('mrr'), valuePath: 'data.mrr' }], status: 'IDLE', lastRunAt: SEED_NOW } });
  await prisma.ingestionJob.create({ data: { organizationId: orgId, kind: 'connector', source: { label: 'Stripe MRR sync', connectorId: connector.id, rowCount: 1 }, status: 'succeeded', startedAt: SEED_NOW, finishedAt: SEED_NOW } });
  await prisma.ingestionJob.create({ data: { organizationId: orgId, kind: 'csv', source: { label: 'Q1 headcount.csv', rowCount: 41 }, status: 'succeeded', startedAt: at('2026-04-01T10:00:00.000Z'), finishedAt: at('2026-04-01T10:00:05.000Z') } });
  await prisma.plugin.create({ data: { organizationId: orgId, name: 'Heatmap Widget', type: 'WIDGET', version: '1.2.0', entryUrl: 'https://plugins.helios.io/heatmap/entry.js', description: 'A calendar-heatmap visualization widget.', isEnabled: true, installedById: userIds.get('opsm')! } });
  log('Created 2 integration connections + connector + pipeline + 2 ingestion jobs + plugin');

  // --- SSO + SCIM + custom domain ----------------------------------------
  await prisma.ssoConfig.create({ data: { organizationId: orgId, protocol: 'OIDC', idpEntityId: 'https://helios.okta.com', idpSsoUrl: 'https://helios.okta.com/sso/oidc', allowJitProvisioning: true, defaultRoleId: roleIds.get('Viewer')!, isActive: false } });
  await prisma.scimToken.create({ data: { organizationId: orgId, label: 'Okta SCIM', hashedToken: 'hashed_scim_helios_0001', createdById: adminId } });
  await prisma.customDomain.create({ data: { organizationId: orgId, domain: 'metrics.helios.io', txtChallengeKey: '_helios-challenge', txtChallengeValue: 'verify=helios-demo-token', verifiedAt: SEED_NOW } });
  log('Created SSO config + SCIM token + custom domain');

  // --- Governance: quotas, flags, cost metrics, retention, audit, RBAC ---
  const quotaSpecs: Array<[string, number, number]> = [['kpis', 0, KPI_SPECS.length], ['dashboards', 0, 4], ['users', 0, userIds.size], ['ai_calls_daily', 2000, 7]];
  for (const [key, limit, current] of quotaSpecs) {
    await prisma.tenantQuota.create({ data: { organizationId: orgId, key, limit, current, periodStart: at('2026-06-01T00:00:00.000Z') } });
  }
  const flagSpecs: Array<[string, boolean, number | null]> = [['ai_insights', true, null], ['public_share_links', true, null], ['nlq', true, null], ['scim_provisioning', false, 25], ['custom_domains', true, null]];
  for (const [key, enabled, rollout] of flagSpecs) {
    await prisma.featureFlag.create({ data: { organizationId: orgId, key, enabled, rolloutPercent: rollout } });
  }
  // 30 days of cost metrics.
  for (let d = 0; d < 30; d++) {
    const day = new Date(Date.UTC(2026, 4, 7 + d)); // May 7 → Jun 5 2026 (fixed, no Date.now)
    await prisma.costMetric.create({ data: { organizationId: orgId, day, kpiCount: KPI_SPECS.length, dataPointsToday: 40 + (d % 7) * 6, alertsToday: d % 5 === 0 ? 1 : 0, aiInputTokens: 4000 + d * 120, aiOutputTokens: 1100 + d * 40, aiCostUsd: round(0.4 + (d % 6) * 0.08, 4), apiRequests: 1800 + d * 60, storageBytes: BigInt(52_000_000 + d * 800_000) } });
  }
  for (const [entityType, days] of [['kpi_data_point', 1095], ['audit_log', 365], ['ai_call_log', 180]] as Array<[string, number]>) {
    await prisma.retentionPolicy.create({ data: { organizationId: orgId, entityType, days, isActive: true } });
  }
  // Audit log + login attempts.
  await prisma.auditLog.create({ data: { organizationId: orgId, action: 'CREATE', entityType: 'organization', entityId: orgId, userId: adminId, userEmail: ADMIN_EMAIL, metadata: { via: 'seed' } } });
  await prisma.auditLog.create({ data: { organizationId: orgId, action: 'LOGIN', userId: adminId, userEmail: ADMIN_EMAIL, ipAddress: '203.0.113.10' } });
  await prisma.auditLog.create({ data: { organizationId: orgId, action: 'UPDATE', entityType: 'kpi', entityId: kpiIds.get('mrr')!, userId: userIds.get('cfo')!, userEmail: 'diane.foster@helios.io', changes: { targetValue: { from: 500000, to: 520000 } } } });
  await prisma.loginAttempt.create({ data: { email: ADMIN_EMAIL, organizationId: orgId, userId: adminId, status: 'SUCCESS', ipAddress: '203.0.113.10' } });
  await prisma.loginAttempt.create({ data: { email: 'unknown@helios.io', organizationId: orgId, status: 'USER_NOT_FOUND', reason: 'No such user' } });

  // Permission delegation: CEO delegates to COO for a window.
  await prisma.permissionDelegation.create({ data: { organizationId: orgId, grantorUserId: adminId, granteeUserId: userIds.get('coo')!, permissions: [], reason: 'CEO out of office', validFrom: at('2026-06-10T00:00:00.000Z'), validTo: at('2026-06-20T00:00:00.000Z') } });
  // Resource permission: give a viewer (recruiter) access to the Sales dashboard.
  await prisma.resourcePermission.create({ data: { organizationId: orgId, subjectType: 'user', subjectId: userIds.get('rec')!, action: 'view', resourceType: 'dashboard', resourceId: dashSales.id, grantedById: adminId } });
  // Per-user access override: revoke KPI_DATA_ENTRY from one contributor; grant extra to another.
  await prisma.userAccessOverride.create({ data: { organizationId: orgId, userId: userIds.get('eng2')!, grantCapabilities: [], revokeCapabilities: ['KPI_DATA_ENTRY'], updatedById: adminId } });
  await prisma.userAccessOverride.create({ data: { organizationId: orgId, userId: userIds.get('gm')!, grantCapabilities: ['REPORTS_VIEW'], revokeCapabilities: [], dataLimits: { historyWindowDays: 365, maxListRows: 1000, maxExportRows: 10000 }, updatedById: adminId } });
  log('Created quotas, feature flags, 30d cost metrics, retention policies, audit logs, login attempts, delegation, resource grant, 2 access overrides');

  // --- Summary -----------------------------------------------------------
  log('──────────────────────────────────────────────');
  log('Seed complete: Helios Cloud, Inc.');
  log(`  roles=${roleIds.size} positions=${positionIds.size} units=${unitIds.size} users=${userIds.size}`);
  log(`  categories=${categoryIds.size} kpis=${kpiCount} dataPoints=${dataPointCount}`);
  log(`  thresholdBands=${bandCount} dashboards=4 reports=2 alertRules=4 alerts=3`);
  log(`  LOGIN:  ${ADMIN_EMAIL}  /  ${DEMO_PASSWORD}   (every user shares this password)`);
  log(`  e.g. olivia.hart@helios.io (CEO/Admin), greg.sullivan@helios.io (VP Sales), tom.becker@helios.io (Engineer).`);
  log('──────────────────────────────────────────────');
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console -- surface seed failures
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
