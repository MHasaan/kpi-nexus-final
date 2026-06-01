/* global React, Icon, Button, Card, StatusBadge, ScopeBadge, Sparkline, LineChart, BarChart, KPIS, ACTIVITY, STATUS_META */
const { useState: useStateV } = React;

function PageHead({ title, sub, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-strong)' }}>{title}</h1>
        {sub && <p style={{ margin: '5px 0 0', fontSize: 13.5, color: 'var(--c-muted)' }}>{sub}</p>}
      </div>
      <div style={{ display: 'flex', gap: 9 }}>{children}</div>
    </div>
  );
}

function Delta({ v, up, good }) {
  const positive = good === undefined ? up : good;
  const color = positive ? 'var(--c-success)' : 'var(--c-critical)';
  if (v === 0) return <span style={{ color: 'var(--c-muted)', fontSize: 12.5, fontWeight: 600 }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color, fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
      <Icon name={up ? 'arrow-up-right' : 'arrow-down-right'} size={13} strokeWidth={2.5} />{Math.abs(v)}%
    </span>
  );
}

/* =============================== DASHBOARD =============================== */
function StatTile({ label, value, delta, up, good, spark, color }) {
  return (
    <Card hover style={{ padding: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>{label}</span>
        <Delta v={delta} up={up} good={good} />
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums', marginTop: 8 }}>{value}</div>
      <div style={{ marginTop: 10 }}><Sparkline data={spark} color={color} h={34} fluid /></div>
    </Card>
  );
}

function DashboardView({ openKpi }) {
  return (
    <div>
      <PageHead title="Good morning, Alex" sub="Tuesday, May 31 · Northwind Inc. org health at a glance">
        <Button variant="secondary" icon="calendar" size="md">Last 30 days</Button>
        <Button icon="plus">New KPI</Button>
      </PageHead>

      <div className="kn-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        <StatTile label="Recurring revenue" value="$284,910" delta={12.4} up good spark={KPIS[0].spark} color="hsl(var(--chart-11))" />
        <StatTile label="Active users" value="48,210" delta={8.1} up good spark={KPIS[3].spark} color="hsl(var(--chart-1))" />
        <StatTile label="Net retention" value="111%" delta={1.2} up good spark={KPIS[1].spark} color="hsl(var(--chart-3))" />
        <StatTile label="Logo churn" value="3.8%" delta={0.6} up good={false} spark={KPIS[2].spark} color="hsl(var(--chart-4))" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* KPIs to watch */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--c-divider)' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)' }}>KPIs to watch</span>
              <button onClick={() => openKpi(KPIS[0])} style={linkBtn}>View all <Icon name="arrow-right" size={13} /></button>
            </div>
            <div>
              {KPIS.slice(0, 5).map((k, i) => (
                <button key={k.id} onClick={() => openKpi(k)} className="kn-row"
                  style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 14, width: '100%', padding: '12px 16px', border: 'none', borderTop: i ? '1px solid var(--c-divider)' : 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-surface-1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.name}</span>
                      <ScopeBadge scope={k.scope} />
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>{k.cat}</span>
                  </div>
                  <Sparkline data={k.spark} w={88} h={28} color={STATUS_META[k.status].color === 'var(--c-muted)' ? 'hsl(var(--chart-8))' : `hsl(var(--accent-primary))`} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums', minWidth: 78, textAlign: 'right' }}>{k.value}</span>
                  <StatusBadge status={k.status} size="sm" />
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SetupChecklist />
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--c-divider)', fontSize: 14, fontWeight: 600, color: 'var(--c-strong)' }}>Recent activity</div>
            <div style={{ padding: '6px 0' }}>
              {ACTIVITY.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 11, padding: '9px 16px' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--c-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--c-muted)' }}>
                    <Icon name={a.icon} size={13} />
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--c-default)', lineHeight: 1.45 }}>
                    <b style={{ color: 'var(--c-strong)', fontWeight: 600 }}>{a.who}</b> {a.what} <span style={{ color: 'hsl(var(--accent-primary))' }}>{a.obj}</span>
                    <div style={{ fontSize: 11, color: 'var(--c-muted)', marginTop: 1 }}>{a.t}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SetupChecklist() {
  const items = [{ t: 'Create your organization', done: true }, { t: 'Invite your team', done: true }, { t: 'Create your first KPI', done: true }, { t: 'Connect a data source', done: false }, { t: 'Enable MFA', done: false }];
  const done = items.filter((i) => i.done).length;
  return (
    <Card style={{ padding: 16, background: 'var(--gradient-brand-soft)', borderColor: 'hsl(var(--accent-primary) / 0.25)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)' }}>Finish setup</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(var(--accent-primary))', fontVariantNumeric: 'tabular-nums' }}>{done} of {items.length}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'hsl(var(--accent-primary) / 0.15)', marginTop: 10, overflow: 'hidden' }}>
        <div className="kn-sheen" style={{ height: '100%', width: `${(done / items.length) * 100}%`, background: 'var(--gradient-brand)', borderRadius: 999 }} />
      </div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
            <Icon name={it.done ? 'circle-check' : 'circle'} size={16} style={{ color: it.done ? 'var(--c-success)' : 'var(--c-disabled)' }} strokeWidth={2} />
            <span style={{ color: it.done ? 'var(--c-muted)' : 'var(--c-strong)', textDecoration: it.done ? 'line-through' : 'none', fontWeight: it.done ? 400 : 500 }}>{it.t}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ================================= KPIs ================================= */
function KpisView({ openKpi }) {
  const [scope, setScope] = useStateV('All');
  const [q, setQ] = useStateV('');
  const scopes = ['All', 'ORG_WIDE', 'PER_UNIT', 'PER_USER'];
  const rows = KPIS.filter((k) => (scope === 'All' || k.scope === scope) && k.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHead title="KPIs" sub={`${KPIS.length} indicators across 4 categories`}>
        <Button variant="secondary" icon="upload" size="md">Import</Button>
        <Button icon="plus">Create KPI</Button>
      </PageHead>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 11px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface-bg)', width: 260 }}>
          <Icon name="search" size={15} style={{ color: 'var(--c-muted)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter KPIs…" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--c-strong)', width: '100%', fontFamily: 'var(--font-sans)' }} />
        </div>
        <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: 'var(--c-surface-1)', boxShadow: 'var(--shadow-inset)', gap: 2 }}>
          {scopes.map((s) => (
            <button key={s} onClick={() => setScope(s)} style={{ height: 28, padding: '0 11px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: s === 'All' ? 'var(--font-sans)' : 'var(--font-mono)', letterSpacing: s === 'All' ? 0 : '0.02em', background: scope === s ? 'var(--c-surface-bg)' : 'transparent', color: scope === s ? 'var(--c-strong)' : 'var(--c-muted)', boxShadow: scope === s ? 'var(--shadow-xs)' : 'none' }}>{s}</button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--c-muted)' }}>{rows.length} shown</span>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 1fr 0.9fr 1.1fr 1.1fr', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-1)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
          <span>KPI</span><span>Scope</span><span>Trend</span><span style={{ textAlign: 'right' }}>Value</span><span style={{ textAlign: 'right' }}>vs target</span><span>Status</span>
        </div>
        {rows.map((k, i) => (
          <button key={k.id} onClick={() => openKpi(k)} className="kn-row"
            style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 1fr 0.9fr 1.1fr 1.1fr', gap: 12, alignItems: 'center', width: '100%', padding: '12px 16px', border: 'none', borderTop: i ? '1px solid var(--c-divider)' : 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-surface-1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>{k.cat} · {k.type}</div>
            </div>
            <div><ScopeBadge scope={k.scope} /></div>
            <Sparkline data={k.spark} w={84} h={26} color="hsl(var(--accent-primary))" />
            <span style={{ textAlign: 'right', fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>{k.value}</span>
            <span style={{ textAlign: 'right' }}><Delta v={k.delta} up={k.up} good={k.status !== 'off-track' && k.status !== 'at-risk' ? k.up : !k.up} /></span>
            <div><StatusBadge status={k.status} size="sm" /></div>
          </button>
        ))}
      </Card>
    </div>
  );
}

/* ============================== KPI DETAIL ============================== */
function KpiDetailView({ kpi, back }) {
  const k = kpi || KPIS[0];
  const [tab, setTab] = useStateV('Overview');
  const [drawer, setDrawer] = useStateV(false);
  const tabs = ['Overview', 'Data', 'Formula', 'Targets', 'Thresholds', 'Anomalies', 'Forecast', 'What-if', 'Lineage', 'Audit'];
  const base = k.spark.map((v) => (typeof v === 'number' && v > 0 ? v : 40));
  const forecast = [base[base.length - 1], base[base.length - 1] * 1.03, base[base.length - 1] * 1.06, base[base.length - 1] * 1.09];
  return (
    <div>
      <button onClick={back} style={{ ...linkBtn, marginBottom: 14 }}><Icon name="arrow-left" size={14} /> All KPIs</button>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 4 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 23, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-strong)' }}>{k.name}</h1>
            <StatusBadge status={k.status} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, fontSize: 12.5, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)' }}>
            <span>v4</span><span>·</span><ScopeBadge scope={k.scope} /><span>·</span><span>{k.type}</span><span>·</span><span style={{ fontFamily: 'var(--font-sans)' }}>Owner {k.owner}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <Button variant="secondary" icon="message-square" size="md" onClick={() => setDrawer(true)}>Comments</Button>
          <Button variant="secondary" icon="pencil" size="md">Edit</Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--c-border)', margin: '16px 0 18px', overflowX: 'auto' }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ height: 38, padding: '0 13px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)', color: tab === t ? 'var(--c-strong)' : 'var(--c-muted)', borderBottom: tab === t ? '2px solid hsl(var(--accent-primary))' : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap' }}>{t}</button>
        ))}
      </div>

      {tab === 'Overview' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, alignItems: 'start' }}>
          <Card style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>Current value</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
                  <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>{k.value}</span>
                  <Delta v={k.delta} up={k.up} good={k.status === 'on-track'} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
                <div style={{ textAlign: 'right' }}><div style={{ color: 'var(--c-muted)' }}>Target</div><div style={{ fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{k.target}</div></div>
              </div>
            </div>
            <LineChart
              series={[
                { data: base, color: 'hsl(var(--accent-primary))', fill: true },
                { data: [...base.map(() => null).slice(0, base.length - 1).map((_, i) => null), ...[]], color: 'transparent' },
                { data: [...Array(base.length - 1).fill(null), ...forecast].map((v) => v), color: 'hsl(var(--accent-secondary))', dashed: true },
              ].filter((s) => s.color !== 'transparent')}
              showBand={{ hi: [...Array(base.length - 1).fill(base[base.length - 1]), ...forecast.map((v) => v * 1.05)], lo: [...Array(base.length - 1).fill(base[base.length - 1]), ...forecast.map((v) => v * 0.95)] }}
              w={620} h={250}
            />
            <div style={{ display: 'flex', gap: 18, marginTop: 6, fontSize: 11.5, color: 'var(--c-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 2.5, background: 'hsl(var(--accent-primary))', borderRadius: 2 }} /> Actual</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 0, borderTop: '2.5px dashed hsl(var(--accent-secondary))' }} /> Forecast (yhat + band)</span>
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 12 }}>Threshold status</div>
              {[['Critical below', '< 3.0', 'off-track'], ['Warning below', '< 3.4', 'at-risk'], ['Healthy', '≥ 3.4', 'on-track']].map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--c-default)' }}>{r[0]}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-muted)' }}>{r[1]}</span>
                </div>
              ))}
            </Card>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 10 }}>Trust & provenance</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12.5, color: 'var(--c-muted)' }}>
                <div style={{ display: 'flex', gap: 8 }}><Icon name="user" size={14} /> Updated by {k.owner}</div>
                <div style={{ display: 'flex', gap: 8 }}><Icon name="clock" size={14} /> 2 hours ago</div>
                <div style={{ display: 'flex', gap: 8 }}><Icon name="git-commit-horizontal" size={14} /> Version 4 · 6 edits</div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <KpiTabContent k={k} tab={tab} base={base} />
      )}
      <CommentsDrawer open={drawer} onClose={() => setDrawer(false)} entity={k.name} entityType="kpi" />
    </div>
  );
}

/* ============================== DASHBOARDS ============================== */
function DashboardsView() {
  return (
    <div>
      <PageHead title="Revenue overview" sub="8 widgets · live · last 30 days">
        <Button variant="secondary" icon="share-2" size="md">Share</Button>
        <Button variant="secondary" icon="pencil" size="md">Edit</Button>
        <Button icon="plus">Add widget</Button>
      </PageHead>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--c-success)', fontWeight: 600 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--c-success)' }} className="kn-pulse" /> Live</span>
        <span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>· refreshes via SSE</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <Card style={{ padding: 16, gridColumn: 'span 1' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>MRR</div>
          <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums', marginTop: 8 }}>$284,910</div>
          <Delta v={12.4} up good />
        </Card>
        <Card style={{ padding: 16, gridColumn: 'span 1' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>New accounts</div>
          <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums', marginTop: 8 }}>312</div>
          <Delta v={5.4} up good />
        </Card>
        <Card style={{ padding: '16px 16px 8px', gridColumn: 'span 2' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 6 }}>Revenue trend</div>
          <LineChart series={[{ data: [180, 195, 188, 210, 225, 240, 258, 270, 285], color: 'hsl(var(--chart-11))', fill: true }]} w={300} h={150} />
        </Card>
        <Card style={{ padding: '16px 16px 8px', gridColumn: 'span 2' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 6 }}>Revenue by segment</div>
          <BarChart data={[{ label: 'SMB', v: 120 }, { label: 'Mid', v: 185, color: 'hsl(var(--chart-5))' }, { label: 'Ent', v: 240, color: 'hsl(var(--chart-3))' }, { label: 'Gov', v: 95, color: 'hsl(var(--chart-2))' }]} w={300} h={150} />
        </Card>
        <Card style={{ padding: '16px', gridColumn: 'span 2' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 10 }}>Pipeline by stage</div>
          {[['Discovery', 80], ['Qualified', 62], ['Proposal', 44], ['Closing', 28]].map((r, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-default)', marginBottom: 4 }}><span>{r[0]}</span><span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--c-muted)' }}>{r[1]}</span></div>
              <div style={{ height: 7, borderRadius: 999, background: 'var(--c-surface-2)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${r[1]}%`, background: `hsl(var(--chart-${i + 1}))`, borderRadius: 999 }} /></div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ================================= ASK ================================= */
function AskView() {
  const [msgs, setMsgs] = useStateV([
    { role: 'user', text: 'Why did logo churn tick up last month?' },
    { role: 'ai', text: 'Logo churn rose to 3.8% (+0.6pt MoM), above the 3.0% target. The increase is concentrated in the SMB segment, where 11 of 14 churned accounts had not connected a data source within 30 days of signup. Net revenue retention held at 111%, so expansion is offsetting the dollar impact for now.', sources: ['Logo churn rate', 'Net revenue retention', 'Onboarding completion'], model: 'gemini-1.5-pro', cost: '$0.004' },
  ]);
  const [val, setVal] = useStateV('');
  const prompts = ['Which KPIs are off track this quarter?', 'Forecast MRR for next 3 months', 'Compare CAC across org units'];
  const send = (t) => { const text = t || val; if (!text.trim()) return; setMsgs((m) => [...m, { role: 'user', text }, { role: 'ai', text: 'Grounded in your visible data, here is what I found — this is a static demo response illustrating the answer layout, source chips, and provider/cost trust line.', sources: ['Monthly recurring revenue', 'Weekly active users'], model: 'gemini-1.5-pro', cost: '$0.003' }]); setVal(''); };
  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <PageHead title="Ask" sub="Natural-language questions grounded in your data — respects your permissions" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 18 }}>
        {msgs.map((m, i) => m.role === 'user' ? (
          <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '78%', background: 'hsl(var(--accent-primary))', color: 'var(--c-on-accent)', padding: '11px 15px', borderRadius: '14px 14px 4px 14px', fontSize: 13.5, lineHeight: 1.5, boxShadow: 'var(--shadow-sm)' }}>{m.text}</div>
        ) : (
          <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '86%' }}>
            <div style={{ display: 'flex', gap: 11 }}>
              <div className="kn-aura kn-aura-breathe" style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'var(--shadow-sm)' }}><Icon name="sparkles" size={16} style={{ color: '#fff' }} /></div>
              <div>
                <div style={{ background: 'var(--c-surface-1)', border: '1px solid var(--c-border)', padding: '12px 15px', borderRadius: '14px 14px 14px 4px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--c-default)' }}>{m.text}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 9 }}>
                  <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>Sources</span>
                  {m.sources.map((s) => <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px', borderRadius: 999, background: 'var(--c-surface-bg)', border: '1px solid var(--c-border)', fontSize: 11.5, color: 'var(--c-default)' }}><Icon name="target" size={11} style={{ color: 'hsl(var(--accent-primary))' }} />{s}</span>)}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)' }}>{m.model} · {m.cost}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {prompts.map((p) => <button key={p} onClick={() => send(p)} style={{ height: 30, padding: '0 12px', borderRadius: 999, border: '1px solid var(--c-border)', background: 'var(--c-surface-bg)', color: 'var(--c-default)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>{p}</button>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 7px 7px 16px', borderRadius: 12, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface-bg)', boxShadow: 'var(--shadow-sm)' }}>
        <Icon name="message-square" size={17} style={{ color: 'var(--c-muted)' }} />
        <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask about your KPIs…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--c-strong)', fontFamily: 'var(--font-sans)' }} />
        <Button icon="arrow-up" onClick={() => send()}>Ask</Button>
      </div>
    </div>
  );
}

/* ============================ generic stub ============================ */
function StubView({ title, icon, sub }) {
  return (
    <div>
      <PageHead title={title} sub={sub} />
      <Card style={{ padding: '64px 24px', textAlign: 'center' }}>
        <div className="kn-aura kn-aura-soft" style={{ display: 'inline-flex', width: 52, height: 52, borderRadius: 14, background: 'var(--gradient-brand-soft)', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--accent-primary))', marginBottom: 14 }}>
          <Icon name={icon} size={26} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-strong)' }}>{title} lives here</div>
        <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 5, maxWidth: 420, marginInline: 'auto', lineHeight: 1.5 }}>{sub} This surface is specified in the frontend requirements and shares the same shell, tokens, and components shown across this kit.</div>
      </Card>
    </div>
  );
}

const linkBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: 'hsl(var(--accent-primary))', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: 0 };

Object.assign(window, { DashboardView, KpisView, KpiDetailView, DashboardsView, AskView, StubView, PageHead, Delta, linkBtn });
