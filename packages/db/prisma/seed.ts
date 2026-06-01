/**
 * Seed: "Northwind Software" — a realistic ~30-user B2B SaaS company.
 *
 * Idempotent + non-destructive: guards on org slug `northwind`. If the org
 * already exists the script no-ops (prints a message and exits 0). It NEVER
 * wipes other orgs and NEVER runs `migrate reset`.
 *
 * Run:  pnpm --filter @kpi-nexus/db prisma:seed
 *   or  cd packages/db && npx tsx prisma/seed.ts
 *
 * Login after seeding:  admin@northwind.io / Password123!  (every user shares it)
 *
 * Design spec: docs/design-reference/SAMPLE-ORG-SPEC.md
 * Result doc:  docs/design-reference/SAMPLE-ORG-RESULT.md
 *
 * Dates are FIXED (no Date.now()): 12 monthly periods 2025-06 … 2026-05.
 * Series are DETERMINISTIC (index-based interpolation + a tiny deterministic
 * wobble — no Math.random).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ORG_SLUG = 'northwind';
const ADMIN_EMAIL = 'admin@northwind.io';
const DEMO_PASSWORD = 'Password123!';

/**
 * Pre-computed bcrypt hash of `Password123!` at cost factor 12 — the SAME cost
 * the API uses (apps/api/src/auth/auth.service.ts `bcryptRounds = 12`) and the
 * SAME algorithm (`$2b$`), so it verifies under the API's `bcrypt.compare` at
 * login. Hardcoded because the `packages/db` workspace has no bcrypt dependency
 * (the API owns it); the embedded salt makes one hash valid for every user.
 * Verified: bcrypt.compare('Password123!', PASSWORD_HASH) === true.
 *
 * Regenerate (if the password ever changes):
 *   cd apps/api && node -e "console.log(require('bcrypt').hashSync('Password123!',12))"
 */
const PASSWORD_HASH =
  '$2b$12$5a26fuj5QmvnrbeO5TFbKeUVXyT7krdfm6.H5VDg.eDCiiBqlB4CG';

// A fixed "now" so emailVerifiedAt / onboardingCompletedAt are deterministic.
const SEED_NOW = new Date('2026-05-31T00:00:00.000Z');

// ---------------------------------------------------------------------------
// Fixed monthly periods: 2025-06 … 2026-05 (12 months, index 0..11)
// ---------------------------------------------------------------------------
const MONTHS = [
  '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11',
  '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
] as const;

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

// ---------------------------------------------------------------------------
// 18 canonical permission keys (mirror packages/contracts/src/permissions.ts)
// ---------------------------------------------------------------------------
const ALL_PERMISSIONS = [
  'KPI_VIEW', 'KPI_CREATE', 'KPI_EDIT', 'KPI_DELETE', 'KPI_DATA_ENTRY',
  'DASHBOARD_VIEW', 'DASHBOARD_MANAGE',
  'USERS_VIEW', 'USERS_MANAGE', 'ROLES_MANAGE', 'POSITIONS_MANAGE',
  'GROUPS_VIEW', 'GROUPS_MANAGE',
  'ALERTS_VIEW',
  'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW',
  'ORG_SETTINGS',
] as const;

// ---------------------------------------------------------------------------
// Roles (spec §2)
// ---------------------------------------------------------------------------
interface RoleSpec { name: string; isAdmin: boolean; level: number; color: string; permissions: readonly string[] }
const ROLE_SPECS: RoleSpec[] = [
  { name: 'Administrator', isAdmin: true, level: 1, color: '#0284c7', permissions: ALL_PERMISSIONS },
  {
    name: 'Executive', isAdmin: false, level: 2, color: '#7c3aed',
    permissions: ['KPI_VIEW', 'DASHBOARD_VIEW', 'DASHBOARD_MANAGE', 'USERS_VIEW', 'GROUPS_VIEW', 'ALERTS_VIEW', 'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW'],
  },
  {
    name: 'Department Manager', isAdmin: false, level: 3, color: '#0891b2',
    permissions: ['KPI_VIEW', 'KPI_CREATE', 'KPI_EDIT', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'DASHBOARD_MANAGE', 'USERS_VIEW', 'GROUPS_VIEW', 'ALERTS_VIEW', 'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW'],
  },
  {
    name: 'Senior Contributor', isAdmin: false, level: 4, color: '#059669',
    permissions: ['KPI_VIEW', 'KPI_CREATE', 'KPI_EDIT', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'ALERTS_VIEW', 'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW'],
  },
  {
    name: 'Analyst', isAdmin: false, level: 4, color: '#d97706',
    permissions: ['KPI_VIEW', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW'],
  },
  { name: 'Contributor', isAdmin: false, level: 5, color: '#475569', permissions: ['KPI_VIEW', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'ALERTS_VIEW'] },
  { name: 'Viewer', isAdmin: false, level: 6, color: '#94a3b8', permissions: ['KPI_VIEW', 'DASHBOARD_VIEW'] },
];

// ---------------------------------------------------------------------------
// Positions (spec §4)
// ---------------------------------------------------------------------------
interface PositionSpec { name: string; level: number; track: 'IC' | 'MANAGEMENT' | 'EXECUTIVE' }
const POSITION_SPECS: PositionSpec[] = [
  { name: 'Chief Executive Officer', level: 1, track: 'EXECUTIVE' },
  { name: 'Chief Operating Officer', level: 1, track: 'EXECUTIVE' },
  { name: 'Chief Financial Officer', level: 1, track: 'EXECUTIVE' },
  { name: 'VP Engineering', level: 2, track: 'MANAGEMENT' },
  { name: 'VP Sales', level: 2, track: 'MANAGEMENT' },
  { name: 'Engineering Manager', level: 3, track: 'MANAGEMENT' },
  { name: 'Sales Manager', level: 3, track: 'MANAGEMENT' },
  { name: 'Customer Success Lead', level: 3, track: 'MANAGEMENT' },
  { name: 'Marketing Manager', level: 3, track: 'MANAGEMENT' },
  { name: 'People Operations Manager', level: 3, track: 'MANAGEMENT' },
  { name: 'Operations Manager', level: 3, track: 'MANAGEMENT' },
  { name: 'Senior Software Engineer', level: 4, track: 'IC' },
  { name: 'Software Engineer', level: 5, track: 'IC' },
  { name: 'Account Executive', level: 4, track: 'IC' },
  { name: 'Customer Success Manager', level: 4, track: 'IC' },
  { name: 'Finance Analyst', level: 4, track: 'IC' },
  { name: 'Operations Analyst', level: 4, track: 'IC' },
  { name: 'Recruiter', level: 4, track: 'IC' },
  { name: 'Content Marketer', level: 5, track: 'IC' },
  { name: 'Growth Marketer', level: 4, track: 'IC' },
];

// ---------------------------------------------------------------------------
// Org units (spec §3)
// ---------------------------------------------------------------------------
interface UnitSpec { key: string; name: string; code: string; sortOrder: number }
const UNIT_SPECS: UnitSpec[] = [
  { key: 'exec', name: 'Executive', code: 'EXEC', sortOrder: 1 },
  { key: 'eng', name: 'Engineering', code: 'ENG', sortOrder: 2 },
  { key: 'sales', name: 'Sales', code: 'SALES', sortOrder: 3 },
  { key: 'cs', name: 'Customer Success', code: 'CS', sortOrder: 4 },
  { key: 'mkt', name: 'Marketing', code: 'MKT', sortOrder: 5 },
  { key: 'fin', name: 'Finance', code: 'FIN', sortOrder: 6 },
  { key: 'ppl', name: 'People & Culture', code: 'PPL', sortOrder: 7 },
  { key: 'ops', name: 'Operations', code: 'OPS', sortOrder: 8 },
];

// ---------------------------------------------------------------------------
// Users (spec §5) — 30 staff. Managers always precede their reports.
// ---------------------------------------------------------------------------
type UnitRole = 'MEMBER' | 'MANAGER' | 'LEAD' | 'DEPUTY';
interface UserSpec {
  key: string; fullName: string; email: string; role: string; position: string;
  unit: string; managerKey: string | null; unitRole: UnitRole;
}
const USER_SPECS: UserSpec[] = [
  // Executive
  { key: 'sara', fullName: 'Sara Chen', email: 'sara.chen@northwind.io', role: 'Administrator', position: 'Chief Executive Officer', unit: 'exec', managerKey: null, unitRole: 'MANAGER' },
  { key: 'marcus', fullName: 'Marcus Lee', email: 'marcus.lee@northwind.io', role: 'Administrator', position: 'Chief Operating Officer', unit: 'exec', managerKey: 'sara', unitRole: 'MEMBER' },
  { key: 'diane', fullName: 'Diane Foster', email: 'diane.foster@northwind.io', role: 'Executive', position: 'Chief Financial Officer', unit: 'fin', managerKey: 'sara', unitRole: 'MANAGER' },
  // Engineering
  { key: 'priya', fullName: 'Priya Nair', email: 'priya.nair@northwind.io', role: 'Executive', position: 'VP Engineering', unit: 'eng', managerKey: 'sara', unitRole: 'MANAGER' },
  { key: 'devon', fullName: 'Devon Reyes', email: 'devon.reyes@northwind.io', role: 'Department Manager', position: 'Engineering Manager', unit: 'eng', managerKey: 'priya', unitRole: 'LEAD' },
  { key: 'aisha', fullName: 'Aisha Khan', email: 'aisha.khan@northwind.io', role: 'Senior Contributor', position: 'Senior Software Engineer', unit: 'eng', managerKey: 'devon', unitRole: 'MEMBER' },
  { key: 'tom', fullName: 'Tom Becker', email: 'tom.becker@northwind.io', role: 'Contributor', position: 'Software Engineer', unit: 'eng', managerKey: 'devon', unitRole: 'MEMBER' },
  { key: 'lin', fullName: 'Lin Zhao', email: 'lin.zhao@northwind.io', role: 'Senior Contributor', position: 'Senior Software Engineer', unit: 'eng', managerKey: 'devon', unitRole: 'MEMBER' },
  { key: 'omar', fullName: 'Omar Farouk', email: 'omar.farouk@northwind.io', role: 'Contributor', position: 'Software Engineer', unit: 'eng', managerKey: 'devon', unitRole: 'MEMBER' },
  { key: 'hannah', fullName: 'Hannah Webb', email: 'hannah.webb@northwind.io', role: 'Contributor', position: 'Software Engineer', unit: 'eng', managerKey: 'devon', unitRole: 'MEMBER' },
  { key: 'kevin', fullName: 'Kevin Wu', email: 'kevin.wu@northwind.io', role: 'Senior Contributor', position: 'Senior Software Engineer', unit: 'eng', managerKey: 'devon', unitRole: 'MEMBER' },
  // Sales
  { key: 'greg', fullName: 'Greg Sullivan', email: 'greg.sullivan@northwind.io', role: 'Executive', position: 'VP Sales', unit: 'sales', managerKey: 'marcus', unitRole: 'MANAGER' },
  { key: 'bianca', fullName: 'Bianca Rossi', email: 'bianca.rossi@northwind.io', role: 'Department Manager', position: 'Sales Manager', unit: 'sales', managerKey: 'greg', unitRole: 'LEAD' },
  { key: 'carlos', fullName: 'Carlos Mendez', email: 'carlos.mendez@northwind.io', role: 'Contributor', position: 'Account Executive', unit: 'sales', managerKey: 'bianca', unitRole: 'MEMBER' },
  { key: 'nina', fullName: 'Nina Patel', email: 'nina.patel@northwind.io', role: 'Contributor', position: 'Account Executive', unit: 'sales', managerKey: 'bianca', unitRole: 'MEMBER' },
  { key: 'jake', fullName: 'Jake Turner', email: 'jake.turner@northwind.io', role: 'Contributor', position: 'Account Executive', unit: 'sales', managerKey: 'bianca', unitRole: 'MEMBER' },
  { key: 'sofia', fullName: 'Sofia Alvarez', email: 'sofia.alvarez@northwind.io', role: 'Contributor', position: 'Account Executive', unit: 'sales', managerKey: 'bianca', unitRole: 'MEMBER' },
  { key: 'maria', fullName: 'Maria Santos', email: 'maria.santos@northwind.io', role: 'Contributor', position: 'Account Executive', unit: 'sales', managerKey: 'bianca', unitRole: 'MEMBER' },
  // Customer Success
  { key: 'maya', fullName: 'Maya Gupta', email: 'maya.gupta@northwind.io', role: 'Department Manager', position: 'Customer Success Lead', unit: 'cs', managerKey: 'marcus', unitRole: 'MANAGER' },
  { key: 'leah', fullName: 'Leah Kim', email: 'leah.kim@northwind.io', role: 'Contributor', position: 'Customer Success Manager', unit: 'cs', managerKey: 'maya', unitRole: 'MEMBER' },
  { key: 'ryan', fullName: "Ryan O'Neil", email: 'ryan.oneil@northwind.io', role: 'Contributor', position: 'Customer Success Manager', unit: 'cs', managerKey: 'maya', unitRole: 'MEMBER' },
  { key: 'grace', fullName: 'Grace Park', email: 'grace.park@northwind.io', role: 'Contributor', position: 'Customer Success Manager', unit: 'cs', managerKey: 'maya', unitRole: 'MEMBER' },
  // Marketing
  { key: 'felix', fullName: 'Felix Braun', email: 'felix.braun@northwind.io', role: 'Department Manager', position: 'Marketing Manager', unit: 'mkt', managerKey: 'marcus', unitRole: 'MANAGER' },
  { key: 'zoe', fullName: 'Zoe Adler', email: 'zoe.adler@northwind.io', role: 'Senior Contributor', position: 'Growth Marketer', unit: 'mkt', managerKey: 'felix', unitRole: 'MEMBER' },
  { key: 'ivan', fullName: 'Ivan Petrov', email: 'ivan.petrov@northwind.io', role: 'Contributor', position: 'Content Marketer', unit: 'mkt', managerKey: 'felix', unitRole: 'MEMBER' },
  // Finance
  { key: 'noah', fullName: 'Noah Bennett', email: 'noah.bennett@northwind.io', role: 'Analyst', position: 'Finance Analyst', unit: 'fin', managerKey: 'diane', unitRole: 'MEMBER' },
  // People & Culture
  { key: 'rachel', fullName: 'Rachel Green', email: 'rachel.green@northwind.io', role: 'Department Manager', position: 'People Operations Manager', unit: 'ppl', managerKey: 'marcus', unitRole: 'MANAGER' },
  { key: 'daniel', fullName: 'Daniel Cruz', email: 'daniel.cruz@northwind.io', role: 'Contributor', position: 'Recruiter', unit: 'ppl', managerKey: 'rachel', unitRole: 'MEMBER' },
  // Operations
  { key: 'victor', fullName: 'Victor Sng', email: 'victor.sng@northwind.io', role: 'Department Manager', position: 'Operations Manager', unit: 'ops', managerKey: 'marcus', unitRole: 'MANAGER' },
  { key: 'emma', fullName: 'Emma Lewis', email: 'emma.lewis@northwind.io', role: 'Analyst', position: 'Operations Analyst', unit: 'ops', managerKey: 'victor', unitRole: 'MEMBER' },
];

// Dedicated admin login alias so the documented admin@northwind.io works.
const ADMIN_SPEC: UserSpec = {
  key: 'admin', fullName: 'Northwind Admin', email: ADMIN_EMAIL,
  role: 'Administrator', position: 'Chief Executive Officer', unit: 'exec',
  managerKey: null, unitRole: 'MEMBER',
};

// ---------------------------------------------------------------------------
// KPI categories (spec §6)
// ---------------------------------------------------------------------------
const CATEGORY_SPECS: { name: string; color: string; icon: string; sortOrder: number }[] = [
  { name: 'Financial', color: '#0284c7', icon: 'dollar-sign', sortOrder: 1 },
  { name: 'Sales & Growth', color: '#059669', icon: 'trending-up', sortOrder: 2 },
  { name: 'Customer Success', color: '#7c3aed', icon: 'heart-handshake', sortOrder: 3 },
  { name: 'Product & Engineering', color: '#d97706', icon: 'cpu', sortOrder: 4 },
  { name: 'People & Culture', color: '#db2777', icon: 'users', sortOrder: 5 },
  { name: 'Operations', color: '#0891b2', icon: 'settings', sortOrder: 6 },
];

// ---------------------------------------------------------------------------
// KPIs (spec §7)
// ---------------------------------------------------------------------------
type Scope = 'ORG_WIDE' | 'PER_UNIT' | 'PER_USER';
type KType = 'NUMBER' | 'PERCENTAGE' | 'CURRENCY' | 'COUNT' | 'DURATION';
type KDir = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
type KAgg = 'LAST' | 'SUM' | 'AVG';
interface KpiSpec {
  key: string; name: string; category: string; scope: Scope; type: KType; unit: string;
  direction: KDir; aggregation: KAgg; target: number; start: number; end: number;
  decimals?: number; unitKey?: string; userKeys?: string[];
  userSeries?: Record<string, [number, number]>; owner: string;
}
const KPI_SPECS: KpiSpec[] = [
  // ===== ORG_WIDE (8) =====
  { key: 'mrr', name: 'Monthly Recurring Revenue', category: 'Financial', scope: 'ORG_WIDE', type: 'CURRENCY', unit: 'USD', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 300000, start: 210000, end: 285000, owner: 'diane' },
  { key: 'arr', name: 'Annual Recurring Revenue', category: 'Financial', scope: 'ORG_WIDE', type: 'CURRENCY', unit: 'USD', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 3600000, start: 2520000, end: 3420000, owner: 'diane' },
  { key: 'nrr', name: 'Net Revenue Retention', category: 'Financial', scope: 'ORG_WIDE', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 110, start: 104, end: 111, owner: 'diane' },
  { key: 'churn', name: 'Gross Logo Churn', category: 'Financial', scope: 'ORG_WIDE', type: 'PERCENTAGE', unit: '%', direction: 'LOWER_IS_BETTER', aggregation: 'LAST', target: 3.0, start: 2.9, end: 3.8, decimals: 1, owner: 'diane' },
  { key: 'cac', name: 'Customer Acquisition Cost', category: 'Sales & Growth', scope: 'ORG_WIDE', type: 'CURRENCY', unit: 'USD', direction: 'LOWER_IS_BETTER', aggregation: 'LAST', target: 1000, start: 980, end: 1240, owner: 'greg' },
  { key: 'nps', name: 'Net Promoter Score', category: 'Customer Success', scope: 'ORG_WIDE', type: 'NUMBER', unit: 'pts', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 50, start: 44, end: 52, decimals: 0, owner: 'maya' },
  { key: 'burn', name: 'Monthly Burn Rate', category: 'Financial', scope: 'ORG_WIDE', type: 'CURRENCY', unit: 'USD', direction: 'LOWER_IS_BETTER', aggregation: 'LAST', target: 400000, start: 420000, end: 380000, owner: 'diane' },
  { key: 'runway', name: 'Cash Runway', category: 'Financial', scope: 'ORG_WIDE', type: 'NUMBER', unit: 'months', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 18, start: 14, end: 18, decimals: 0, owner: 'diane' },
  // ===== PER_UNIT (12) =====
  { key: 'winrate', name: 'Sales Win Rate', category: 'Sales & Growth', scope: 'PER_UNIT', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 28, start: 22, end: 26, decimals: 0, unitKey: 'sales', owner: 'bianca' },
  { key: 'cycle', name: 'Sales Cycle Length', category: 'Sales & Growth', scope: 'PER_UNIT', type: 'NUMBER', unit: 'days', direction: 'LOWER_IS_BETTER', aggregation: 'LAST', target: 30, start: 30, end: 34, decimals: 0, unitKey: 'sales', owner: 'bianca' },
  { key: 'newlogos', name: 'New Logos per Month', category: 'Sales & Growth', scope: 'PER_UNIT', type: 'COUNT', unit: 'logos', direction: 'HIGHER_IS_BETTER', aggregation: 'SUM', target: 25, start: 18, end: 24, decimals: 0, unitKey: 'sales', owner: 'bianca' },
  { key: 'pipeline', name: 'Pipeline Coverage', category: 'Sales & Growth', scope: 'PER_UNIT', type: 'NUMBER', unit: 'x', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 3.0, start: 2.8, end: 3.4, decimals: 1, unitKey: 'sales', owner: 'greg' },
  { key: 'csat', name: 'Customer Satisfaction (CSAT)', category: 'Customer Success', scope: 'PER_UNIT', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 92, start: 90, end: 93, decimals: 0, unitKey: 'cs', owner: 'maya' },
  { key: 'ticket', name: 'Avg. Ticket Resolution', category: 'Customer Success', scope: 'PER_UNIT', type: 'DURATION', unit: 'hours', direction: 'LOWER_IS_BETTER', aggregation: 'AVG', target: 4.0, start: 5.2, end: 4.6, decimals: 1, unitKey: 'cs', owner: 'maya' },
  { key: 'deploys', name: 'Deployment Frequency', category: 'Product & Engineering', scope: 'PER_UNIT', type: 'COUNT', unit: 'deploys/wk', direction: 'HIGHER_IS_BETTER', aggregation: 'AVG', target: 12, start: 8, end: 14, decimals: 0, unitKey: 'eng', owner: 'devon' },
  { key: 'leadtime', name: 'Change Lead Time', category: 'Product & Engineering', scope: 'PER_UNIT', type: 'DURATION', unit: 'hours', direction: 'LOWER_IS_BETTER', aggregation: 'AVG', target: 24, start: 30, end: 22, decimals: 0, unitKey: 'eng', owner: 'devon' },
  { key: 'incidents', name: 'Production Incidents', category: 'Product & Engineering', scope: 'PER_UNIT', type: 'COUNT', unit: 'incidents', direction: 'LOWER_IS_BETTER', aggregation: 'SUM', target: 4, start: 6, end: 3, decimals: 0, unitKey: 'eng', owner: 'devon' },
  { key: 'uptime', name: 'Uptime', category: 'Product & Engineering', scope: 'PER_UNIT', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'AVG', target: 99.9, start: 99.5, end: 99.95, decimals: 2, unitKey: 'eng', owner: 'priya' },
  { key: 'mql', name: 'Marketing Qualified Leads', category: 'Sales & Growth', scope: 'PER_UNIT', type: 'COUNT', unit: 'MQLs', direction: 'HIGHER_IS_BETTER', aggregation: 'SUM', target: 400, start: 320, end: 410, decimals: 0, unitKey: 'mkt', owner: 'felix' },
  { key: 'convrate', name: 'Website Conversion Rate', category: 'Sales & Growth', scope: 'PER_UNIT', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 3.0, start: 2.1, end: 2.6, decimals: 1, unitKey: 'mkt', owner: 'felix' },
  // ===== PER_USER (4) =====
  { key: 'quota', name: 'Quota Attainment', category: 'Sales & Growth', scope: 'PER_USER', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 100, start: 80, end: 100, decimals: 0, userKeys: ['carlos', 'nina', 'jake', 'sofia', 'maria'], userSeries: { carlos: [85, 104], nina: [70, 92], jake: [95, 112], sofia: [60, 78], maria: [88, 101] }, owner: 'bianca' },
  { key: 'renewal', name: 'Renewal Rate', category: 'Customer Success', scope: 'PER_USER', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 95, start: 88, end: 95, decimals: 0, userKeys: ['leah', 'ryan', 'grace'], userSeries: { leah: [88, 95], ryan: [91, 97], grace: [84, 90] }, owner: 'maya' },
  { key: 'prs', name: 'Pull Requests Merged', category: 'Product & Engineering', scope: 'PER_USER', type: 'COUNT', unit: 'PRs', direction: 'HIGHER_IS_BETTER', aggregation: 'SUM', target: 12, start: 8, end: 14, decimals: 0, userKeys: ['aisha', 'tom', 'lin', 'omar', 'hannah', 'kevin'], userSeries: { aisha: [10, 16], tom: [7, 12], lin: [11, 15], omar: [6, 11], hannah: [8, 13], kevin: [9, 15] }, owner: 'devon' },
  { key: 'onboarding', name: 'Onboarding Completion', category: 'Customer Success', scope: 'PER_USER', type: 'PERCENTAGE', unit: '%', direction: 'HIGHER_IS_BETTER', aggregation: 'LAST', target: 90, start: 75, end: 90, decimals: 0, userKeys: ['leah', 'ryan', 'grace'], userSeries: { leah: [80, 92], ryan: [75, 88], grace: [82, 94] }, owner: 'maya' },
];

// ===========================================================================
// Main
// ===========================================================================
async function main(): Promise<void> {
  // eslint-disable-next-line no-console -- seed script is a CLI tool
  const log = (m: string): void => console.log(`[seed] ${m}`);

  const existing = await prisma.organization.findFirst({ where: { slug: ORG_SLUG }, select: { id: true } });
  if (existing) {
    log(`Org "${ORG_SLUG}" already exists (${existing.id}). Idempotent no-op. Login: ${ADMIN_EMAIL} / ${DEMO_PASSWORD}`);
    return;
  }

  // --- Organization ------------------------------------------------------
  const org = await prisma.organization.create({
    data: {
      name: 'Northwind Software',
      slug: ORG_SLUG,
      tenantStatus: 'ACTIVE',
      sizeTier: 'MEDIUM',
      industry: 'Software / SaaS',
      type: 'B2B',
      currency: 'USD',
      locale: 'en-US',
      timezone: 'America/New_York',
      weekStartsOn: 1,
      planKey: 'ENTERPRISE',
      planStartedAt: new Date('2025-01-01T00:00:00.000Z'),
      primaryColor: '#0284c7',
      secondaryColor: '#7c3aed',
    },
    select: { id: true },
  });
  const orgId = org.id;
  log(`Created organization ${orgId} (Northwind Software / ${ORG_SLUG})`);

  // --- Roles -------------------------------------------------------------
  const roleIds = new Map<string, string>();
  for (const r of ROLE_SPECS) {
    const role = await prisma.roleDefinition.create({
      data: { organizationId: orgId, name: r.name, permissions: [...r.permissions], isAdmin: r.isAdmin, level: r.level, color: r.color },
      select: { id: true },
    });
    roleIds.set(r.name, role.id);
  }
  log(`Created ${roleIds.size} roles`);

  // --- Positions ---------------------------------------------------------
  const positionIds = new Map<string, string>();
  for (const p of POSITION_SPECS) {
    const pos = await prisma.position.create({
      data: { organizationId: orgId, name: p.name, level: p.level, track: p.track },
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
    data: { organizationId: orgId, dimensionId: dimension.id, name: 'Department', namePlural: 'Departments', icon: 'building-2', sortOrder: 1 },
    select: { id: true },
  });
  const unitIds = new Map<string, string>();
  for (const u of UNIT_SPECS) {
    const unit = await prisma.orgUnit.create({
      // NOTE: OrgUnit has no `sortOrder` column (that lives on OrgUnitType);
      // UNIT_SPECS are already declared in display order.
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
        data: { organizationId: orgId, orgUnitId, userId: user.id, memberRole: u.unitRole },
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

  const adminId = userIds.get('sara')!; // CEO is the "created by" actor

  // --- KPIs + assignments + targets + data points ------------------------
  const kpiIds = new Map<string, string>();
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
        unit: k.unit,
        scope: k.scope,
        type: k.type,
        direction: k.direction,
        frequency: 'MONTHLY',
        aggregationMethod: k.aggregation,
        status: 'ACTIVE',
        targetValue: k.target,
        ownerUserId,
        createdById: adminId,
      },
      select: { id: true },
    });
    kpiIds.set(k.key, kpi.id);
    kpiCount += 1;
    byScope[k.scope] += 1;

    // Effective target (the KPI detail "Targets" tab reads these).
    await prisma.kPITarget.create({
      data: { organizationId: orgId, kpiId: kpi.id, type: 'STATIC', value: k.target, effectiveFrom: periodStart(MONTHS[0]), createdById: adminId },
    });

    if (k.scope === 'ORG_WIDE') {
      const vals = series(k.start, k.end, decimals);
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
      await prisma.kPIAssignmentOrgUnit.create({
        data: { organizationId: orgId, kpiId: kpi.id, orgUnitId, targetValue: k.target, currentValue: vals[vals.length - 1]! },
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
        await prisma.kPIAssignmentUser.create({
          data: { organizationId: orgId, kpiId: kpi.id, userId, targetValue: k.target, currentValue: vals[vals.length - 1]! },
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

  // --- Threshold bands on 4 headline KPIs (drives status colours) --------
  interface BandSpec { name: string; lower: number | null; upper: number | null; color: string }
  const BAND_SETS: Record<string, BandSpec[]> = {
    mrr: [
      { name: 'Off Track', lower: null, upper: 250000, color: '#dc2626' },
      { name: 'At Risk', lower: 250000, upper: 285000, color: '#d97706' },
      { name: 'On Track', lower: 285000, upper: null, color: '#059669' },
    ],
    nrr: [
      { name: 'Off Track', lower: null, upper: 100, color: '#dc2626' },
      { name: 'At Risk', lower: 100, upper: 108, color: '#d97706' },
      { name: 'On Track', lower: 108, upper: null, color: '#059669' },
    ],
    churn: [
      { name: 'On Track', lower: null, upper: 3.0, color: '#059669' },
      { name: 'At Risk', lower: 3.0, upper: 3.5, color: '#d97706' },
      { name: 'Off Track', lower: 3.5, upper: null, color: '#dc2626' },
    ],
    cac: [
      { name: 'On Track', lower: null, upper: 1000, color: '#059669' },
      { name: 'At Risk', lower: 1000, upper: 1150, color: '#d97706' },
      { name: 'Off Track', lower: 1150, upper: null, color: '#dc2626' },
    ],
  };
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

  // --- Alert rules on the two off-track KPIs ------------------------------
  let alertRuleCount = 0;
  const alertSpecs: { kpiKey: string; name: string; threshold: number; severity: 'LOW' | 'MEDIUM' | 'HIGH' }[] = [
    { kpiKey: 'churn', name: 'Gross Logo Churn above 3.0%', threshold: 3.0, severity: 'HIGH' },
    { kpiKey: 'cac', name: 'CAC above $1,000 target', threshold: 1000, severity: 'MEDIUM' },
  ];
  for (const a of alertSpecs) {
    const kpiId = kpiIds.get(a.kpiKey);
    if (!kpiId) continue;
    await prisma.alertRule.create({
      data: {
        organizationId: orgId,
        kpiId,
        name: a.name,
        ruleType: 'STATIC_THRESHOLD',
        config: { comparator: 'gt', threshold: a.threshold },
        severity: a.severity,
        isActive: true,
        createdById: adminId,
      },
    });
    alertRuleCount += 1;
  }
  log(`Created ${alertRuleCount} alert rules`);

  // --- "Company Overview" dashboard (shared + default) -------------------
  const dashboard = await prisma.dashboard.create({
    data: {
      organizationId: orgId,
      name: 'Company Overview',
      description: 'Org health at a glance — revenue, retention, and risk.',
      ownerUserId: adminId,
      isShared: true,
      isDefault: true,
      createdById: adminId,
    },
    select: { id: true },
  });
  const widgetSpecs: { type: string; title: string; kpiKey: string; x: number; y: number; w: number; h: number }[] = [
    { type: 'kpi_card', title: 'Monthly Recurring Revenue', kpiKey: 'mrr', x: 0, y: 0, w: 4, h: 2 },
    { type: 'kpi_card', title: 'Net Revenue Retention', kpiKey: 'nrr', x: 4, y: 0, w: 4, h: 2 },
    { type: 'kpi_card', title: 'Gross Logo Churn', kpiKey: 'churn', x: 8, y: 0, w: 4, h: 2 },
    { type: 'line', title: 'MRR trend', kpiKey: 'mrr', x: 0, y: 2, w: 8, h: 4 },
    { type: 'kpi_card', title: 'Net Promoter Score', kpiKey: 'nps', x: 8, y: 2, w: 4, h: 2 },
  ];
  let widgetCount = 0;
  for (const w of widgetSpecs) {
    const kpiId = kpiIds.get(w.kpiKey);
    if (!kpiId) continue;
    await prisma.dashboardWidget.create({
      data: {
        organizationId: orgId,
        dashboardId: dashboard.id,
        widgetType: w.type,
        title: w.title,
        config: { kpiId },
        position: { x: w.x, y: w.y, w: w.w, h: w.h },
        sortOrder: widgetCount,
      },
    });
    widgetCount += 1;
  }
  log(`Created 1 dashboard (Company Overview) + ${widgetCount} widgets`);

  // --- Summary -----------------------------------------------------------
  log('──────────────────────────────────────────────');
  log('Seed complete: Northwind Software');
  log(`  roles=${roleIds.size} positions=${positionIds.size} units=${unitIds.size} users=${userIds.size}`);
  log(`  categories=${categoryIds.size} kpis=${kpiCount} dataPoints=${dataPointCount}`);
  log(`  thresholdBands=${bandCount} alertRules=${alertRuleCount} dashboards=1 widgets=${widgetCount}`);
  log(`  LOGIN:  ${ADMIN_EMAIL}  /  ${DEMO_PASSWORD}   (every user shares this password)`);
  log(`  All ${userIds.size} users share ${DEMO_PASSWORD} — e.g. sara.chen@northwind.io (CEO/Administrator).`);
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
