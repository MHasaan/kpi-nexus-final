/* global React, Icon, Button, Card, StatusBadge, ScopeBadge, Sparkline, PageHead, Delta, Pill, SeverityChip, Tabs, Avatar, KPIS */
const { useState: useStateI } = React;

/* ================================ ALERTS ================================ */
const ALERTS = [
  { sev: 'HIGH', kpi: 'Logo churn rate', msg: 'Breached 3.0% critical threshold (SMB segment)', status: 'Open', when: '12m ago' },
  { sev: 'MEDIUM', kpi: 'Monthly recurring revenue', msg: 'Growth decelerated for 2 consecutive periods', status: 'Open', when: '1h ago' },
  { sev: 'HIGH', kpi: 'API uptime', msg: 'Below 99.9% SLA for 20 minutes', status: 'Acknowledged', when: '3h ago' },
  { sev: 'LOW', kpi: 'Net promoter score', msg: 'Dipped below 50 for a single day', status: 'Resolved', when: '1d ago' },
  { sev: 'MEDIUM', kpi: 'Customer acquisition cost', msg: 'Anomaly detected — +3.4σ above expected', status: 'Resolved', when: '2d ago' },
];
function StatusDot({ status }) {
  const c = status === 'Open' ? 'var(--c-critical)' : status === 'Acknowledged' ? 'var(--c-warning)' : 'var(--c-success)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--c-default)' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: c }} />{status}
    </span>
  );
}
function AlertSpark() {
  const w = 320, h = 80;
  const pts = [10, 12, 11, 14, 13, 16, 22, 30].map((v, i) => `${(i / 7) * w},${h - 6 - (v / 32) * (h - 12)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: 'block' }}>
      <line x1="0" y1={h - 6 - (30 / 32) * (h - 12)} x2={w} y2={h - 6 - (30 / 32) * (h - 12)} stroke="var(--c-critical)" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.6" />
      <polyline points={pts} fill="none" stroke="hsl(var(--status-critical))" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={h - 6 - (30 / 32) * (h - 12)} r="4" fill="var(--c-surface-bg)" stroke="hsl(var(--status-critical))" strokeWidth="2" />
    </svg>
  );
}
function AlertDrawer({ alert, onClose }) {
  if (!alert) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'hsl(240 10% 10% / 0.32)', backdropFilter: 'blur(1.5px)', animation: 'knFadeIn var(--dur-base) var(--ease-out) both' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '94vw', background: 'var(--c-surface-bg)', borderLeft: '1px solid var(--c-border)', boxShadow: 'var(--shadow-pop)', display: 'flex', flexDirection: 'column', animation: 'knSlideIn var(--dur-slow) var(--ease-out) both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--c-border)' }}>
          <SeverityChip level={alert.sev} />
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)' }}>{alert.kpi}</div></div>
          <StatusDot status={alert.status} />
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--c-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={17} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 14, color: 'var(--c-default)', lineHeight: 1.55 }}>{alert.msg}</div>
          <Card style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
              <div><div style={{ fontSize: 11, color: 'var(--c-muted)' }}>Value at trigger</div><div style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-critical)', fontVariantNumeric: 'tabular-nums' }}>3.4%</div></div>
              <div><div style={{ fontSize: 11, color: 'var(--c-muted)' }}>Threshold</div><div style={{ fontSize: 22, fontWeight: 600, color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums' }}>3.0%</div></div>
            </div>
            <AlertSpark />
          </Card>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 10 }}>Escalation trail</div>
            {[['Level 1 · Slack #alerts', 'delivered · 12m ago', true], ['Level 2 · Email on-call', 'delivered · awaiting ack', true], ['Level 3 · SMS manager', 'scheduled in 48m', false]].map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
                <span style={{ width: 14, height: 14, borderRadius: 999, flexShrink: 0, marginTop: 2, background: r[2] ? 'var(--c-success)' : 'var(--c-surface-bg)', border: '1.5px solid ' + (r[2] ? 'var(--c-success)' : 'var(--c-border-strong)') }} />
                <div><div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-strong)' }}>{r[0]}</div><div style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>{r[1]}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: 14, borderTop: '1px solid var(--c-border)', display: 'flex', gap: 9 }}>
          <Button variant="secondary" icon="message-square" size="md">Comment</Button>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" icon="check" size="md">Acknowledge</Button>
          <Button icon="circle-check" size="md">Resolve</Button>
        </div>
      </div>
    </div>
  );
}
function AlertsView() {
  const [filter, setFilter] = useStateI('All');
  const [sel, setSel] = useStateI(null);
  const tabs = ['All', 'Open', 'Acknowledged', 'Resolved'];
  const counts = { All: ALERTS.length, Open: ALERTS.filter((a) => a.status === 'Open').length, Acknowledged: ALERTS.filter((a) => a.status === 'Acknowledged').length, Resolved: ALERTS.filter((a) => a.status === 'Resolved').length };
  const rows = ALERTS.filter((a) => filter === 'All' || a.status === filter);
  return (
    <div>
      <PageHead title="Alerts" sub={`${counts.Open} open · routed to Slack, email & webhooks`}>
        <Button variant="secondary" icon="settings-2" size="md">Channels</Button>
        <Button icon="plus">New rule</Button>
      </PageHead>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: 'var(--c-surface-1)', boxShadow: 'var(--shadow-inset)', gap: 2 }}>
          {tabs.map((t) => (
            <button key={t} onClick={() => setFilter(t)} style={{ height: 28, padding: '0 11px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)', display: 'inline-flex', alignItems: 'center', gap: 6, background: filter === t ? 'var(--c-surface-bg)' : 'transparent', color: filter === t ? 'var(--c-strong)' : 'var(--c-muted)', boxShadow: filter === t ? 'var(--shadow-xs)' : 'none' }}>
              {t}<span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--c-muted)', fontWeight: 600 }}>{counts[t]}</span>
            </button>
          ))}
        </div>
        <Button variant="ghost" icon="check-check" size="sm" style={{ marginLeft: 'auto' }}>Bulk acknowledge</Button>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 2.6fr 1.1fr 1fr', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-1)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
          <span>Severity</span><span>KPI</span><span>Message</span><span>Status</span><span style={{ textAlign: 'right' }}>Triggered</span>
        </div>
        {rows.map((a, i) => (
          <button key={i} className="kn-row" onClick={() => setSel(a)} style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 2.6fr 1.1fr 1fr', gap: 12, alignItems: 'center', width: '100%', padding: '13px 16px', border: 'none', borderTop: i ? '1px solid var(--c-divider)' : 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-surface-1)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <span><SeverityChip level={a.sev} /></span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.kpi}</span>
            <span style={{ fontSize: 12.5, color: 'var(--c-default)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.msg}</span>
            <StatusDot status={a.status} />
            <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--c-muted)' }}>{a.when}</span>
          </button>
        ))}
      </Card>
      <AlertDrawer alert={sel} onClose={() => setSel(null)} />
    </div>
  );
}

/* =============================== INSIGHTS =============================== */
const INSIGHTS = [
  { title: 'MRR growth is decelerating — churn is the driver', body: 'Net new MRR fell for two periods while gross adds held steady. The gap maps almost entirely to a 0.6pt rise in SMB logo churn; expansion is still offsetting the dollar impact via 111% NRR.', kpis: ['Monthly recurring revenue', 'Logo churn rate'], conf: 'High' },
  { title: 'Onboarding is the lever for SMB retention', body: '11 of 14 churned SMB accounts had not connected a data source within 30 days. Accounts that complete onboarding retain at 2.3× the rate — prioritizing activation should bend the churn curve.', kpis: ['Onboarding completion', 'Logo churn rate'], conf: 'Medium' },
  { title: 'CAC is trending above target across two units', body: 'Customer acquisition cost reached $1,240 (+9% MoM), past the $1,000 target. Paid-social efficiency dropped while lifecycle email held — a spend mix shift is the most likely cause.', kpis: ['Customer acquisition cost'], conf: 'High' },
];
const RECS = [
  { title: 'Launch an SMB save-play on at-risk accounts', body: 'Churn risk is concentrated in 6 accounts (~$92k ARR). A targeted check-in + activation nudge historically recovers ~60% of similar cohorts.', link: 'Logo churn rate', action: 'Create task — assign to CS', status: 'open' },
  { title: 'Shift $8k from paid social to lifecycle email', body: 'Lifecycle shows 3.2× the conversion of paid social this month; reallocating spend should pull blended CAC back toward target.', link: 'Customer acquisition cost', action: 'Create task — brief growth', status: 'open' },
  { title: 'Add a critical threshold band to MRR', body: 'MRR has no critical band. A $260k floor would have surfaced last period’s deceleration 9 days earlier.', link: 'Monthly recurring revenue', action: 'Open KPI → Thresholds', status: 'accepted' },
];
function ProvLine({ conf }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
      <Pill tone="accent"><Icon name="gauge" size={11} />Confidence · {conf}</Pill>
      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)' }}>gemini-1.5-pro · $0.004</span>
    </div>
  );
}
function InsightsView() {
  const [tab, setTab] = useStateI('Insights');
  return (
    <div>
      <PageHead title="Insights" sub="AI briefings about your KPI performance — grounded in your data, with confidence & cost">
        <Button icon="sparkles">Generate</Button>
      </PageHead>
      <Tabs tabs={['Insights', 'Recommendations']} value={tab} onChange={setTab} />

      {tab === 'Insights' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {INSIGHTS.map((c, i) => (
            <Card key={i} hover style={{ padding: 18, display: 'flex', gap: 14 }}>
              <div className="kn-aura kn-aura-soft" style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'var(--shadow-sm)' }}>
                <Icon name="sparkles" size={17} style={{ color: '#fff' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-strong)', letterSpacing: '-0.01em' }}>{c.title}</div>
                <p style={{ margin: '7px 0 0', fontSize: 13, lineHeight: 1.6, color: 'var(--c-default)' }}>{c.body}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 11 }}>
                  <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>References</span>
                  {c.kpis.map((k) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px', borderRadius: 999, background: 'var(--c-surface-bg)', border: '1px solid var(--c-border)', fontSize: 11.5, color: 'var(--c-default)' }}><Icon name="target" size={11} style={{ color: 'hsl(var(--accent-primary))' }} />{k}</span>)}
                </div>
                <ProvLine conf={c.conf} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
                <Button variant="secondary" size="sm" icon="bookmark">Keep</Button>
                <Button variant="ghost" size="sm" icon="x">Dismiss</Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {RECS.map((c, i) => (
            <Card key={i} hover style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <Icon name="sparkles" size={16} style={{ color: 'hsl(var(--accent-primary))', marginTop: 2 }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)', flex: 1, lineHeight: 1.35 }}>{c.title}</div>
                {c.status === 'accepted' && <Pill tone="success"><Icon name="check" size={11} />Accepted</Pill>}
              </div>
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--c-default)' }}>{c.body}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--c-muted)' }}><Icon name="link" size={11} />{c.link}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)' }}>conf · high</span>
              </div>
              <div style={{ borderTop: '1px solid var(--c-divider)', paddingTop: 11, display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 12.5, color: 'var(--c-default)', flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="corner-down-right" size={13} style={{ color: 'var(--c-muted)' }} />{c.action}</span>
                {c.status === 'open' ? <><Button variant="ghost" size="sm">Dismiss</Button><Button size="sm">Accept</Button></> : <Button variant="secondary" size="sm">View task</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { AlertsView, InsightsView });
