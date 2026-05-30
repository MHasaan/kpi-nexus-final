import type { GoldenQuestion } from './scorer.js';

/**
 * Hand-crafted NLQ acceptance set. Each question targets a specific seeded KPI
 * (see the names below). The live harness (scripts/nlq-golden.mjs) seeds an org
 * with these KPIs + data, asks each question, and scores answers with
 * {@link scoreAnswer}. Exit target: ≥ 80% pass.
 */

/** KPIs the harness seeds (name → recent values) so the questions have answers. */
export const GOLDEN_KPIS: Array<{ name: string; values: number[] }> = [
  { name: 'Monthly Recurring Revenue', values: [100, 110, 125, 140, 160, 185] },
  { name: 'Customer Churn Rate', values: [5.2, 4.8, 4.5, 4.1, 3.9, 3.6] },
  { name: 'Net Promoter Score', values: [30, 34, 38, 41, 45, 50] },
  { name: 'Customer Acquisition Cost', values: [420, 400, 390, 370, 360, 350] },
  { name: 'Active Users', values: [1200, 1350, 1500, 1720, 1900, 2100] },
  { name: 'Average Order Value', values: [54, 56, 55, 58, 60, 62] },
  { name: 'Support Ticket Volume', values: [320, 300, 280, 260, 250, 240] },
  { name: 'Conversion Rate', values: [2.1, 2.3, 2.4, 2.6, 2.8, 3.0] },
];

export const GOLDEN_QUESTIONS: GoldenQuestion[] = [
  { question: 'What is our Monthly Recurring Revenue trend?', expectKeywords: ['MRR', 'recurring', 'revenue', '185'], expectKpiNames: ['Monthly Recurring Revenue'] },
  { question: 'How is customer churn doing?', expectKeywords: ['churn', '3.6', 'decreas', 'down'], expectKpiNames: ['Customer Churn Rate'] },
  { question: 'What is our latest Net Promoter Score?', expectKeywords: ['NPS', 'promoter', '50'], expectKpiNames: ['Net Promoter Score'] },
  { question: 'Tell me about customer acquisition cost.', expectKeywords: ['acquisition', 'CAC', '350', 'cost'], expectKpiNames: ['Customer Acquisition Cost'] },
  { question: 'Are active users growing?', expectKeywords: ['active', 'users', '2100', 'grow'], expectKpiNames: ['Active Users'] },
  { question: 'What is the average order value?', expectKeywords: ['order', 'value', '62', 'AOV'], expectKpiNames: ['Average Order Value'] },
  { question: 'How many support tickets are we getting?', expectKeywords: ['support', 'ticket', '240'], expectKpiNames: ['Support Ticket Volume'] },
  { question: 'What is our conversion rate?', expectKeywords: ['conversion', '3.0', '3', 'rate'], expectKpiNames: ['Conversion Rate'] },
];
