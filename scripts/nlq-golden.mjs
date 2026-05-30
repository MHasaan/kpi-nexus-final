/**
 * NLQ golden-question live harness. Seeds an org with the golden KPIs + data,
 * reembeds the catalog, asks each golden question against the running api, and
 * scores answers with the same 3-subcheck rule as scorer.ts. Reports the pass
 * rate (target ≥ 80%). Requires the api running with live AI keys.
 *
 * Usage: node scripts/nlq-golden.mjs   (API_URL env optional, default :4000)
 */

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const GOLDEN_KPIS = [
  { name: 'Monthly Recurring Revenue', values: [100, 110, 125, 140, 160, 185] },
  { name: 'Customer Churn Rate', values: [5.2, 4.8, 4.5, 4.1, 3.9, 3.6] },
  { name: 'Net Promoter Score', values: [30, 34, 38, 41, 45, 50] },
  { name: 'Customer Acquisition Cost', values: [420, 400, 390, 370, 360, 350] },
  { name: 'Active Users', values: [1200, 1350, 1500, 1720, 1900, 2100] },
  { name: 'Average Order Value', values: [54, 56, 55, 58, 60, 62] },
  { name: 'Support Ticket Volume', values: [320, 300, 280, 260, 250, 240] },
  { name: 'Conversion Rate', values: [2.1, 2.3, 2.4, 2.6, 2.8, 3.0] },
];

const QUESTIONS = [
  { q: 'What is our Monthly Recurring Revenue trend?', kw: ['mrr', 'recurring', 'revenue', '185'], src: ['monthly recurring revenue'] },
  { q: 'How is customer churn doing?', kw: ['churn', '3.6', 'decreas', 'down'], src: ['customer churn rate'] },
  { q: 'What is our latest Net Promoter Score?', kw: ['nps', 'promoter', '50'], src: ['net promoter score'] },
  { q: 'Tell me about customer acquisition cost.', kw: ['acquisition', 'cac', '350', 'cost'], src: ['customer acquisition cost'] },
  { q: 'Are active users growing?', kw: ['active', 'users', '2100', 'grow'], src: ['active users'] },
  { q: 'What is the average order value?', kw: ['order', 'value', '62', 'aov'], src: ['average order value'] },
  { q: 'How many support tickets are we getting?', kw: ['support', 'ticket', '240'], src: ['support ticket volume'] },
  { q: 'What is our conversion rate?', kw: ['conversion', '3.0', '3', 'rate'], src: ['conversion rate'] },
];

function score(answer, sources, item) {
  const a = (answer ?? '').toLowerCase();
  const nonEmpty = a.trim().length > 0;
  const keyword = item.kw.some((k) => a.includes(k.toLowerCase()));
  const names = sources.map((s) => s.name.toLowerCase());
  const source = item.src.some((n) => names.some((sn) => sn.includes(n.toLowerCase())));
  const passed = [keyword, source, nonEmpty].filter(Boolean).length >= 2;
  return { keyword, source, nonEmpty, passed };
}

async function main() {
  const stamp = `${Date.now()}`;
  const reg = await (await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      orgName: `Golden ${stamp}`,
      slug: `golden-${stamp}`,
      adminEmail: `admin-${stamp}@golden.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Golden Admin',
    }),
  })).json();
  const token = reg.accessToken;
  const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  for (const kpi of GOLDEN_KPIS) {
    const created = await (await fetch(`${API_URL}/kpis`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ name: kpi.name, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' }),
    })).json();
    for (let i = 0; i < kpi.values.length; i += 1) {
      const m = String(i + 1).padStart(2, '0');
      await fetch(`${API_URL}/kpis/${created.id}/data`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ value: kpi.values[i], periodStart: `2026-${m}-01`, periodEnd: `2026-${m}-28` }),
      });
    }
  }

  await fetch(`${API_URL}/nlq/reembed`, { method: 'POST', headers: H, body: '{}' });

  let passed = 0;
  for (const item of QUESTIONS) {
    const res = await (await fetch(`${API_URL}/nlq/ask`, { method: 'POST', headers: H, body: JSON.stringify({ question: item.q }) })).json();
    const s = score(res.answer, res.sources ?? [], item);
    if (s.passed) passed += 1;
    console.log(`${s.passed ? 'PASS' : 'FAIL'}  ${item.q}`);
    console.log(`      kw=${s.keyword} src=${s.source} → "${(res.answer ?? res.message ?? '').slice(0, 90)}"`);
  }

  const total = QUESTIONS.length;
  const rate = (passed / total) * 100;
  console.log(`\nNLQ golden: ${passed}/${total} (${rate.toFixed(0)}%)  target ≥ 80%`);
  process.exit(rate >= 80 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
