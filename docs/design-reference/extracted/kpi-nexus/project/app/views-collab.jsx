/* global React, Icon, Button, Card, Pill, Avatar, Toggle, Select, PageHead */
/* views-collab.jsx — Approvals (governance) + Activity (audit timeline). */
const { useState: useStateC } = React;

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--c-muted)', margin: '4px 0 12px' }}>{children}</div>;
}

const WORKFLOWS = [
  { type: 'KPI definition', desc: 'Edits to a KPI’s formula, type, or scope', on: true, role: 'Admin' },
  { type: 'KPI target', desc: 'Changing a period target value', on: true, role: 'Finance lead' },
  { type: 'Role permissions', desc: 'Granting or revoking permissions', on: false, role: '—' },
];
const PENDING = [
  { title: 'Change MRR target to $320,000', who: 'Marcus Lee', t: '1h ago', diff: [['target', '$300,000', '$320,000'], ['period', 'Q2 2026', 'Q2 2026']] },
  { title: 'Grant “Editor” role manage-roles', who: 'Devon R.', t: '3h ago', diff: [['ROLES_MANAGE', 'false', 'true']] },
];
function Diff({ rows }) {
  return (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, overflow: 'hidden', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
          <div style={{ display: 'flex', gap: 8, padding: '5px 10px', background: 'hsl(var(--status-critical) / 0.07)' }}><span style={{ color: 'var(--c-critical)', width: 12 }}>-</span><span style={{ color: 'var(--c-muted)' }}>{r[0]}:</span><span style={{ color: 'var(--c-default)' }}>{r[1]}</span></div>
          <div style={{ display: 'flex', gap: 8, padding: '5px 10px', background: 'hsl(var(--status-success) / 0.07)' }}><span style={{ color: 'var(--c-success)', width: 12 }}>+</span><span style={{ color: 'var(--c-muted)' }}>{r[0]}:</span><span style={{ color: 'var(--c-strong)', fontWeight: 600 }}>{r[2]}</span></div>
        </div>
      ))}
    </div>
  );
}
function ApprovalsView() {
  const [flows, setFlows] = useStateC(WORKFLOWS);
  const [pending, setPending] = useStateC(PENDING);
  return (
    <div>
      <PageHead title="Approvals" sub="Govern which changes need sign-off — and decide what’s pending">
        <Pill tone="warning"><Icon name="clock" size={11} />{pending.length} pending</Pill>
      </PageHead>

      <SectionLabel>Workflow configuration</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {flows.map((w, i) => (
          <Card key={i} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)' }}>{w.type}</div><div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 3, lineHeight: 1.45 }}>{w.desc}</div></div>
              <button onClick={() => setFlows((f) => f.map((x, j) => j === i ? { ...x, on: !x.on } : x))} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}><Toggle on={w.on} /></button>
            </div>
            <div style={{ paddingTop: 10, borderTop: '1px solid var(--c-divider)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{ color: 'var(--c-muted)' }}>Approver</span>
              <span style={{ fontWeight: 600, color: w.on ? 'var(--c-strong)' : 'var(--c-disabled)' }}>{w.on ? w.role : '—'}</span>
            </div>
          </Card>
        ))}
      </div>

      <SectionLabel>Pending requests</SectionLabel>
      {pending.length === 0 ? (
        <Card style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>All caught up — no requests waiting on you.</Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pending.map((p, i) => (
            <Card key={i} style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 280px auto', gap: 16, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)' }}>{p.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7, fontSize: 12, color: 'var(--c-muted)' }}><Avatar name={p.who} size={20} idx={i} />Requested by {p.who} · {p.t} · <span style={{ color: 'hsl(var(--accent-primary))' }}>you’re an approver</span></div>
              </div>
              <Diff rows={p.diff} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Button size="sm" icon="check" onClick={() => setPending((ps) => ps.filter((_, j) => j !== i))}>Approve</Button>
                <Button variant="ghost" size="sm" icon="x" onClick={() => setPending((ps) => ps.filter((_, j) => j !== i))}>Reject</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24 }}><SectionLabel>Recently resolved</SectionLabel></div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {[['Approved', 'CAC target change', 'Marcus Lee → Sara Chen', '2d ago'], ['Rejected', 'Delete “Trial signups” KPI', 'Devon R. → Sara Chen', '4d ago']].map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
            <Pill tone={r[0] === 'Approved' ? 'success' : 'critical'}>{r[0]}</Pill>
            <span style={{ fontSize: 13, color: 'var(--c-strong)', fontWeight: 500, flex: 1 }}>{r[1]}</span>
            <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{r[2]}</span>
            <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{r[3]}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ================================ ACTIVITY ================================ */
const FEED = [
  { day: 'Today', rows: [
    { who: 'Sara Chen', verb: 'updated the target on', obj: 'Monthly recurring revenue', icon: 'pencil', t: '12m ago' },
    { who: 'Marcus Lee', verb: 'requested approval for', obj: 'KPI target change', icon: 'git-pull-request', t: '1h ago' },
    { who: 'System', verb: 'fired an alert on', obj: 'Logo churn rate', icon: 'triangle-alert', t: '2h ago' },
    { who: 'Priya N.', verb: 'commented on', obj: 'Net promoter score', icon: 'message-square', t: '3h ago' },
  ] },
  { day: 'Yesterday', rows: [
    { who: 'Devon R.', verb: 'created the task', obj: 'Review backlog', icon: 'plus', t: 'May 30' },
    { who: 'Dana W.', verb: 'updated permissions on', obj: 'Editor role', icon: 'shield', t: 'May 30' },
    { who: 'Sara Chen', verb: 'captured a snapshot of', obj: 'Revenue overview', icon: 'camera', t: 'May 30' },
  ] },
];
function ActivityView() {
  return (
    <div>
      <PageHead title="Activity" sub="An audit-backed timeline of everything happening across your org">
        <Select value="All entities" w={160} />
      </PageHead>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {FEED.map((g, gi) => (
          <div key={gi}>
            <SectionLabel>{g.day}</SectionLabel>
            <Card style={{ padding: '4px 16px' }}>
              {g.rows.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--c-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-muted)', flexShrink: 0 }}><Icon name={a.icon} size={14} /></div>
                  <Avatar name={a.who} size={26} idx={i} />
                  <div style={{ flex: 1, fontSize: 13, color: 'var(--c-default)' }}><b style={{ color: 'var(--c-strong)', fontWeight: 600 }}>{a.who}</b> {a.verb} <span style={{ color: 'hsl(var(--accent-primary))', fontWeight: 500 }}>{a.obj}</span></div>
                  <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{a.t}</span>
                </div>
              ))}
            </Card>
          </div>
        ))}
        <div style={{ textAlign: 'center' }}><Button variant="secondary" size="md">Load more</Button></div>
      </div>
    </div>
  );
}

Object.assign(window, { ApprovalsView, ActivityView });
