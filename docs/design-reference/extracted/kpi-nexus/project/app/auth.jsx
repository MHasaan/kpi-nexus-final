/* global React, ReactDOM, Icon, Button, Card, Pill, Progress, Seg */
/* auth.jsx — unshelled auth & onboarding screens (no app shell). */
const { useState: useStateAU } = React;

function BrandMark({ size = 30, withName = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="kn-aura kn-aura-soft kn-sheen" style={{ width: size, height: size, borderRadius: size * 0.28, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'var(--shadow-sm)' }}>
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 32 32" fill="none">
          <path d="M7 24 L15 18 L21 21 L26 9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="7" cy="24" r="2.4" fill="#fff" /><circle cx="15" cy="18" r="2.4" fill="#fff" /><circle cx="21" cy="21" r="2.4" fill="#fff" /><circle cx="26" cy="9" r="3" fill="#fff" />
        </svg>
      </div>
      {withName && <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--c-strong)', letterSpacing: '-0.02em' }}>KPI Nexus</span>}
    </div>
  );
}
function AInput({ label, type = 'text', placeholder, defaultValue, mono, right, hint }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-default)' }}>{label}</span>}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input type={type} placeholder={placeholder} defaultValue={defaultValue}
          style={{ width: '100%', height: 40, padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface-bg)', color: 'var(--c-strong)', fontSize: 14, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', outline: 'none' }}
          onFocus={(e) => { e.target.style.borderColor = 'hsl(var(--accent-primary))'; e.target.style.boxShadow = '0 0 0 3px hsl(var(--accent-primary) / 0.15)'; }}
          onBlur={(e) => { e.target.style.borderColor = 'var(--c-border)'; e.target.style.boxShadow = 'none'; }} />
        {right && <span style={{ position: 'absolute', right: 11, color: 'var(--c-muted)' }}>{right}</span>}
      </div>
      {hint && <span style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>{hint}</span>}
    </label>
  );
}
const linkS = { color: 'hsl(var(--accent-primary))', fontWeight: 600, cursor: 'pointer' };

/* shell for the centered single-column screens */
function Centered({ children, w = 400, foot }) {
  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', gap: 18 }}>
      <BrandMark />
      <Card style={{ width: w, maxWidth: '92vw', padding: 26, boxShadow: 'var(--shadow-lg)' }}>{children}</Card>
      {foot && <div style={{ fontSize: 13, color: 'var(--c-muted)' }}>{foot}</div>}
    </div>
  );
}
function Title({ t, s }) {
  return <div style={{ marginBottom: 18 }}><div style={{ fontSize: 19, fontWeight: 700, color: 'var(--c-strong)', letterSpacing: '-0.01em' }}>{t}</div>{s && <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>{s}</div>}</div>;
}

function LoginScreen() {
  const [mfa, setMfa] = useStateAU(false);
  return (
    <Centered foot={<span><span style={linkS}>Forgot password?</span> · <span style={linkS}>Create organization</span></span>}>
      <Title t="Sign in" s="Welcome back — measure what matters." />
      {!mfa ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AInput label="Email" type="email" placeholder="you@company.com" />
          <AInput label="Password" type="password" placeholder="••••••••" right={<Icon name="eye" size={16} />} />
          <Button full size="lg" onClick={() => setMfa(true)}>Sign in</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--c-default)' }}>Enter the 6-digit code from your authenticator app.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} style={{ flex: 1, height: 48, borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>{i < 2 ? ['4', '1'][i] : ''}</div>)}
          </div>
          <Button full size="lg">Verify</Button>
          <button onClick={() => setMfa(false)} style={{ ...linkS, background: 'none', border: 'none', fontSize: 13, alignSelf: 'center' }}>← Back</button>
        </div>
      )}
    </Centered>
  );
}

function RegisterScreen() {
  return (
    <Centered w={420} foot={<span>Already have an account? <span style={linkS}>Sign in</span></span>}>
      <Title t="Create organization" s="Spin up a new workspace and its first admin." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        <AInput label="Organization name" placeholder="Northwind Inc." />
        <AInput label="Workspace slug" mono defaultValue="northwind" right={<Icon name="check" size={15} style={{ color: 'var(--c-success)' }} />} hint="kpinexus.com/northwind · available" />
        <AInput label="Your name" placeholder="Alex Morgan" />
        <AInput label="Work email" type="email" placeholder="alex@northwind.io" />
        <div>
          <AInput label="Password" type="password" placeholder="••••••••" />
          <div style={{ display: 'flex', gap: 4, marginTop: 7 }}>{['hsl(var(--accent-primary))', 'hsl(var(--accent-primary))', 'hsl(var(--status-success))', 'var(--c-surface-pressed)'].map((c, i) => <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: c }} />)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--c-muted)', marginTop: 5 }}>Strong — add one more symbol for excellent.</div>
        </div>
        <Button full size="lg" style={{ marginTop: 2 }}>Create organization</Button>
      </div>
    </Centered>
  );
}

function InviteScreen() {
  return (
    <Centered foot={<span>Joining <b style={{ color: 'var(--c-default)' }}>Northwind Inc.</b></span>}>
      <Title t="Accept your invitation" s="Set a password to join the workspace." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 8, background: 'var(--c-surface-1)', border: '1px solid var(--c-border)' }}>
          <Icon name="mail" size={15} style={{ color: 'var(--c-muted)' }} /><span style={{ fontSize: 13, color: 'var(--c-default)', fontFamily: 'var(--font-mono)' }}>jordan@northwind.io</span>
          <Pill tone="neutral" style={{ marginLeft: 'auto' }}>from invite</Pill>
        </div>
        <AInput label="Password" type="password" placeholder="••••••••" />
        <AInput label="Confirm password" type="password" placeholder="••••••••" />
        <Button full size="lg">Accept &amp; continue</Button>
      </div>
    </Centered>
  );
}

function ChoiceCard({ icon, title, lines, effort, featured }) {
  return (
    <Card hover style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', borderColor: featured ? 'hsl(var(--accent-primary) / 0.4)' : 'var(--c-border)', background: featured ? 'var(--gradient-brand-soft)' : 'var(--c-surface-bg)' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: featured ? 'var(--gradient-brand)' : 'var(--c-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: featured ? '#fff' : 'var(--c-default)' }}><Icon name={icon} size={19} /></div>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--c-strong)' }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--c-muted)', lineHeight: 1.5, flex: 1 }}>{lines}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{[0, 1, 2].map((i) => <span key={i} style={{ width: 18, height: 5, borderRadius: 999, background: i < effort ? 'hsl(var(--accent-primary))' : 'var(--c-surface-pressed)' }} />)}<span style={{ fontSize: 11, color: 'var(--c-muted)', marginLeft: 6 }}>effort</span></div>
    </Card>
  );
}
function SignupSplash() {
  return (
    <div style={{ minHeight: '100%', display: 'flex', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ width: 720, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <BrandMark />
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--c-strong)', letterSpacing: '-0.02em', marginTop: 6 }}>Set up your organization</div>
          <div style={{ fontSize: 14, color: 'var(--c-muted)' }}>Pick how you'd like to start — you can change anything later.</div>
        </div>
        <Card style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 11, background: 'var(--c-info-bg)', borderColor: 'hsl(var(--status-info) / 0.3)' }}>
          <Icon name="rotate-ccw" size={16} style={{ color: 'var(--c-info)' }} />
          <span style={{ fontSize: 13, color: 'var(--c-default)', flex: 1 }}>A draft from earlier was found.</span>
          <Button variant="secondary" size="sm" iconRight icon="arrow-right">Resume</Button>
        </Card>
        <div style={{ display: 'flex', gap: 12 }}>
          <AInput label="Work email" placeholder="alex@northwind.io" />
          <div style={{ flex: 1 }}><AInput label="Organization name" placeholder="Northwind Inc." /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <ChoiceCard icon="zap" title="Quick" effort={1} lines="A minimal wizard — a couple of KPIs and you're in." />
          <ChoiceCard icon="sparkles" title="Full · AI co-pilot" effort={3} lines="Describe your org; AI drafts roles, units & KPIs." featured />
          <ChoiceCard icon="layout-grid" title="From a template" effort={2} lines="Start from a curated, industry org template." />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--c-muted)', marginBottom: 10 }}>Template gallery</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[['SaaS Startup', '10 roles · 11 units · 20 KPIs'], ['Sales Org', '6 roles · 8 units · 16 KPIs'], ['Ops & Support', '7 roles · 9 units · 14 KPIs']].map((t, i) => (
              <Card key={i} hover style={{ padding: 13, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)' }}>{t[0]}</div>
                <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>{t[1]}</div>
                <Button variant="secondary" size="sm">Use template</Button>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SignupWizard() {
  const steps = ['Organization', 'AI co-pilot', 'Review', 'Finish'];
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--c-surface-bg)' }}>
      <div style={{ height: 54, flexShrink: 0, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 11, padding: '0 18px' }}>
        <BrandMark size={26} withName={false} /><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c-strong)' }}>Setup wizard</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--c-success)', fontWeight: 600 }}><Icon name="check" size={13} />Saved</span>
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '210px 1fr 300px', minHeight: 0 }}>
        <div style={{ borderRight: '1px solid var(--c-border)', background: 'var(--c-surface-1)', padding: 14 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, background: i === 1 ? 'var(--c-accent-bg)' : 'transparent', marginBottom: 2 }}>
              <span style={{ width: 22, height: 22, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: i < 1 ? 'hsl(var(--accent-primary))' : i === 1 ? 'transparent' : 'var(--c-surface-bg)', border: i <= 1 ? '1.5px solid hsl(var(--accent-primary))' : '1.5px solid var(--c-border-strong)', color: i < 1 ? '#fff' : i === 1 ? 'hsl(var(--accent-primary))' : 'var(--c-muted)' }}>{i < 1 ? '✓' : i + 1}</span>
              <span style={{ fontSize: 13, fontWeight: i === 1 ? 600 : 500, color: i === 1 ? 'var(--c-strong)' : 'var(--c-muted)' }}>{s}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: 22, overflowY: 'auto' }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--c-strong)', letterSpacing: '-0.01em' }}>AI co-pilot</div>
          <div style={{ fontSize: 13.5, color: 'var(--c-muted)', marginTop: 4, marginBottom: 18 }}>Describe your org — the co-pilot drafts roles, units & KPIs.</div>
          <div style={{ maxWidth: 360, marginBottom: 22 }}><AInput label="Organization name" defaultValue="Northwind Inc." /></div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--c-muted)', marginBottom: 12 }}>Review · draft depth</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {[['Roles', 10], ['Positions', 14], ['Units', 11], ['Categories', 5], ['KPIs', 20]].map((t, i) => (
              <Card key={i} style={{ padding: 14, textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--c-strong)', fontVariantNumeric: 'tabular-nums' }}>{t[1]}</div>
                <div style={{ fontSize: 11.5, color: 'var(--c-muted)', marginTop: 3 }}>{t[0]}</div>
              </Card>
            ))}
          </div>
        </div>
        <div style={{ borderLeft: '1px solid var(--c-border)', background: 'var(--c-surface-1)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div className="kn-aura kn-aura-breathe" style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="sparkles" size={15} style={{ color: '#fff' }} /></div>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-strong)' }}>AI co-pilot</span>
          </div>
          <div style={{ background: 'var(--c-surface-bg)', border: '1px solid var(--c-border)', borderRadius: 10, padding: 11, fontSize: 12.5, color: 'var(--c-muted)', minHeight: 56 }}>"We're a 140-person B2B SaaS with sales, CS, and engineering teams…"</div>
          <Button icon="sparkles" full>Generate</Button>
          <Card style={{ padding: 12, borderColor: 'hsl(var(--accent-primary) / 0.3)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-strong)', marginBottom: 8 }}>Proposed changes</div>
            {['+ 10 roles', '+ 11 org units', '+ 20 KPIs', '+ 5 categories'].map((t, i) => <div key={i} style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--c-success)', padding: '2px 0' }}>{t}</div>)}
            <Button size="sm" full style={{ marginTop: 10 }}>Apply all</Button>
          </Card>
        </div>
      </div>
      <div style={{ height: 56, flexShrink: 0, borderTop: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 10 }}>
        <Button variant="secondary" icon="arrow-left">Back</Button>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--c-muted)' }}>Finish: admin name · email · password · slug</span>
        <Button icon="check">Finish setup</Button>
      </div>
    </div>
  );
}

const AUTH_SCREENS = [['Sign in', LoginScreen], ['Create org', RegisterScreen], ['Accept invite', InviteScreen], ['Guided splash', SignupSplash], ['Setup wizard', SignupWizard]];
function AuthApp() {
  const [theme, setTheme] = useStateAU(() => localStorage.getItem('kn-theme') || 'light');
  const [scr, setScr] = useStateAU('Sign in');
  React.useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  const Screen = AUTH_SCREENS.find((s) => s[0] === scr)[1];
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--c-surface-bg)' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px dashed var(--c-border)', background: 'var(--c-surface-1)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-muted)' }}>Preview</span>
        <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: 'var(--c-surface-bg)', boxShadow: 'var(--shadow-inset)', gap: 2 }}>
          {AUTH_SCREENS.map((s) => <button key={s[0]} onClick={() => setScr(s[0])} style={{ height: 26, padding: '0 11px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-sans)', background: scr === s[0] ? 'hsl(var(--accent-primary))' : 'transparent', color: scr === s[0] ? '#fff' : 'var(--c-muted)' }}>{s[0]}</button>)}
        </div>
        <button onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')} style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--c-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button>
      </div>
      <div key={scr} className="kn-view" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}><Screen /></div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<AuthApp />);
