/* global React, Icon, Button, Card, LineChart, BarChart, Sparkline, Delta, Pill, Seg, Field, Select, Avatar */
/* views-extras.jsx — CommentsDrawer (reusable overlay) + interactive DashboardsView.
   Loaded after views.jsx so its DashboardsView wins the window export. */
const { useState: useStateX } = React;

/* ========================= Comments drawer ========================= */
const COMMENTS = [
  { who: 'Marcus Lee', t: '2h ago', body: 'This threshold looks aggressive — should we soften the warning band before the alert fires again?' },
  { who: 'Sara Chen', t: '1h ago', body: 'Good call. @marcus I’ll set the warning band at $260k and keep critical at $240k.', mention: '@marcus' },
  { who: 'Marcus Lee', t: '54m ago', body: 'Works for me. Approving the target change now.' },
];
function CommentsDrawer({ open, onClose, entity, entityType = 'kpi' }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'hsl(240 10% 10% / 0.32)', backdropFilter: 'blur(1.5px)', animation: 'knFadeIn var(--dur-base) var(--ease-out) both' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 384, maxWidth: '92vw', background: 'var(--c-surface-bg)', borderLeft: '1px solid var(--c-border)', boxShadow: 'var(--shadow-pop)', display: 'flex', flexDirection: 'column', animation: 'knSlideIn var(--dur-slow) var(--ease-out) both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 16px', borderBottom: '1px solid var(--c-border)' }}>
          <Icon name="message-square" size={17} style={{ color: 'hsl(var(--accent-primary))' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)' }}>Comments</div>
            <div style={{ fontSize: 11.5, color: 'var(--c-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entityType} · {entity}</div>
          </div>
          <button onClick={onClose} className="kn-iconbtn" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--c-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={17} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {COMMENTS.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 10 }}>
              <Avatar name={c.who} size={28} idx={i} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-strong)' }}>{c.who}</span>
                  <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>{c.t}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--c-default)', lineHeight: 1.55, marginTop: 3 }}>
                  {c.mention ? c.body.split(c.mention).map((p, j) => j === 0 ? p : <React.Fragment key={j}><span style={{ color: 'hsl(var(--accent-primary))', fontWeight: 600 }}>{c.mention}</span>{p}</React.Fragment>) : c.body}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: 14, borderTop: '1px solid var(--c-border)' }}>
          <div style={{ border: '1px solid var(--c-border-strong)', borderRadius: 10, padding: 10, background: 'var(--c-surface-bg)' }}>
            <div style={{ fontSize: 13, color: 'var(--c-muted)', minHeight: 34 }}>Add a comment… use @ to mention</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Icon name="at-sign" size={15} style={{ color: 'var(--c-muted)' }} />
              <Icon name="paperclip" size={15} style={{ color: 'var(--c-muted)' }} />
              <Button size="sm" icon="send" style={{ marginLeft: 'auto' }}>Comment</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================= Interactive Dashboards ========================= */
function DDelta({ v, up, good }) { return <Delta v={v} up={up} good={good} />; }
function WidgetShell({ title, edit, children, span = 1 }) {
  return (
    <Card style={{ padding: 14, gridColumn: `span ${span}`, position: 'relative' }}>
      {edit && (
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ color: 'var(--c-disabled)', cursor: 'grab', fontSize: 13, letterSpacing: -2 }}>⋮⋮</span>
          <button style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'var(--c-surface-2)', color: 'var(--c-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={13} /></button>
        </div>
      )}
      {title && <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-muted)', marginBottom: 8 }}>{title}</div>}
      {children}
    </Card>
  );
}
function DashboardsView() {
  const [edit, setEdit] = useStateX(false);
  const [addOpen, setAddOpen] = useStateX(false);
  const [range, setRange] = useStateX('30D');
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-strong)' }}>Revenue overview</h1>
          <p style={{ margin: '5px 0 0', fontSize: 13.5, color: 'var(--c-muted)' }}>8 widgets · owned by Sara Chen</p>
        </div>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
          <Seg options={['7D', '30D', 'QTD', 'YTD']} value={range} onChange={setRange} />
          <Button variant="secondary" icon="share-2" size="md">Share</Button>
          {edit && <Button variant="secondary" icon="plus" size="md" onClick={() => setAddOpen((o) => !o)}>Add widget</Button>}
          <Button variant={edit ? 'primary' : 'secondary'} icon={edit ? 'check' : 'pencil'} size="md" onClick={() => { setEdit((e) => !e); setAddOpen(false); }}>{edit ? 'Done' : 'Edit'}</Button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--c-success)', fontWeight: 600 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--c-success)' }} className="kn-pulse" /> Live</span>
        <span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>· refreshes via SSE · scoped to last {range}</span>
        {edit && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'hsl(var(--accent-primary))', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="move" size={13} />Drag tiles to rearrange · changes save with optimistic concurrency</span>}
      </div>

      {addOpen && (
        <Card style={{ padding: 16, marginBottom: 14, borderColor: 'hsl(var(--accent-primary) / 0.4)', background: 'var(--gradient-brand-soft)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 12 }}>Add a widget</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Title" placeholder="e.g. Gross margin" w={200} />
            <Select label="KPI" value="Monthly recurring revenue" w={240} />
            <Select label="Type" value="Line chart" w={150} />
            <Button icon="plus">Add</Button>
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <WidgetShell title="MRR" edit={edit}><div style={{ fontSize: 26, fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>$284,910</div><div style={{ marginTop: 4 }}><DDelta v={12.4} up good /></div></WidgetShell>
        <WidgetShell title="New accounts" edit={edit}><div style={{ fontSize: 26, fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>312</div><div style={{ marginTop: 4 }}><DDelta v={5.4} up good /></div></WidgetShell>
        <WidgetShell title="Net retention" edit={edit}><div style={{ fontSize: 26, fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>111%</div><div style={{ marginTop: 4 }}><DDelta v={1.2} up good /></div></WidgetShell>
        <WidgetShell title="Logo churn" edit={edit}><div style={{ fontSize: 26, fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>3.8%</div><div style={{ marginTop: 4 }}><DDelta v={0.6} up good={false} /></div></WidgetShell>
        <WidgetShell title="Revenue trend" edit={edit} span={2}><LineChart series={[{ data: [180, 195, 188, 210, 225, 240, 258, 270, 285], color: 'hsl(var(--chart-11))', fill: true }]} w={300} h={150} /></WidgetShell>
        <WidgetShell title="Revenue by segment" edit={edit} span={2}><BarChart data={[{ label: 'SMB', v: 120 }, { label: 'Mid', v: 185, color: 'hsl(var(--chart-5))' }, { label: 'Ent', v: 240, color: 'hsl(var(--chart-3))' }, { label: 'Gov', v: 95, color: 'hsl(var(--chart-2))' }]} w={300} h={150} /></WidgetShell>
        <WidgetShell title="Pipeline by stage" edit={edit} span={2}>
          {[['Discovery', 80], ['Qualified', 62], ['Proposal', 44], ['Closing', 28]].map((r, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--c-default)', marginBottom: 4 }}><span>{r[0]}</span><span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--c-muted)' }}>{r[1]}</span></div>
              <div style={{ height: 7, borderRadius: 999, background: 'var(--c-surface-2)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${r[1]}%`, background: `hsl(var(--chart-${i + 1}))`, borderRadius: 999 }} /></div>
            </div>
          ))}
        </WidgetShell>
        <WidgetShell title="NPS" edit={edit}><div style={{ fontSize: 26, fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>52</div><div style={{ marginTop: 8 }}><Sparkline data={[44, 46, 47, 48, 49, 50, 51, 52]} h={30} fluid /></div></WidgetShell>
        <WidgetShell title="ARPA" edit={edit}><div style={{ fontSize: 26, fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>$913</div><div style={{ marginTop: 4 }}><DDelta v={2.1} up good /></div></WidgetShell>
        {edit && (
          <button onClick={() => setAddOpen(true)} style={{ gridColumn: 'span 2', minHeight: 96, border: '1.5px dashed var(--c-border-strong)', borderRadius: 'var(--radius-xl)', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7, color: 'var(--c-muted)' }}>
            <Icon name="plus" size={22} /><span style={{ fontSize: 13, fontWeight: 500 }}>Add widget</span>
          </button>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { CommentsDrawer, DashboardsView });
