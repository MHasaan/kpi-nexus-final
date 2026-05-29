/**
 * Built-in global KPI templates lazily seeded into the shared catalog (org-less,
 * isGlobal=true). Spans all four BSC quadrants across seven business functions.
 * `seedGlobalIfEmpty` upserts these by slug, so editing/adding here is
 * idempotent across restarts.
 */

export interface GlobalTemplateSeed {
  slug: string;
  name: string;
  description: string;
  type: 'NUMBER' | 'PERCENTAGE' | 'CURRENCY' | 'DURATION' | 'COUNT' | 'RATING' | 'BOOLEAN';
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'TARGET_IS_BEST' | 'NEUTRAL';
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM' | 'REAL_TIME' | 'AD_HOC';
  aggregationMethod: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'MEDIAN' | 'LAST' | 'FIRST' | 'COUNT';
  scorecardQuadrant: 'FINANCIAL' | 'CUSTOMER' | 'INTERNAL_PROCESS' | 'LEARNING_GROWTH';
  function: 'sales' | 'marketing' | 'ops' | 'hr' | 'finance' | 'support' | 'engineering';
  unit: string;
  targetSummary: string;
  tags: string[];
  popularity: number;
}

export const GLOBAL_TEMPLATES: GlobalTemplateSeed[] = [
  // ── FINANCIAL ──────────────────────────────────────────────────────────
  {
    slug: 'monthly-recurring-revenue', name: 'Monthly Recurring Revenue',
    description: 'Predictable subscription revenue normalized to a monthly amount.',
    type: 'CURRENCY', direction: 'HIGHER_IS_BETTER', frequency: 'MONTHLY', aggregationMethod: 'LAST',
    scorecardQuadrant: 'FINANCIAL', function: 'finance', unit: 'USD',
    targetSummary: 'Grow MRR ≥ 8% month-over-month', tags: ['mrr', 'revenue', 'saas', 'arr'], popularity: 95,
  },
  {
    slug: 'gross-margin', name: 'Gross Margin',
    description: 'Revenue minus cost of goods sold, as a percentage of revenue.',
    type: 'PERCENTAGE', direction: 'HIGHER_IS_BETTER', frequency: 'QUARTERLY', aggregationMethod: 'LAST',
    scorecardQuadrant: 'FINANCIAL', function: 'finance', unit: '%',
    targetSummary: 'Maintain gross margin ≥ 70%', tags: ['margin', 'profitability', 'cogs'], popularity: 60,
  },
  {
    slug: 'new-bookings', name: 'New Bookings',
    description: 'Total contract value of new deals closed in the period.',
    type: 'CURRENCY', direction: 'HIGHER_IS_BETTER', frequency: 'MONTHLY', aggregationMethod: 'SUM',
    scorecardQuadrant: 'FINANCIAL', function: 'sales', unit: 'USD',
    targetSummary: 'Hit quarterly bookings quota', tags: ['bookings', 'sales', 'quota', 'pipeline'], popularity: 72,
  },
  {
    slug: 'customer-acquisition-cost', name: 'Customer Acquisition Cost',
    description: 'Fully-loaded sales & marketing spend divided by new customers won.',
    type: 'CURRENCY', direction: 'LOWER_IS_BETTER', frequency: 'MONTHLY', aggregationMethod: 'AVG',
    scorecardQuadrant: 'FINANCIAL', function: 'marketing', unit: 'USD',
    targetSummary: 'Keep CAC payback under 12 months', tags: ['cac', 'marketing', 'efficiency'], popularity: 55,
  },

  // ── CUSTOMER ───────────────────────────────────────────────────────────
  {
    slug: 'net-promoter-score', name: 'Net Promoter Score',
    description: 'Willingness of customers to recommend, scored from -100 to 100.',
    type: 'NUMBER', direction: 'HIGHER_IS_BETTER', frequency: 'QUARTERLY', aggregationMethod: 'LAST',
    scorecardQuadrant: 'CUSTOMER', function: 'support', unit: 'pts',
    targetSummary: 'Reach NPS ≥ 50', tags: ['nps', 'loyalty', 'voice-of-customer', 'csat'], popularity: 88,
  },
  {
    slug: 'customer-churn-rate', name: 'Customer Churn Rate',
    description: 'Share of customers lost during the period.',
    type: 'PERCENTAGE', direction: 'LOWER_IS_BETTER', frequency: 'MONTHLY', aggregationMethod: 'LAST',
    scorecardQuadrant: 'CUSTOMER', function: 'support', unit: '%',
    targetSummary: 'Hold monthly logo churn under 2%', tags: ['churn', 'retention', 'attrition'], popularity: 78,
  },
  {
    slug: 'marketing-qualified-leads', name: 'Marketing Qualified Leads',
    description: 'Leads that meet the qualification bar handed to sales.',
    type: 'COUNT', direction: 'HIGHER_IS_BETTER', frequency: 'WEEKLY', aggregationMethod: 'SUM',
    scorecardQuadrant: 'CUSTOMER', function: 'marketing', unit: 'leads',
    targetSummary: 'Generate target MQL volume weekly', tags: ['mql', 'leads', 'demand-gen', 'funnel'], popularity: 49,
  },

  // ── INTERNAL_PROCESS ─────────────────────────────────────────────────────
  {
    slug: 'order-fulfillment-cycle-time', name: 'Order Fulfillment Cycle Time',
    description: 'Average time from order placed to order shipped.',
    type: 'DURATION', direction: 'LOWER_IS_BETTER', frequency: 'WEEKLY', aggregationMethod: 'AVG',
    scorecardQuadrant: 'INTERNAL_PROCESS', function: 'ops', unit: 'hours',
    targetSummary: 'Ship within 24 hours on average', tags: ['fulfillment', 'cycle-time', 'logistics', 'ops'], popularity: 41,
  },
  {
    slug: 'deployment-frequency', name: 'Deployment Frequency',
    description: 'How often the team ships to production (DORA metric).',
    type: 'COUNT', direction: 'HIGHER_IS_BETTER', frequency: 'WEEKLY', aggregationMethod: 'SUM',
    scorecardQuadrant: 'INTERNAL_PROCESS', function: 'engineering', unit: 'deploys',
    targetSummary: 'Achieve daily deploys (elite DORA)', tags: ['dora', 'deployment', 'devops', 'velocity'], popularity: 67,
  },
  {
    slug: 'change-failure-rate', name: 'Change Failure Rate',
    description: 'Share of deployments causing a production failure (DORA metric).',
    type: 'PERCENTAGE', direction: 'LOWER_IS_BETTER', frequency: 'MONTHLY', aggregationMethod: 'AVG',
    scorecardQuadrant: 'INTERNAL_PROCESS', function: 'engineering', unit: '%',
    targetSummary: 'Keep change failure rate under 15%', tags: ['dora', 'reliability', 'devops', 'quality'], popularity: 53,
  },
  {
    slug: 'first-response-time', name: 'First Response Time',
    description: 'Average time to first human reply on a support ticket.',
    type: 'DURATION', direction: 'LOWER_IS_BETTER', frequency: 'DAILY', aggregationMethod: 'AVG',
    scorecardQuadrant: 'INTERNAL_PROCESS', function: 'support', unit: 'minutes',
    targetSummary: 'Respond within 30 minutes', tags: ['sla', 'support', 'response-time'], popularity: 44,
  },

  // ── LEARNING_GROWTH ──────────────────────────────────────────────────────
  {
    slug: 'employee-engagement-score', name: 'Employee Engagement Score',
    description: 'Survey-based measure of workforce engagement.',
    type: 'RATING', direction: 'HIGHER_IS_BETTER', frequency: 'QUARTERLY', aggregationMethod: 'AVG',
    scorecardQuadrant: 'LEARNING_GROWTH', function: 'hr', unit: 'score',
    targetSummary: 'Sustain engagement ≥ 4.0 / 5', tags: ['engagement', 'culture', 'survey', 'enps'], popularity: 58,
  },
  {
    slug: 'voluntary-attrition-rate', name: 'Voluntary Attrition Rate',
    description: 'Annualized share of employees who leave voluntarily.',
    type: 'PERCENTAGE', direction: 'LOWER_IS_BETTER', frequency: 'MONTHLY', aggregationMethod: 'LAST',
    scorecardQuadrant: 'LEARNING_GROWTH', function: 'hr', unit: '%',
    targetSummary: 'Keep voluntary attrition under 10%', tags: ['attrition', 'retention', 'turnover', 'people'], popularity: 46,
  },
  {
    slug: 'training-hours-per-employee', name: 'Training Hours per Employee',
    description: 'Average professional-development hours invested per head.',
    type: 'DURATION', direction: 'HIGHER_IS_BETTER', frequency: 'QUARTERLY', aggregationMethod: 'AVG',
    scorecardQuadrant: 'LEARNING_GROWTH', function: 'hr', unit: 'hours',
    targetSummary: 'Provide ≥ 20 training hours / quarter', tags: ['training', 'development', 'upskilling'], popularity: 33,
  },
];
