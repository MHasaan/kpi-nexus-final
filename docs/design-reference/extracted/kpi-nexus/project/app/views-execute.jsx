/* global React, Icon, Button, Card, StatusBadge, Sparkline, PageHead, Delta, Pill, Progress, Avatar, Seg */
const { useState: useStateE } = React;

/* ================================= OKRs ================================= */
const OKR_STATUS = { ACTIVE: 'accent', AT_RISK: 'warning', ACHIEVED: 'success', DRAFT: 'neutral', MISSED: 'critical' };
const OKRS = [
  { name: 'Win the mid-market', owner: 'Sara Chen', pct: 72, status: 'ACTIVE', krs: 4 },
  { name: 'World-class customer support', owner: 'Priya N.', pct: 48, status: 'AT_RISK', krs: 3 },
  { name: 'Durable, efficient revenue growth', owner: 'Marcus Lee', pct: 91, status: 'ACHIEVED', krs: 5 },
  { name: 'Ship the platform foundation', owner: 'Devon R.', pct: 30, status: 'ACTIVE', krs: 4 },
  { name: 'Healthy unit economics', owner: 'Sara Chen', pct: 64, status: 'ACTIVE', krs: 3 },
  { name: 'Team & culture', owner: 'Alex Morgan', pct: 12, status: 'DRAFT', krs: 2 },
];
const OKR_KRS = {
  'Win the mid-market': [['Add 40 mid-market logos', '12', '40', 30], ['Grow mid-market ARR to $2M', '$1.3M', '$2M', 65], ['Lift win rate to 35%', '31%', '35%', 76], ['Increase avg deal size 20%', '$18k', '$22k', 55]],
  _default: [['Improve the leading input', 'baseline', 'target', 48], ['Hit the coverage goal', 'baseline', 'target', 62], ['Reduce the lagging risk', 'baseline', 'target', 33]],
};
function barFor(status) { return status === 'AT_RISK' ? 'hsl(var(--status-warning))' : status === 'ACHIEVED' ? 'hsl(var(--status-success))' : 'hsl(var(--accent-primary))'; }
function OkrDetail({ o, back }) {
  const krs = OKR_KRS[o.name] || OKR_KRS._default;
  const bc = barFor(o.status);
  return (
    <div>
      <button onClick={back} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: 'hsl(var(--accent-primary))', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: 0, marginBottom: 14 }}><Icon name="arrow-left" size={14} /> All objectives</button>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Icon name="flag" size={18} style={{ color: 'var(--c-muted)' }} /><h1 style={{ margin: 0, fontSize: 23, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-strong)' }}>{o.name}</h1><Pill tone={OKR_STATUS[o.status]}>{o.status.replace('_', ' ')}</Pill></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12.5, color: 'var(--c-muted)' }}><Avatar name={o.owner} size={20} idx={0} />{o.owner} · Q2 2026</div>
        </div>
        <div style={{ display: 'flex', gap: 9 }}><Button variant="secondary" icon="refresh-cw" size="md">Sync from KPIs</Button><Button icon="plus" size="md">Add key result</Button></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, alignItems: 'start' }}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--c-divider)', fontSize: 14, fontWeight: 600, color: 'var(--c-strong)' }}>Key results</div>
          {krs.map((kr, i) => (
            <div key={i} style={{ padding: '14px 16px', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)', flex: 1 }}>{kr[0]}</span>
                <span style={{ fontSize: 12, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)' }}>{kr[1]} → {kr[2]}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums', width: 40, textAlign: 'right' }}>{kr[3]}%</span>
              </div>
              <Progress pct={kr[3]} color={bc} />
            </div>
          ))}
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card style={{ padding: 18, textAlign: 'center', background: 'var(--gradient-brand-soft)', borderColor: 'hsl(var(--accent-primary) / 0.25)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>Overall progress</div>
            <div style={{ fontSize: 38, fontWeight: 700, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums', margin: '6px 0 10px' }}>{o.pct}%</div>
            <Progress pct={o.pct} color={bc} />
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 10 }}>weighted across {krs.length} key results</div>
          </Card>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 10 }}>Aligned objectives</div>
            {['Durable, efficient revenue growth', 'Healthy unit economics'].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}><Icon name="flag" size={13} style={{ color: 'var(--c-muted)' }} /><span style={{ fontSize: 12.5, color: 'var(--c-default)' }}>{t}</span></div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
function OkrsView() {
  const [f, setF] = useStateE('All');
  const [sel, setSel] = useStateE(null);
  if (sel) return <OkrDetail o={sel} back={() => setSel(null)} />;
  return (
    <div>
      <PageHead title="Objectives" sub="Goals that frame your KPIs — progress rolls up from key results">
        <Seg options={['All', 'Active', 'At risk', 'Achieved']} value={f} onChange={setF} />
        <Button icon="plus">New objective</Button>
      </PageHead>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {OKRS.map((o, i) => {
          const tone = OKR_STATUS[o.status];
          const barColor = barFor(o.status);
          return (
            <Card key={i} hover onClick={() => setSel(o)} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                <Icon name="flag" size={16} style={{ color: 'var(--c-muted)', marginTop: 2 }} />
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--c-strong)', flex: 1, lineHeight: 1.3, letterSpacing: '-0.01em' }}>{o.name}</div>
                <Pill tone={tone}>{o.status.replace('_', ' ')}</Pill>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>{o.krs} key results</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>{o.pct}%</span>
                </div>
                <Progress pct={o.pct} color={barColor} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--c-muted)' }}>
                <Avatar name={o.owner} size={20} idx={i} /><span>{o.owner}</span><span>·</span><span>Q2 2026</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ================================ TASKS ================================ */
const PRIO = { High: 'critical', Med: 'warning', Low: 'neutral' };
const COLUMNS = [
  { name: 'To do', cards: [
    { t: 'Schedule SMB save-play QBRs', p: 'High', kpi: 'Logo churn', who: 'Priya N.', due: 'Jun 3' },
    { t: 'Brief growth on CAC reallocation', p: 'Med', kpi: 'CAC', who: 'Marcus Lee', due: 'Jun 5' },
    { t: 'Review Q3 targets with finance', p: 'Low', kpi: null, who: 'Sara Chen', due: 'Jun 7' },
  ] },
  { name: 'In progress', cards: [
    { t: 'Add critical threshold band to MRR', p: 'High', kpi: 'MRR', who: 'Sara Chen', due: 'today' },
    { t: 'Wire Slack alert channel', p: 'Med', kpi: null, who: 'Devon R.', due: 'Jun 2' },
  ] },
  { name: 'Blocked', cards: [
    { t: 'Reconcile billing export', p: 'High', kpi: 'MRR', who: 'Marcus Lee', due: 'overdue' },
  ] },
  { name: 'Done', cards: [
    { t: 'Enable org-wide MFA', p: 'Med', kpi: null, who: 'Alex Morgan', due: 'May 28' },
    { t: 'Publish April board pack', p: 'Low', kpi: null, who: 'Sara Chen', due: 'May 24' },
  ] },
  { name: 'Cancelled', cards: [] },
];
function TaskCard({ c, i, done }) {
  return (
    <Card style={{ padding: 11, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'grab', boxShadow: 'var(--shadow-xs)', opacity: done ? 0.7 : 1 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-strong)', lineHeight: 1.35, textDecoration: done ? 'line-through' : 'none' }}>{c.t}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Pill tone={PRIO[c.p]}>{c.p}</Pill>
        {c.kpi && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--c-muted)' }}><Icon name="target" size={11} />{c.kpi}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 1 }}>
        <Avatar name={c.who} size={20} idx={i} />
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: c.due === 'overdue' ? 'var(--c-critical)' : 'var(--c-muted)' }}>
          <Icon name="calendar" size={11} />{c.due}
        </span>
      </div>
    </Card>
  );
}
function TasksView() {
  const [cols, setCols] = useStateE(() => COLUMNS.map((c) => ({ name: c.name, cards: c.cards.slice() })));
  const [drag, setDrag] = useStateE(null);   // { ci, idx }
  const [over, setOver] = useStateE(null);   // ci being hovered
  const move = (toCi) => {
    setCols((prev) => {
      if (!drag || drag.ci === toCi) return prev;
      const next = prev.map((c) => ({ name: c.name, cards: c.cards.slice() }));
      const [card] = next[drag.ci].cards.splice(drag.idx, 1);
      if (card) next[toCi].cards.push(card);
      return next;
    });
    setDrag(null); setOver(null);
  };
  return (
    <div>
      <PageHead title="Tasks" sub="Drag cards across the lifecycle — moves are optimistic, quick-add per column">
        <Button variant="secondary" icon="filter" size="md">Filter</Button>
        <Button icon="plus">New task</Button>
      </PageHead>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, alignItems: 'start' }}>
        {cols.map((col, ci) => {
          const isOver = over === ci && drag && drag.ci !== ci;
          return (
            <div key={col.name}
              onDragOver={(e) => { e.preventDefault(); if (over !== ci) setOver(ci); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setOver((o) => (o === ci ? null : o)); }}
              onDrop={(e) => { e.preventDefault(); move(ci); }}
              style={{ background: isOver ? 'var(--c-accent-bg)' : 'var(--c-surface-1)', border: '1.5px ' + (isOver ? 'dashed hsl(var(--accent-primary))' : 'solid var(--c-border)'), borderRadius: 'var(--radius-xl)', padding: 10, display: 'flex', flexDirection: 'column', gap: 9, minHeight: 200, transition: 'background var(--dur-fast), border-color var(--dur-fast)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 2px 0' }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-strong)' }}>{col.name}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-muted)', background: 'var(--c-surface-2)', borderRadius: 999, padding: '1px 7px', fontVariantNumeric: 'tabular-nums' }}>{col.cards.length}</span>
                <Icon name="plus" size={14} style={{ color: 'var(--c-muted)', marginLeft: 'auto', cursor: 'pointer' }} />
              </div>
              {col.cards.map((c, i) => (
                <div key={c.t} draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDrag({ ci, idx: i }); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  style={{ opacity: drag && drag.ci === ci && drag.idx === i ? 0.4 : 1 }}>
                  <TaskCard c={c} i={i + ci} done={col.name === 'Done'} />
                </div>
              ))}
              {col.cards.length === 0 && <div style={{ border: '1.5px dashed var(--c-border)', borderRadius: 10, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, color: 'var(--c-disabled)' }}>Drop here</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =============================== REPORTS =============================== */
const REPORTS = [
  { name: 'Weekly revenue digest', fmt: 'PDF', cron: 'Every Mon · 8:00', status: 'ok', recip: 4 },
  { name: 'Monthly board pack', fmt: 'PDF', cron: '1st of month · 7:00', status: 'ok', recip: 9 },
  { name: 'Daily sales export', fmt: 'XLSX', cron: 'Every day · 6:00', status: 'failed', recip: 2 },
  { name: 'KPI snapshot', fmt: 'CSV', cron: 'On demand', status: 'never', recip: 1 },
];
function RunStatus({ s }) {
  if (s === 'ok') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--c-success)' }}><Icon name="check" size={13} strokeWidth={2.5} />Delivered</span>;
  if (s === 'failed') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--c-critical)' }}><Icon name="circle-alert" size={13} strokeWidth={2.5} />Failed</span>;
  return <span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>Never run</span>;
}
function ReportDetail({ r, back }) {
  const runs = [['May 27 · 8:00', 'ok', 'Delivered to 4 recipients'], ['May 20 · 8:00', 'ok', 'Delivered to 4 recipients'], ['May 13 · 8:00', 'failed', 'Render timed out after 30s'], ['May 6 · 8:00', 'ok', 'Delivered to 4 recipients']];
  return (
    <div>
      <button onClick={back} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: 'hsl(var(--accent-primary))', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: 0, marginBottom: 14 }}><Icon name="arrow-left" size={14} /> All reports</button>
      <PageHead title={r.name} sub={`${r.fmt} · ${r.cron} · ${r.recip} recipients`}>
        <Button variant="secondary" icon="refresh-cw" size="md">Refresh</Button>
        <Button icon="play" size="md">Trigger now</Button>
      </PageHead>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--c-muted)', marginBottom: 12 }}>Run history</div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {runs.map((run, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 2fr 0.8fr', gap: 12, alignItems: 'center', padding: '13px 16px', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
            <span style={{ fontSize: 13, color: 'var(--c-default)' }}>{run[0]}</span>
            <RunStatus s={run[1]} />
            <span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>{run[2]}</span>
            <span style={{ textAlign: 'right' }}>{run[1] === 'failed' ? <Button variant="ghost" size="sm" icon="rotate-cw">Retry</Button> : <Button variant="secondary" size="sm" icon="download">Download</Button>}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
const QUADS = [
  ['Financial', [['MRR', '$284,910', 12.4, true], ['Gross margin', '68.2%', 0.2, false]]],
  ['Customer', [['NPS', '52', 4, true], ['Logo churn', '3.8%', 0.6, false]]],
  ['Internal process', [['Uptime', '99.9%', 0, true], ['Cycle time', '34d', 5.2, false]]],
  ['Learning & growth', [['eNPS', '38', 6, true], ['Onboarding', '74%', 3, true]]],
];
function BoardPack({ back }) {
  return (
    <div>
      <button onClick={back} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: 'hsl(var(--accent-primary))', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: 0, marginBottom: 14 }}><Icon name="arrow-left" size={14} /> All reports</button>
      <PageHead title="Executive board pack" sub="May 2026 · Northwind Inc. · one-screen summary">
        <Button variant="secondary" icon="printer" size="md">Print / PDF</Button>
      </PageHead>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        {QUADS.map((q, i) => (
          <Card key={i} style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 10, paddingBottom: 9, borderBottom: '1px solid var(--c-divider)' }}>{q[0]}</div>
            {q[1].map((m, j) => (
              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <span style={{ fontSize: 13, color: 'var(--c-muted)', flex: 1 }}>{m[0]}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>{m[1]}</span>
                <span style={{ width: 64, textAlign: 'right' }}>{m[2] === 0 ? <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>—</span> : <Delta v={m[2]} up={m[3]} good={m[3]} />}</span>
              </div>
            ))}
          </Card>
        ))}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--c-muted)', marginBottom: 12 }}>Top movers this period</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-success)', marginBottom: 10 }}>▲ Gainers</div>
          {[['Expansion MRR', 18], ['eNPS', 6], ['Pipeline coverage', 12]].map((m, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ fontSize: 13, color: 'var(--c-default)' }}>{m[0]}</span><Delta v={m[1]} up good /></div>)}
        </Card>
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-critical)', marginBottom: 10 }}>▼ Decliners</div>
          {[['SMB churn', 0.4], ['Gross margin', 0.2], ['CSAT', 0.1]].map((m, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ fontSize: 13, color: 'var(--c-default)' }}>{m[0]}</span><Delta v={m[1]} up={false} good={false} /></div>)}
        </Card>
      </div>
    </div>
  );
}
function ReportsView() {
  const [open, setOpen] = useStateE(null); // 'board' | report object
  if (open === 'board') return <BoardPack back={() => setOpen(null)} />;
  if (open && typeof open === 'object') return <ReportDetail r={open} back={() => setOpen(null)} />;
  return (
    <div>
      <PageHead title="Reports" sub="Scheduled & on-demand — each runs as its creator, so visibility applies">
        <Button variant="secondary" icon="layout-template" size="md" onClick={() => setOpen('board')}>Board pack</Button>
        <Button icon="plus">New report</Button>
      </PageHead>

      <Card hover onClick={() => setOpen('board')} style={{ padding: 16, background: 'var(--gradient-brand-soft)', borderColor: 'hsl(var(--accent-primary) / 0.25)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}>
        <div className="kn-aura kn-aura-soft" style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="file-text" size={20} style={{ color: '#fff' }} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)' }}>Executive board pack</div>
          <div style={{ fontSize: 12.5, color: 'var(--c-muted)', marginTop: 2 }}>One-screen scorecard summary + top movers — print-optimized for the monthly PDF.</div>
        </div>
        <Button variant="secondary" icon="arrow-right" iconRight size="md">Open</Button>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 1.4fr 1.2fr 1fr', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-1)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
          <span>Report</span><span>Format</span><span>Schedule</span><span>Last run</span><span style={{ textAlign: 'right' }}>Recipients</span>
        </div>
        {REPORTS.map((r, i) => (
          <button key={i} className="kn-row" onClick={() => setOpen(r)} style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 1.4fr 1.2fr 1fr', gap: 12, alignItems: 'center', width: '100%', padding: '13px 16px', border: 'none', borderTop: i ? '1px solid var(--c-divider)' : 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-surface-1)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)' }}>{r.name}</span>
            <span><Pill mono>{r.fmt}</Pill></span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--c-default)' }}><Icon name="calendar-clock" size={13} style={{ color: 'var(--c-muted)' }} />{r.cron}</span>
            <RunStatus s={r.status} />
            <span style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums' }}>{r.recip} people</span>
          </button>
        ))}
      </Card>
    </div>
  );
}

Object.assign(window, { OkrsView, TasksView, ReportsView });
