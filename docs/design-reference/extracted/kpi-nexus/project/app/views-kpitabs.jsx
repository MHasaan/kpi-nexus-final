/* global React, Icon, Button, Card, StatusBadge, ScopeBadge, Sparkline, LineChart, BarChart, Delta, Pill, Progress, Seg, Field, Select, KV, Avatar */
/* views-kpitabs.jsx — full content for every non-Overview KPI detail tab.
   Exports KpiTabContent({ k, tab, base }). Loaded after widgets.jsx, before app.jsx. */
const { useState: useStateKT } = React;

function TabCard({ children, style }) { return <Card style={{ padding: 18, ...style }}>{children}</Card>; }
function TabHead({ title, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <div><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)' }}>{title}</div>{sub && <div style={{ fontSize: 12.5, color: 'var(--c-muted)', marginTop: 3 }}>{sub}</div>}</div>
      {right}
    </div>
  );
}
const th = { padding: '9px 14px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--c-muted)', textAlign: 'left' };
const td = { padding: '10px 14px', fontSize: 13, color: 'var(--c-default)', borderTop: '1px solid var(--c-divider)' };

/* -------- Data -------- */
function DataTab({ k, base }) {
  const rows = [['May 2026', k.value, 'Sara Chen', 'verified'], ['Apr 2026', '$271,400', 'Connector · Stripe', 'verified'], ['Mar 2026', '$262,050', 'Connector · Stripe', 'verified'], ['Feb 2026', '$258,300', 'Sara Chen', 'estimate'], ['Jan 2026', '$240,100', 'Connector · Stripe', 'verified']];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, alignItems: 'start' }}>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--c-divider)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)' }}>Time series</span>
          <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>9 points · monthly</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Period</th><th style={{ ...th, textAlign: 'right' }}>Value</th><th style={th}>Source</th><th style={th}>Quality</th><th style={th}></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={td}>{r[0]}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>{r[1]}</td>
                <td style={{ ...td, color: 'var(--c-muted)' }}>{r[2]}</td>
                <td style={td}>{r[3] === 'verified' ? <Pill tone="success"><Icon name="check" size={11} />Verified</Pill> : <Pill tone="warning"><Icon name="flag" size={11} />Estimate</Pill>}</td>
                <td style={{ ...td, textAlign: 'right' }}><Icon name="ellipsis" size={15} style={{ color: 'var(--c-muted)' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <TabCard>
        <TabHead title="Record a value" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Field label="Value" placeholder={k.type === 'Currency' ? '$0.00' : '0'} />
          <div style={{ display: 'flex', gap: 8 }}><Field label="Period start" value="Jun 1" /><Field label="Period end" value="Jun 30" /></div>
          <Button icon="plus" full>Record value</Button>
          <div style={{ fontSize: 11.5, color: 'var(--c-muted)', lineHeight: 1.5 }}>Posts to the scope-correct endpoint. Optimistic — appears instantly, rolls back on failure.</div>
        </div>
      </TabCard>
    </div>
  );
}

/* -------- Formula -------- */
function FormulaTab() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, alignItems: 'start' }}>
      <TabCard>
        <TabHead title="Expression" sub="This KPI is COMPUTED from upstream metrics" right={<Pill tone="success"><Icon name="check" size={11} />Valid</Pill>} />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.7, background: 'var(--c-surface-1)', border: '1px solid var(--c-border)', borderRadius: 8, padding: 14, color: 'var(--c-strong)' }}>
          <span style={{ color: 'hsl(var(--accent-primary))' }}>new_mrr</span> + <span style={{ color: 'hsl(var(--accent-primary))' }}>expansion_mrr</span> − <span style={{ color: 'hsl(var(--accent-primary))' }}>contraction_mrr</span> − <span style={{ color: 'hsl(var(--accent-primary))' }}>churned_mrr</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
          <Button variant="secondary" size="md" icon="play">Validate</Button>
          <Button size="md" icon="check">Save formula</Button>
          <span style={{ fontSize: 12, color: 'var(--c-success)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="circle-check" size={13} />Parses · 4 dependencies resolved</span>
        </div>
      </TabCard>
      <TabCard>
        <TabHead title="Dependencies" />
        {['New MRR', 'Expansion MRR', 'Contraction MRR', 'Churned MRR'].map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
            <Icon name="git-commit-horizontal" size={14} style={{ color: 'var(--c-muted)' }} />
            <span style={{ fontSize: 12.5, color: 'var(--c-default)', flex: 1 }}>{d}</span>
            <Icon name="arrow-up-right" size={13} style={{ color: 'hsl(var(--accent-primary))' }} />
          </div>
        ))}
      </TabCard>
    </div>
  );
}

/* -------- Targets -------- */
function TargetsTab() {
  return (
    <TabCard style={{ padding: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--c-divider)' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)' }}>Period targets</span>
        <Button variant="secondary" size="sm" icon="plus">Add target</Button>
      </div>
      {[['Q2 2026', '$300,000', 'Apr 1 – Jun 30', 'active'], ['Q1 2026', '$270,000', 'Jan 1 – Mar 31', 'met'], ['Q3 2026', '$330,000', 'Jul 1 – Sep 30', 'pending']].map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr 1fr', gap: 12, alignItems: 'center', padding: '13px 16px', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)' }}>{r[0]}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--c-default)' }}>{r[1]}</span>
          <span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>{r[2]}</span>
          <span style={{ textAlign: 'right' }}>{r[3] === 'active' ? <Pill tone="accent">Active</Pill> : r[3] === 'met' ? <Pill tone="success">Met</Pill> : <Pill tone="warning"><Icon name="clock" size={11} />Approval</Pill>}</span>
        </div>
      ))}
      <div style={{ padding: '11px 16px', borderTop: '1px solid var(--c-divider)', fontSize: 12, color: 'var(--c-muted)', display: 'flex', alignItems: 'center', gap: 7 }}>
        <Icon name="git-pull-request" size={13} />Target changes route through the KPI_TARGET approval workflow when active.
      </div>
    </TabCard>
  );
}

/* -------- Thresholds -------- */
function ThresholdsTab() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 14, alignItems: 'start' }}>
      <TabCard style={{ padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--c-divider)' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)' }}>Threshold bands</span>
          <Button variant="secondary" size="sm" icon="plus">Add band</Button>
        </div>
        {[['Healthy', '≥ $280k', 'on-track'], ['Warning', '$260k – $280k', 'at-risk'], ['Critical', '< $260k', 'off-track']].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
            <StatusBadge status={r[2]} size="sm" />
            <span style={{ fontSize: 13, color: 'var(--c-default)', flex: 1 }}>{r[0]}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--c-muted)' }}>{r[1]}</span>
          </div>
        ))}
      </TabCard>
      <TabCard>
        <TabHead title="Current standing" />
        <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--c-success)', fontVariantNumeric: 'tabular-nums' }}>$284,910</div>
          <div style={{ margintop: 8 }}><StatusBadge status="on-track" /></div>
          <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 8 }}>$4,910 above the warning band</div>
        </div>
      </TabCard>
    </div>
  );
}

/* -------- Anomalies -------- */
function AnomaliesTab({ base }) {
  const markers = [3, 6];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14, alignItems: 'start' }}>
      <TabCard>
        <TabHead title="Anomaly detection" right={<Button size="sm" icon="scan-search">Detect</Button>} />
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <Select label="Method" value="Z-score" w={150} /><Field label="Threshold (σ)" value="3.0" w={120} />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-default)' }}>Persist</span><div style={{ height: 36, display: 'flex', alignItems: 'center' }}><span style={{ width: 36, height: 20, borderRadius: 999, background: 'var(--c-surface-pressed)', position: 'relative', display: 'inline-block' }}><span style={{ position: 'absolute', top: 2, left: 2, width: 16, height: 16, borderRadius: 999, background: '#fff' }} /></span></div></label>
        </div>
        <LineChart series={[{ data: base, color: 'hsl(var(--accent-primary))', fill: true, markers }]} w={620} h={220} />
      </TabCard>
      <TabCard>
        <TabHead title="Flagged points" />
        {[['Mar 2026', '−2.8σ', 'High'], ['Jun 2026', '+3.4σ', 'High']].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
            <div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)' }}>{r[0]}</div><div style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>outside expected range</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--c-critical)' }}>{r[1]}</div><Pill tone="accent" style={{ marginTop: 4 }}>conf · {r[2]}</Pill></div>
          </div>
        ))}
        <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--c-muted)', lineHeight: 1.5, display: 'flex', gap: 7 }}><Icon name="info" size={13} style={{ flexShrink: 0, marginTop: 1 }} />Markers use shape + colour, never colour alone.</div>
      </TabCard>
    </div>
  );
}

/* -------- Forecast -------- */
function ForecastTab({ base }) {
  const last = base[base.length - 1];
  const fc = [last, last * 1.03, last * 1.06, last * 1.09, last * 1.12];
  const series = [
    { data: [...base, ...Array(fc.length - 1).fill(null)], color: 'hsl(var(--accent-primary))', fill: true },
    { data: [...Array(base.length - 1).fill(null), ...fc], color: 'hsl(var(--accent-secondary))', dashed: true },
  ];
  const band = { hi: [...Array(base.length - 1).fill(last), ...fc.map((v) => v * 1.06)], lo: [...Array(base.length - 1).fill(last), ...fc.map((v) => v * 0.94)] };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 14, alignItems: 'start' }}>
      <TabCard>
        <TabHead title="Forecast" right={<Button size="sm" icon="play">Run</Button>} />
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}><Select label="Model" value="Auto (best fit)" w={170} /><Select label="Horizon" value="5 periods" w={140} /></div>
        <LineChart series={series} showBand={band} w={620} h={220} />
        <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: 11.5, color: 'var(--c-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 2.5, background: 'hsl(var(--accent-primary))', borderRadius: 2 }} /> Actual</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 0, borderTop: '2.5px dashed hsl(var(--accent-secondary))' }} /> Forecast</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 9, background: 'hsl(var(--accent-primary) / 0.12)', borderRadius: 2 }} /> 80 / 95% band</span>
        </div>
      </TabCard>
      <TabCard>
        <TabHead title="Fit metrics" />
        <KV k="RMSE" v="0.042" mono /><KV k="MAPE" v="3.1%" mono /><KV k="Model" v="ETS" mono />
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--c-muted)', lineHeight: 1.5 }}>Lower error means the model tracks history more closely. Bands widen with the horizon.</div>
      </TabCard>
    </div>
  );
}

/* -------- What-if -------- */
function WhatIfTab() {
  const [lift, setLift] = useStateKT(12);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, alignItems: 'start' }}>
      <TabCard>
        <TabHead title="Driver" />
        <Select label="Mechanic" value="Expansion rate" />
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-default)' }}>Lift</span><span style={{ fontSize: 13, fontWeight: 700, color: 'hsl(var(--accent-primary))', fontVariantNumeric: 'tabular-nums' }}>+{lift}%</span></div>
          <input type="range" min="0" max="30" value={lift} onChange={(e) => setLift(+e.target.value)} style={{ width: '100%', accentColor: 'hsl(var(--accent-primary))' }} />
        </div>
        <Button icon="play" full style={{ marginTop: 16 }}>Run simulation</Button>
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--c-muted)', lineHeight: 1.5 }}>Assumes a linear relationship between the driver and this KPI.</div>
      </TabCard>
      <TabCard>
        <TabHead title="Projected impact" />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 40, padding: '14px 10px', height: 200 }}>
          {[['Before', 120, '$284,910', 'var(--c-surface-pressed)'], ['After', 120 + lift * 3.6, '$' + Math.round(284910 * (1 + lift / 100)).toLocaleString(), 'hsl(var(--accent-primary))']].map((b, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>{b[2]}</div>
              <div style={{ width: 72, height: b[1], background: b[3], borderRadius: '6px 6px 0 0', border: '1px solid var(--c-border)', transition: 'height var(--dur-slow) var(--ease-out)' }} />
              <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>{b[0]}</div>
            </div>
          ))}
          <div style={{ alignSelf: 'center' }}><Delta v={lift} up good /></div>
        </div>
      </TabCard>
    </div>
  );
}

/* -------- Lineage -------- */
function LineageTab() {
  const col = (title, items, icon) => (
    <TabCard>
      <TabHead title={title} />
      {items.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 0', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--c-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-muted)', flexShrink: 0 }}><Icon name={icon} size={14} /></div>
          <span style={{ fontSize: 13, color: 'var(--c-default)', flex: 1 }}>{d}</span>
          <Icon name="arrow-up-right" size={13} style={{ color: 'hsl(var(--accent-primary))' }} />
        </div>
      ))}
    </TabCard>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 14, alignItems: 'center' }}>
      {col('Upstream — feeds this', ['New MRR', 'Expansion MRR', 'Contraction MRR', 'Churned MRR'], 'git-commit-horizontal')}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <Icon name="arrow-right" size={20} style={{ color: 'var(--c-muted)' }} />
        <div className="kn-aura kn-aura-soft" style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--gradient-brand-soft)', border: '1px solid hsl(var(--accent-primary) / 0.3)', fontSize: 12, fontWeight: 600, color: 'hsl(var(--accent-primary))', textAlign: 'center', whiteSpace: 'nowrap' }}>This KPI</div>
        <Icon name="arrow-right" size={20} style={{ color: 'var(--c-muted)' }} />
      </div>
      {col('Downstream — consumes this', ['Revenue overview dashboard', 'Durable growth · OKR', 'Weekly board pack'], 'bar-chart-3')}
    </div>
  );
}

/* -------- Audit -------- */
function AuditTab({ k }) {
  const rows = [['v4', k.owner, 'Updated target to $300,000', '2h ago'], ['v3', 'Marcus Lee', 'Edited formula (added expansion_mrr)', '3d ago'], ['v2', 'Sara Chen', 'Added critical threshold band', '2w ago'], ['v1', 'Sara Chen', 'Created KPI', 'Apr 2']];
  return (
    <TabCard style={{ padding: 0 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
          <Pill mono tone="neutral">{r[0]}</Pill>
          <Avatar name={r[1]} size={24} idx={i} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: 'var(--c-strong)' }}>{r[2]}</div><div style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>by {r[1]}</div></div>
          <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{r[3]}</span>
        </div>
      ))}
    </TabCard>
  );
}

function KpiTabContent({ k, tab, base }) {
  switch (tab) {
    case 'Data': return <DataTab k={k} base={base} />;
    case 'Formula': return <FormulaTab />;
    case 'Targets': return <TargetsTab />;
    case 'Thresholds': return <ThresholdsTab />;
    case 'Anomalies': return <AnomaliesTab base={base} />;
    case 'Forecast': return <ForecastTab base={base} />;
    case 'What-if': return <WhatIfTab />;
    case 'Lineage': return <LineageTab />;
    case 'Audit': return <AuditTab k={k} />;
    default: return null;
  }
}

Object.assign(window, { KpiTabContent });
