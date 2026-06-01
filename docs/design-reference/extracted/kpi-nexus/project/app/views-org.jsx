/* global React, Icon, Button, Card, StatusBadge, ScopeBadge, Sparkline, PageHead, Delta, Pill, Progress, Avatar, Tabs, SubNav, Seg, KV, Field, Select, Toggle, EmptyState */
const { useState: useStateO } = React;

/* =============================== PEOPLE =============================== */
const USTAT = { ACTIVE: 'success', INVITED: 'info', SUSPENDED: 'warning', ARCHIVED: 'neutral' };
const USERS = [
  { n: 'Sara Chen', e: 'sara@northwind.io', s: 'ACTIVE', r: 'Admin', m: '—' },
  { n: 'Marcus Lee', e: 'marcus@northwind.io', s: 'ACTIVE', r: 'Manager', m: 'Sara Chen' },
  { n: 'Priya N.', e: 'priya@northwind.io', s: 'ACTIVE', r: 'Member', m: 'Marcus Lee' },
  { n: 'Devon R.', e: 'devon@northwind.io', s: 'INVITED', r: 'Editor', m: 'Sara Chen' },
  { n: 'Jordan Ho', e: 'jordan@northwind.io', s: 'ACTIVE', r: 'Member', m: 'Marcus Lee' },
  { n: 'Lee Ray', e: 'lee@northwind.io', s: 'SUSPENDED', r: 'Member', m: 'Marcus Lee' },
];
const PERM_GROUPS = [
  ['KPIs', ['View', 'Create', 'Edit', 'Delete', 'Data entry'], [1, 1, 1, 0, 1]],
  ['Dashboards', ['View', 'Manage'], [1, 1]],
  ['Users & RBAC', ['Users view', 'Users manage', 'Roles manage'], [1, 1, 0]],
  ['Org', ['Positions', 'Groups view', 'Groups manage'], [1, 1, 0]],
  ['Intelligence', ['Alerts', 'Insights', 'Analytics', 'Reports'], [1, 1, 1, 1]],
  ['Admin', ['Org settings'], [0]],
];
function PermCell({ on, inherited }) {
  return (
    <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid ' + (inherited ? 'var(--c-border)' : on ? 'transparent' : 'var(--c-border-strong)'),
      background: on ? (inherited ? 'var(--c-surface-2)' : 'hsl(var(--accent-primary))') : 'var(--c-surface-bg)',
      color: on ? (inherited ? 'var(--c-muted)' : '#fff') : 'transparent' }}>
      <Icon name="check" size={12} strokeWidth={3} />
    </span>
  );
}
function UserDetail({ u, back }) {
  const assigns = [
    { n: 'Personal sales target', cur: '$82k', tgt: '$100k', spark: [60, 64, 68, 71, 74, 78, 80, 82], status: 'on-track' },
    { n: 'Accounts managed', cur: '24', tgt: '25', spark: [20, 21, 22, 22, 23, 24, 24, 24], status: 'on-track' },
    { n: 'Avg response time', cur: '1.8h', tgt: '2.0h', spark: [2.6, 2.4, 2.2, 2.1, 2.0, 1.9, 1.9, 1.8], status: 'on-track' },
  ];
  return (
    <div>
      <button onClick={back} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: 'hsl(var(--accent-primary))', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: 0, marginBottom: 14 }}><Icon name="arrow-left" size={14} /> People &amp; org</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <Avatar name={u.n} size={48} idx={2} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--c-strong)' }}>{u.n}</h1><Pill tone={USTAT[u.s]}>{u.s}</Pill></div>
          <div style={{ fontSize: 12.5, color: 'var(--c-muted)', marginTop: 5, fontFamily: 'var(--font-mono)' }}>{u.e} · {u.r} · reports to {u.m}</div>
        </div>
        <Button variant="secondary" icon="pencil" size="md">Edit</Button>
        <Button variant="secondary" icon="user-x" size="md">Suspend</Button>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--c-muted)', marginBottom: 12 }}>PER_USER KPI assignments</div>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {assigns.map((a, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.2fr 1.1fr', gap: 12, alignItems: 'center', padding: '13px 16px', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ display: 'inline-flex', height: 20, padding: '0 7px', borderRadius: 5, background: 'hsl(var(--chart-7) / 0.18)', color: 'hsl(326 60% 48%)', fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)', alignItems: 'center' }}>PER_USER</span><b style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)' }}>{a.n}</b></span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>{a.cur}</span>
            <span style={{ fontSize: 13, color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums' }}>/ {a.tgt}</span>
            <Sparkline data={a.spark} w={110} h={26} color="hsl(var(--accent-primary))" fluid />
            <span style={{ justifySelf: 'end' }}><StatusBadge status={a.status} size="sm" /></span>
          </div>
        ))}
      </Card>
    </div>
  );
}
function PeopleView() {
  const [tab, setTab] = useStateO('Users');
  const [selUser, setSelUser] = useStateO(null);
  if (selUser) return <UserDetail u={selUser} back={() => setSelUser(null)} />;
  return (
    <div>
      <PageHead title="People & org" sub="Identity, roles & structure — the trust backbone, 18 canonical permissions">
        {tab === 'Users' && <Button icon="user-plus">Invite user</Button>}
        {tab === 'Roles' && <Button icon="plus">New role</Button>}
        {tab === 'Org units' && <Button icon="plus">New unit</Button>}
      </PageHead>
      <Tabs tabs={['Users', 'Roles', 'Org units']} value={tab} onChange={setTab} />

      {tab === 'Users' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.8fr 1fr 1fr 1.2fr', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-1)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
            <span>Name</span><span>Email</span><span>Status</span><span>Role</span><span>Manager</span>
          </div>
          {USERS.map((u, i) => (
            <button key={i} className="kn-row" onClick={() => setSelUser(u)} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.8fr 1fr 1fr 1.2fr', gap: 12, alignItems: 'center', width: '100%', padding: '11px 16px', border: 'none', borderTop: i ? '1px solid var(--c-divider)' : 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-surface-1)')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><Avatar name={u.n} size={26} idx={i} /><b style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)' }}>{u.n}</b></span>
              <span style={{ fontSize: 12.5, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)' }}>{u.e}</span>
              <span><Pill tone={USTAT[u.s]}>{u.s}</Pill></span>
              <span style={{ fontSize: 13, color: 'var(--c-default)' }}>{u.r}</span>
              <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>{u.m}</span>
            </button>
          ))}
        </Card>
      )}

      {tab === 'Roles' && (
        <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 14, alignItems: 'start' }}>
          <Card style={{ padding: 8 }}>
            {[['Admin', 1, true], ['Manager', 3, false], ['Editor', 2, false], ['Member', 8, false]].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 8, background: i === 1 ? 'var(--c-accent-bg)' : 'transparent', cursor: 'pointer' }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: 'hsl(var(--chart-' + (i + 2) + '))' }} />
                <span style={{ fontSize: 13, fontWeight: i === 1 ? 600 : 500, color: i === 1 ? 'hsl(var(--accent-primary))' : 'var(--c-default)', flex: 1 }}>{r[0]}</span>
                {r[2] && <Pill tone="accent">admin</Pill>}
                <span style={{ fontSize: 11.5, color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums' }}>{r[1]}</span>
              </div>
            ))}
          </Card>
          <Card style={{ padding: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 4 }}>Permission matrix · Manager</div>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 16 }}>Faded checks are inherited (read-only). Resolver order: isAdmin → resource → role → inherited.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {PERM_GROUPS.map((g, gi) => (
                <div key={gi}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-muted)', marginBottom: 9 }}>{g[0]}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px' }}>
                    {g[1].map((p, pi) => (
                      <label key={pi} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: 150, cursor: 'pointer' }}>
                        <PermCell on={g[2][pi] === 1} inherited={gi === 4 && pi > 1} />
                        <span style={{ fontSize: 12.5, color: 'var(--c-default)' }}>{p}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'Org units' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14, alignItems: 'start' }}>
          <Card style={{ padding: 10 }}>
            {[[0, 'Northwind Inc.', '142 people', true], [1, 'Revenue', '42', true], [2, 'Sales', '18', false], [2, 'Customer Success', '11', false], [1, 'Engineering', '30', true], [2, 'Platform', '9', false], [2, 'Product', '12', false]].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 8px', paddingLeft: 8 + r[0] * 22, borderTop: i ? '1px solid var(--c-divider)' : 'none', cursor: 'pointer' }}>
                {!r[3] ? <span style={{ width: 14 }} /> : <Icon name="chevron-down" size={14} style={{ color: 'var(--c-muted)' }} />}
                <Icon name={r[0] === 0 ? 'building-2' : 'users'} size={15} style={{ color: 'var(--c-muted)' }} />
                <span style={{ fontSize: 13, fontWeight: r[0] < 2 ? 600 : 500, color: 'var(--c-strong)', flex: 1 }}>{r[1]}</span>
                <span style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>{r[2]}</span>
              </div>
            ))}
          </Card>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 12 }}>Sales · members</div>
            {[['Marcus Lee', 'MANAGER'], ['Priya N.', 'member'], ['Jordan Ho', 'member'], ['Lee Ray', 'member']].map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
                <Avatar name={m[0]} size={24} idx={i} /><span style={{ fontSize: 13, color: 'var(--c-default)', flex: 1 }}>{m[0]}</span>
                <Pill tone={m[1] === 'MANAGER' ? 'accent' : 'neutral'} mono>{m[1]}</Pill>
              </div>
            ))}
            <Button variant="secondary" size="sm" icon="user-plus" full style={{ marginTop: 12 }}>Add member</Button>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ============================ INTEGRATIONS ============================ */
const PROVIDERS = [
  { n: 'Slack', blurb: 'Send alerts & acknowledge from channels', conn: true, sync: '12m ago', icon: 'message-square' },
  { n: 'Microsoft Teams', blurb: 'Post alerts to Teams channels', conn: false, icon: 'message-circle' },
  { n: 'Jira', blurb: 'Create issues from tasks & recommendations', conn: true, sync: '1h ago', icon: 'square-kanban' },
  { n: 'Salesforce', blurb: 'Sync pipeline & revenue KPIs', conn: false, icon: 'cloud' },
  { n: 'Google Sheets', blurb: 'Pull metrics from spreadsheets', conn: false, icon: 'sheet' },
  { n: 'PagerDuty', blurb: 'Escalate critical alerts on-call', conn: false, icon: 'siren' },
];
const CONNECTORS = [
  { n: 'Stripe MRR', type: 'REST', sched: 'Every 6h', status: 'ok' },
  { n: 'GA4 sessions', type: 'REST', sched: 'Daily', status: 'partial' },
  { n: 'Warehouse churn', type: 'GraphQL', sched: 'Daily', status: 'ok' },
];
const PLUGINS = [
  { n: 'Heatmap widget', type: 'widget', v: '1.2.0', on: true },
  { n: 'Cohort template', type: 'template', v: '0.9.1', on: true },
  { n: 'CAGR formula', type: 'formula-fn', v: '1.0.0', on: false },
  { n: 'Snowflake connector', type: 'connector', v: '2.1.0', on: false },
];
function IntegrationsView() {
  const [tab, setTab] = useStateO('Marketplace');
  return (
    <div>
      <PageHead title="Integrations" sub="Connect providers, sync data into KPIs, extend with plugins — admin only" />
      <Tabs tabs={['Marketplace', 'Connectors', 'Plugins']} value={tab} onChange={setTab} />

      {tab === 'Marketplace' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {PROVIDERS.map((p, i) => (
            <Card key={i} hover style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--c-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--c-default)' }}><Icon name={p.icon} size={19} /></div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)', flex: 1 }}>{p.n}</div>
                {p.conn && <Pill tone="success"><Icon name="check" size={11} />Connected</Pill>}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--c-muted)', lineHeight: 1.5, minHeight: 36 }}>{p.blurb}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                {p.conn ? <><Button variant="secondary" size="sm">Manage</Button><span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--c-muted)' }}>synced {p.sync}</span></> : <Button size="sm" icon="plug">Connect</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'Connectors' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr 1fr 1.2fr 0.8fr', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-1)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
            <span>Connector</span><span>Type</span><span>Schedule</span><span>Last run</span><span style={{ textAlign: 'right' }}>Action</span>
          </div>
          {CONNECTORS.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.8fr 1fr 1.2fr 0.8fr', gap: 12, alignItems: 'center', padding: '13px 16px', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)' }}>{c.n}</span>
              <span><Pill mono>{c.type}</Pill></span>
              <span style={{ fontSize: 12.5, color: 'var(--c-default)' }}>{c.sched}</span>
              <span>{c.status === 'ok' ? <Pill tone="success"><Icon name="check" size={11} />Success</Pill> : <Pill tone="warning"><Icon name="triangle-alert" size={11} />Partial</Pill>}</span>
              <span style={{ textAlign: 'right' }}><Button variant="secondary" size="sm" icon="play">Run</Button></span>
            </div>
          ))}
        </Card>
      )}

      {tab === 'Plugins' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {PLUGINS.map((p, i) => (
            <Card key={i} style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--c-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--c-default)' }}><Icon name="puzzle" size={18} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)' }}>{p.n}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}><Pill mono>{p.type}</Pill><span style={{ fontSize: 11, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)' }}>v{p.v}</span></div>
              </div>
              <Toggle on={p.on} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================== SETTINGS ============================== */
function SetRow({ title, desc, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18, padding: '16px 0', borderTop: '1px solid var(--c-divider)', alignItems: 'center' }}>
      <div><div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)' }}>{title}</div><div style={{ fontSize: 12.5, color: 'var(--c-muted)', marginTop: 3, lineHeight: 1.5 }}>{desc}</div></div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}
const SET_SECTIONS = ['Organization', 'AI & budget', 'Notifications', 'API keys', 'Webhooks', 'Retention', 'SSO', 'Audit log'];
function SettingsView() {
  const [sec, setSec] = useStateO('Organization');
  return (
    <div>
      <PageHead title="Settings" sub="Administer your organization, AI, security & data" />
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 8 }}>
          {SET_SECTIONS.map((s) => (
            <button key={s} onClick={() => setSec(s)} style={{ textAlign: 'left', height: 34, padding: '0 11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: sec === s ? 600 : 500, fontFamily: 'var(--font-sans)', background: sec === s ? 'var(--c-accent-bg)' : 'transparent', color: sec === s ? 'hsl(var(--accent-primary))' : 'var(--c-default)' }}
              onMouseEnter={(e) => { if (sec !== s) e.currentTarget.style.background = 'var(--c-surface-hover)'; }} onMouseLeave={(e) => { if (sec !== s) e.currentTarget.style.background = 'transparent'; }}>{s}</button>
          ))}
        </div>
        <div>{renderSettings(sec)}</div>
      </div>
    </div>
  );
}
function renderSettings(sec) {
  if (sec === 'AI & budget') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 14 }}>Budget</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <div style={{ flex: 1 }}><Progress pct={62} /></div>
            <span style={{ fontSize: 12.5, color: 'var(--c-muted)', fontVariantNumeric: 'tabular-nums' }}>$31 / $50 today</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>Resets 00:00 UTC · monthly cap $1,200</div>
        </Card>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--c-divider)', fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)' }}>Per-feature routing</div>
          {[['Insights', 'Gemini', 'gemini-1.5-pro', 'Claude'], ['Ask (NLQ)', 'Gemini', 'gemini-1.5-flash', 'OpenAI'], ['Recommendations', 'Claude', 'claude-3.5-sonnet', 'Gemini'], ['Onboarding co-pilot', 'Gemini', 'gemini-1.5-pro', 'Ollama']].map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1.4fr 1fr', gap: 12, alignItems: 'center', padding: '11px 16px', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)' }}>{r[0]}</span>
              <span style={{ fontSize: 12.5, color: 'var(--c-default)' }}>{r[1]}</span>
              <span style={{ fontSize: 12, color: 'var(--c-muted)', fontFamily: 'var(--font-mono)' }}>{r[2]}</span>
              <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>↳ {r[3]}</span>
            </div>
          ))}
        </Card>
      </div>
    );
  }
  if (sec === 'API keys') {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><Button icon="plus">Create key</Button></div>
        <Card style={{ padding: 16, background: 'var(--c-warning-bg)', borderColor: 'hsl(var(--status-warning) / 0.3)', marginBottom: 14, display: 'flex', gap: 11, alignItems: 'center' }}>
          <Icon name="key-round" size={18} style={{ color: 'var(--c-warning)' }} />
          <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)' }}>kpn_8fX2aQ··live··Zk19PqR4mN</div><div style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>Shown once — copy now and store it securely.</div></div>
          <Button variant="secondary" size="sm" icon="copy">Copy</Button>
        </Card>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 0.7fr', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-1)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>
            <span>Prefix</span><span>Scopes</span><span>Last used</span><span style={{ textAlign: 'right' }}></span>
          </div>
          {[['kpn_8fX2', ['KPI_DATA_ENTRY'], '2h ago'], ['kpn_Lm7K', ['KPI_VIEW', 'DASHBOARD_VIEW'], '3d ago'], ['kpn_zQ91', ['ANALYTICS_VIEW'], 'never']].map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 0.7fr', gap: 12, alignItems: 'center', padding: '12px 16px', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--c-strong)' }}>{r[0]}····</span>
              <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>{r[1].map((s) => <Pill key={s} mono>{s}</Pill>)}</span>
              <span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>{r[2]}</span>
              <span style={{ textAlign: 'right' }}><Button variant="ghost" size="sm">Revoke</Button></span>
            </div>
          ))}
        </Card>
      </div>
    );
  }
  if (sec === 'Audit log') {
    const AC = { CREATE: 'success', UPDATE: 'info', DELETE: 'critical', LOGIN: 'neutral' };
    return (
      <div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}><Select value="Action: All" w={150} /><Select value="Entity: All" w={150} /><Button variant="secondary" size="md" icon="filter">Apply</Button></div>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {[['Sara Chen', 'UPDATE', 'KPI · MRR target', '2h ago'], ['Devon R.', 'CREATE', 'Task · SMB save-play', '3h ago'], ['System', 'DELETE', 'Connector · GA (purged)', '5h ago'], ['Marcus Lee', 'UPDATE', 'Role · Editor permissions', '1d ago'], ['Sara Chen', 'LOGIN', 'Session', '1d ago']].map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 2.2fr 1fr', gap: 12, alignItems: 'center', padding: '12px 16px', borderTop: i ? '1px solid var(--c-divider)' : 'none' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar name={r[0]} size={22} idx={i} /><b style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)' }}>{r[0]}</b></span>
              <span><Pill tone={AC[r[1]]} mono>{r[1]}</Pill></span>
              <span style={{ fontSize: 12.5, color: 'var(--c-default)' }}>{r[2]}</span>
              <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{r[3]}</span>
            </div>
          ))}
        </Card>
      </div>
    );
  }
  if (sec === 'Retention') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {[['FREE', '90 days', false], ['PRO', '1 year', true], ['ENTERPRISE', '7 years', false]].map((t, i) => (
          <Card key={i} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, borderColor: t[2] ? 'hsl(var(--accent-primary) / 0.4)' : 'var(--c-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-strong)', letterSpacing: '0.02em' }}>{t[0]}</span>{t[2] && <Pill tone="accent">current</Pill>}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c-strong)' }}>{t[1]}</div>
            <Button variant={t[2] ? 'secondary' : 'primary'} size="sm" full>{t[2] ? 'Applied' : 'Apply'}</Button>
          </Card>
        ))}
      </div>
    );
  }
  // Organization / Notifications / Webhooks / SSO — setting-row sections
  const ROWS = {
    Organization: [
      ['Organization name', 'Shown in the app shell and on emails.', <Field value="Northwind Inc." w={220} />],
      ['Brand colour', 'Feeds the accent across the app shell.', <div style={{ display: 'flex', gap: 7 }}>{['hsl(var(--accent-primary))', 'hsl(var(--chart-3))', 'hsl(var(--chart-5))', 'hsl(var(--chart-4))'].map((c, i) => <span key={i} style={{ width: 26, height: 26, borderRadius: 7, background: c, border: i === 0 ? '2px solid var(--c-strong)' : '1px solid var(--c-border)' }} />)}</div>],
      ['Terminology', 'Rename “KPI” → “Metric”, “Org unit” → “Team”, etc.', <div style={{ display: 'flex', gap: 8 }}><Field value="Metric" w={100} /><Field value="Metrics" w={100} /></div>],
      ['Fiscal year start', 'Used for period scoping across reports.', <Select value="January" w={150} />],
    ],
    Notifications: [
      ['Alert triggered', 'When a rule fires on a KPI you can see.', <Toggle on />],
      ['Mentioned in a comment', 'When someone @mentions you.', <Toggle on />],
      ['Approval decided', 'When your requests are approved or rejected.', <Toggle on />],
      ['Weekly digest', 'A Monday summary email.', <Toggle />],
      ['Quiet hours', 'Mute non-critical notifications.', <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Field value="22:00" w={72} /><span style={{ color: 'var(--c-muted)' }}>→</span><Field value="07:00" w={72} /></div>],
    ],
    Webhooks: [
      ['data_point_added', 'Fires when a KPI records a value.', <Toggle on />],
      ['alert_triggered', 'Fires when any alert rule fires.', <Toggle on />],
      ['task_created', 'Fires when a task is created.', <Toggle />],
      ['approval_request_decided', 'Fires on approve / reject.', <Toggle />],
      ['Signing secret', 'whsec_•••• — shown once on creation.', <Button variant="secondary" size="sm" icon="rotate-cw">Rotate</Button>],
    ],
    SSO: [
      ['Protocol', 'SAML or OIDC identity provider.', <Seg options={['SAML', 'OIDC']} value="SAML" />],
      ['IdP SSO URL', 'Where users are redirected to authenticate.', <Field value="idp.northwind.io/sso" mono w={220} />],
      ['JIT provisioning', 'Create users on first successful login.', <Toggle on />],
      ['Active', 'Enforce SSO for all members.', <Toggle />],
      ['ACS / callback URL', 'Paste this into your IdP.', <Field value="app.kpinexus.com/sso/acs" mono w={220} />],
    ],
  }[sec] || [];
  return (
    <Card style={{ padding: '4px 18px 12px' }}>
      {ROWS.map((r, i) => <SetRow key={i} title={r[0]} desc={r[1]}>{r[2]}</SetRow>)}
      {(sec === 'Organization' || sec === 'Notifications') && <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16 }}><Button icon="check">Save changes</Button></div>}
    </Card>
  );
}

Object.assign(window, { PeopleView, IntegrationsView, SettingsView });
