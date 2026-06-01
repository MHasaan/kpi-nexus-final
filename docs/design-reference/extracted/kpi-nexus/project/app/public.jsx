/* global React, ReactDOM, Icon, Button, Card, LineChart, BarChart, Sparkline, Pill */
/* public.jsx — unshelled public surfaces (no auth, no shell): share viewer, password gate, KPI embed. */
const { useState: useStatePB } = React;

function Mark({ size = 24, withName = true, muted }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: size, height: size, borderRadius: size * 0.28, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 32 32" fill="none"><path d="M7 24 L15 18 L21 21 L26 9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="7" cy="24" r="2.4" fill="#fff" /><circle cx="15" cy="18" r="2.4" fill="#fff" /><circle cx="21" cy="21" r="2.4" fill="#fff" /><circle cx="26" cy="9" r="3" fill="#fff" /></svg>
      </div>
      {withName && <span style={{ fontSize: 14, fontWeight: 700, color: muted ? 'var(--c-muted)' : 'var(--c-strong)', letterSpacing: '-0.01em' }}>KPI Nexus</span>}
    </div>
  );
}
function Up({ v }) { return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--c-success)', fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}><Icon name="arrow-up-right" size={13} strokeWidth={2.5} />{v}</span>; }

function ShareViewer() {
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', background: 'var(--c-surface-bg)' }}>
      <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px', borderBottom: '1px solid var(--c-border)' }}>
        <Mark />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px', borderRadius: 999, background: 'var(--c-surface-2)', color: 'var(--c-muted)', fontSize: 11.5, fontWeight: 600 }}><Icon name="eye" size={12} />Shared · read-only</span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--c-muted)' }}>Revenue overview · Northwind Inc. · captured May 31</span>
      </div>
      <div style={{ flex: 1, padding: 22, maxWidth: 1100, width: '100%', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[['MRR', '$284,910', 12.4], ['New accounts', '312', 5.4], ['Net retention', '111%', 1.2], ['Active users', '48,210', 8.1]].map((t, i) => (
            <Card key={i} style={{ padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>{t[0]}</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums', marginTop: 8 }}>{t[1]}</div>
              <div style={{ marginTop: 6 }}><Up v={t[2] + '%'} /></div>
            </Card>
          ))}
          <Card style={{ padding: '16px 16px 8px', gridColumn: 'span 2' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 6 }}>Revenue trend</div>
            <LineChart series={[{ data: [180, 195, 188, 210, 225, 240, 258, 270, 285], color: 'hsl(var(--chart-11))', fill: true }]} w={460} h={170} />
          </Card>
          <Card style={{ padding: '16px 16px 8px', gridColumn: 'span 2' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 6 }}>Revenue by segment</div>
            <BarChart data={[{ label: 'SMB', v: 120 }, { label: 'Mid', v: 185, color: 'hsl(var(--chart-5))' }, { label: 'Ent', v: 240, color: 'hsl(var(--chart-3))' }, { label: 'Gov', v: 95, color: 'hsl(var(--chart-2))' }]} w={460} h={170} />
          </Card>
        </div>
      </div>
      <div style={{ height: 40, flexShrink: 0, borderTop: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, color: 'var(--c-muted)' }}>
        <Mark size={16} muted /> · no account needed
      </div>
    </div>
  );
}

function PasswordGate() {
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
      <Mark />
      <Card style={{ width: 360, maxWidth: '92vw', padding: 26, textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--c-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: 'var(--c-muted)' }}><Icon name="lock" size={22} /></div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-strong)' }}>This dashboard is protected</div>
        <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 5, marginBottom: 18 }}>Enter the password to view it.</div>
        <input type="password" placeholder="Password" style={{ width: '100%', height: 40, padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface-bg)', color: 'var(--c-strong)', fontSize: 14, outline: 'none', marginBottom: 12, textAlign: 'center' }} />
        <Button full size="lg">View dashboard</Button>
      </Card>
      <div style={{ fontSize: 12.5, color: 'var(--c-muted)', display: 'flex', alignItems: 'center', gap: 6 }}><Mark size={15} muted withName={false} />Powered by KPI Nexus</div>
    </div>
  );
}

function KpiEmbed() {
  return (
    <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--c-surface-1)' }}>
      <Card style={{ width: 340, padding: 18, boxShadow: 'var(--shadow-md)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Icon name="target" size={14} style={{ color: 'var(--c-muted)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-muted)', flex: 1 }}>Monthly recurring revenue</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 6px', borderRadius: 5, background: 'var(--c-accent-bg)', color: 'hsl(var(--accent-primary))', fontSize: 9.5, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>ORG_WIDE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: 'var(--c-strong)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>$284,910</span>
          <Up v="12.4%" />
        </div>
        <div style={{ margin: '12px 0' }}><Sparkline data={[210, 218, 222, 235, 240, 258, 262, 271, 285]} color="hsl(var(--accent-primary))" h={48} fluid /></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--c-divider)', paddingTop: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--c-success)', fontWeight: 600 }}><Icon name="check" size={12} />On track · target $300k</span>
          <span style={{ fontSize: 10, color: 'var(--c-disabled)' }}>KPI Nexus</span>
        </div>
      </Card>
    </div>
  );
}

const PUB_SCREENS = [['Dashboard viewer', ShareViewer], ['Password gate', PasswordGate], ['KPI embed', KpiEmbed]];
function PublicApp() {
  const [theme, setTheme] = useStatePB(() => localStorage.getItem('kn-theme') || 'light');
  const [scr, setScr] = useStatePB('Dashboard viewer');
  React.useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  const Screen = PUB_SCREENS.find((s) => s[0] === scr)[1];
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--c-surface-bg)' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px dashed var(--c-border)', background: 'var(--c-surface-1)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>Preview · public (no auth)</span>
        <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: 'var(--c-surface-bg)', boxShadow: 'var(--shadow-inset)', gap: 2 }}>
          {PUB_SCREENS.map((s) => <button key={s[0]} onClick={() => setScr(s[0])} style={{ height: 26, padding: '0 11px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)', background: scr === s[0] ? 'hsl(var(--accent-primary))' : 'transparent', color: scr === s[0] ? '#fff' : 'var(--c-muted)' }}>{s[0]}</button>)}
        </div>
        <button onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')} style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--c-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button>
      </div>
      <div key={scr} className="kn-view" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}><Screen /></div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<PublicApp />);
