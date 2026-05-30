import type { TemplateKpi, TemplatePayload } from './template-payload.js';

/**
 * Built-in org templates seeded on first use. The "rich" SaaS-Startup template
 * reproduces the original-app seed.ts depth: 10 roles, 14 positions, 11 units,
 * 20 KPIs, 5 categories (the P6 exit criterion). Starters/legacy are lighter.
 */

export interface BuiltinTemplate {
  slug: string;
  name: string;
  description: string;
  tier: 'rich' | 'starter' | 'legacy';
  orgType?: string;
  industry?: string;
  payload: TemplatePayload;
}

const PERM_ADMIN: string[] = []; // isAdmin role gets all 18 implicitly
const PERM_MANAGER = ['KPI_VIEW', 'KPI_CREATE', 'KPI_EDIT', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'DASHBOARD_MANAGE', 'USERS_VIEW', 'ALERTS_VIEW', 'REPORTS_VIEW', 'ANALYTICS_VIEW', 'INSIGHTS_VIEW'];
const PERM_IC = ['KPI_VIEW', 'KPI_DATA_ENTRY', 'DASHBOARD_VIEW', 'ALERTS_VIEW'];
const PERM_VIEWER = ['KPI_VIEW', 'DASHBOARD_VIEW', 'REPORTS_VIEW'];

function kpi(
  name: string,
  category: string,
  type: TemplateKpi['type'],
  direction: TemplateKpi['direction'],
  quadrant: TemplateKpi['scorecardQuadrant'],
  unit?: string,
): TemplateKpi {
  return { name, category, scope: 'ORG_WIDE', type, direction, frequency: 'MONTHLY', unit, scorecardQuadrant: quadrant };
}

const RICH_SAAS: TemplatePayload = {
  organization: { name: 'Acme SaaS', industry: 'Software', type: 'B2B SaaS', sizeTier: 'SCALEUP' },
  roles: [
    { name: 'Admin', isAdmin: true, level: 100, color: '#dc2626', permissions: PERM_ADMIN },
    { name: 'VP Engineering', isAdmin: false, level: 90, color: '#7c3aed', permissions: PERM_MANAGER },
    { name: 'VP Sales', isAdmin: false, level: 90, color: '#2563eb', permissions: PERM_MANAGER },
    { name: 'VP Marketing', isAdmin: false, level: 90, color: '#0891b2', permissions: PERM_MANAGER },
    { name: 'Engineering Manager', isAdmin: false, level: 70, color: '#9333ea', permissions: PERM_MANAGER },
    { name: 'Sales Manager', isAdmin: false, level: 70, color: '#3b82f6', permissions: PERM_MANAGER },
    { name: 'Marketing Manager', isAdmin: false, level: 70, color: '#06b6d4', permissions: PERM_MANAGER },
    { name: 'Senior Engineer', isAdmin: false, level: 40, color: '#16a34a', permissions: PERM_IC },
    { name: 'Sales Representative', isAdmin: false, level: 30, color: '#22c55e', permissions: PERM_IC },
    { name: 'Viewer', isAdmin: false, level: 10, color: '#737373', permissions: PERM_VIEWER },
  ],
  positions: [
    { name: 'Chief Executive Officer', track: 'EXECUTIVE' },
    { name: 'Chief Technology Officer', track: 'EXECUTIVE' },
    { name: 'Chief Revenue Officer', track: 'EXECUTIVE' },
    { name: 'VP of Engineering', track: 'MANAGEMENT' },
    { name: 'VP of Sales', track: 'MANAGEMENT' },
    { name: 'VP of Marketing', track: 'MANAGEMENT' },
    { name: 'Engineering Manager', track: 'MANAGEMENT' },
    { name: 'Sales Manager', track: 'MANAGEMENT' },
    { name: 'Marketing Manager', track: 'MANAGEMENT' },
    { name: 'Senior Software Engineer', track: 'INDIVIDUAL_CONTRIBUTOR' },
    { name: 'Software Engineer', track: 'INDIVIDUAL_CONTRIBUTOR' },
    { name: 'Account Executive', track: 'INDIVIDUAL_CONTRIBUTOR' },
    { name: 'Sales Development Rep', track: 'INDIVIDUAL_CONTRIBUTOR' },
    { name: 'Marketing Specialist', track: 'INDIVIDUAL_CONTRIBUTOR' },
  ],
  orgUnitTypes: [
    { name: 'Company', dimension: 'functional' },
    { name: 'Department', dimension: 'functional' },
    { name: 'Team', dimension: 'functional' },
  ],
  orgUnits: [
    { name: 'Acme SaaS', type: 'Company', code: 'ACME' },
    { name: 'Engineering', type: 'Department', code: 'ENG', parent: 'Acme SaaS' },
    { name: 'Sales', type: 'Department', code: 'SALES', parent: 'Acme SaaS' },
    { name: 'Marketing', type: 'Department', code: 'MKT', parent: 'Acme SaaS' },
    { name: 'Customer Success', type: 'Department', code: 'CS', parent: 'Acme SaaS' },
    { name: 'Platform Team', type: 'Team', code: 'PLAT', parent: 'Engineering' },
    { name: 'Product Team', type: 'Team', code: 'PROD', parent: 'Engineering' },
    { name: 'Enterprise Sales', type: 'Team', code: 'ENT', parent: 'Sales' },
    { name: 'SMB Sales', type: 'Team', code: 'SMB', parent: 'Sales' },
    { name: 'Growth Marketing', type: 'Team', code: 'GROWTH', parent: 'Marketing' },
    { name: 'Content Marketing', type: 'Team', code: 'CONTENT', parent: 'Marketing' },
  ],
  kpiCategories: [
    { name: 'Financial', color: '#16a34a' },
    { name: 'Customer', color: '#2563eb' },
    { name: 'Growth', color: '#9333ea' },
    { name: 'Operations', color: '#ea580c' },
    { name: 'People', color: '#0891b2' },
  ],
  kpis: [
    kpi('Monthly Recurring Revenue', 'Financial', 'CURRENCY', 'HIGHER_IS_BETTER', 'FINANCIAL', 'USD'),
    kpi('Annual Recurring Revenue', 'Financial', 'CURRENCY', 'HIGHER_IS_BETTER', 'FINANCIAL', 'USD'),
    kpi('Gross Margin', 'Financial', 'PERCENTAGE', 'HIGHER_IS_BETTER', 'FINANCIAL', '%'),
    kpi('CAC Payback Period', 'Financial', 'DURATION', 'LOWER_IS_BETTER', 'FINANCIAL', 'months'),
    kpi('Net Promoter Score', 'Customer', 'NUMBER', 'HIGHER_IS_BETTER', 'CUSTOMER'),
    kpi('Customer Churn Rate', 'Customer', 'PERCENTAGE', 'LOWER_IS_BETTER', 'CUSTOMER', '%'),
    kpi('CSAT', 'Customer', 'RATING', 'HIGHER_IS_BETTER', 'CUSTOMER'),
    kpi('Customer Lifetime Value', 'Customer', 'CURRENCY', 'HIGHER_IS_BETTER', 'CUSTOMER', 'USD'),
    kpi('New Signups', 'Growth', 'COUNT', 'HIGHER_IS_BETTER', 'CUSTOMER'),
    kpi('Trial Conversion Rate', 'Growth', 'PERCENTAGE', 'HIGHER_IS_BETTER', 'FINANCIAL', '%'),
    kpi('MQL to SQL Rate', 'Growth', 'PERCENTAGE', 'HIGHER_IS_BETTER', 'INTERNAL_PROCESS', '%'),
    kpi('Website Traffic', 'Growth', 'COUNT', 'HIGHER_IS_BETTER', 'CUSTOMER'),
    kpi('Uptime', 'Operations', 'PERCENTAGE', 'HIGHER_IS_BETTER', 'INTERNAL_PROCESS', '%'),
    kpi('Mean Time to Resolve', 'Operations', 'DURATION', 'LOWER_IS_BETTER', 'INTERNAL_PROCESS', 'hours'),
    kpi('Deploy Frequency', 'Operations', 'COUNT', 'HIGHER_IS_BETTER', 'INTERNAL_PROCESS'),
    kpi('Support Ticket Volume', 'Operations', 'COUNT', 'LOWER_IS_BETTER', 'INTERNAL_PROCESS'),
    kpi('Headcount', 'People', 'COUNT', 'NEUTRAL', 'LEARNING_GROWTH'),
    kpi('Employee Engagement', 'People', 'RATING', 'HIGHER_IS_BETTER', 'LEARNING_GROWTH'),
    kpi('Voluntary Attrition', 'People', 'PERCENTAGE', 'LOWER_IS_BETTER', 'LEARNING_GROWTH', '%'),
    kpi('Time to Hire', 'People', 'DURATION', 'LOWER_IS_BETTER', 'LEARNING_GROWTH', 'days'),
  ],
};

const STARTER_TECH: TemplatePayload = {
  organization: { name: 'Tech Co', industry: 'Software', type: 'Startup', sizeTier: 'STARTUP' },
  roles: [
    { name: 'Admin', isAdmin: true, level: 100, permissions: PERM_ADMIN },
    { name: 'Manager', isAdmin: false, level: 70, permissions: PERM_MANAGER },
    { name: 'Member', isAdmin: false, level: 30, permissions: PERM_IC },
  ],
  positions: [
    { name: 'Founder', track: 'EXECUTIVE' },
    { name: 'Engineer', track: 'INDIVIDUAL_CONTRIBUTOR' },
  ],
  orgUnitTypes: [{ name: 'Company', dimension: 'functional' }],
  orgUnits: [{ name: 'Tech Co', type: 'Company' }],
  kpiCategories: [{ name: 'Financial' }, { name: 'Product' }],
  kpis: [
    kpi('Monthly Recurring Revenue', 'Financial', 'CURRENCY', 'HIGHER_IS_BETTER', 'FINANCIAL', 'USD'),
    kpi('Active Users', 'Product', 'COUNT', 'HIGHER_IS_BETTER', 'CUSTOMER'),
    kpi('Churn Rate', 'Product', 'PERCENTAGE', 'LOWER_IS_BETTER', 'CUSTOMER', '%'),
    kpi('Burn Rate', 'Financial', 'CURRENCY', 'LOWER_IS_BETTER', 'FINANCIAL', 'USD'),
    kpi('Feature Adoption', 'Product', 'PERCENTAGE', 'HIGHER_IS_BETTER', 'INTERNAL_PROCESS', '%'),
  ],
};

const STARTER_RETAIL: TemplatePayload = {
  organization: { name: 'Retail Co', industry: 'Retail', type: 'Retail', sizeTier: 'SMB' },
  roles: [
    { name: 'Admin', isAdmin: true, level: 100, permissions: PERM_ADMIN },
    { name: 'Store Manager', isAdmin: false, level: 70, permissions: PERM_MANAGER },
    { name: 'Associate', isAdmin: false, level: 30, permissions: PERM_IC },
  ],
  positions: [
    { name: 'Owner', track: 'EXECUTIVE' },
    { name: 'Store Associate', track: 'INDIVIDUAL_CONTRIBUTOR' },
  ],
  orgUnitTypes: [{ name: 'Company', dimension: 'functional' }],
  orgUnits: [{ name: 'Retail Co', type: 'Company' }],
  kpiCategories: [{ name: 'Sales' }, { name: 'Operations' }],
  kpis: [
    kpi('Total Sales', 'Sales', 'CURRENCY', 'HIGHER_IS_BETTER', 'FINANCIAL', 'USD'),
    kpi('Average Order Value', 'Sales', 'CURRENCY', 'HIGHER_IS_BETTER', 'FINANCIAL', 'USD'),
    kpi('Conversion Rate', 'Sales', 'PERCENTAGE', 'HIGHER_IS_BETTER', 'CUSTOMER', '%'),
    kpi('Inventory Turnover', 'Operations', 'NUMBER', 'HIGHER_IS_BETTER', 'INTERNAL_PROCESS'),
    kpi('Footfall', 'Operations', 'COUNT', 'HIGHER_IS_BETTER', 'CUSTOMER'),
  ],
};

const LEGACY_MINIMAL: TemplatePayload = {
  organization: { name: 'My Organization' },
  roles: [{ name: 'Admin', isAdmin: true, level: 100, permissions: PERM_ADMIN }],
  positions: [{ name: 'Owner', track: 'EXECUTIVE' }],
  orgUnitTypes: [{ name: 'Company', dimension: 'functional' }],
  orgUnits: [{ name: 'My Organization', type: 'Company' }],
  kpiCategories: [{ name: 'General' }],
  kpis: [kpi('Revenue', 'General', 'CURRENCY', 'HIGHER_IS_BETTER', 'FINANCIAL', 'USD')],
};

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  { slug: 'saas-startup-rich', name: 'SaaS Startup (Rich)', description: 'Full B2B SaaS org — 10 roles, 14 positions, 11 units, 20 KPIs, 5 categories.', tier: 'rich', orgType: 'B2B SaaS', industry: 'Software', payload: RICH_SAAS },
  { slug: 'tech-starter', name: 'Tech Starter', description: 'Lean software startup — 3 roles, 5 KPIs.', tier: 'starter', orgType: 'Startup', industry: 'Software', payload: STARTER_TECH },
  { slug: 'retail-starter', name: 'Retail Starter', description: 'Small retail business — 3 roles, 5 KPIs.', tier: 'starter', orgType: 'Retail', industry: 'Retail', payload: STARTER_RETAIL },
  { slug: 'minimal', name: 'Minimal', description: 'One role, one KPI — start from scratch.', tier: 'legacy', payload: LEGACY_MINIMAL },
];
