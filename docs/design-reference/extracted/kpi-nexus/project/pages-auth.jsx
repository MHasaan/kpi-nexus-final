/* pages-auth.jsx — 01 auth & onboarding (no app shell).
   Exports: AuthLogin, AuthRegister, AuthInvite, SignupSplash, SignupWizard */

function AuthLogin() {
  return (
    <AuthCard title="Sign in" sub="Welcome back — measure what matters."
      footer={<span>Forgot password? · Create organization</span>}>
      <Field label="Email" ph="70%" />
      <Field label="Password" ph="55%" />
      <Btn accent full>Sign in</Btn>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: muted }} />
        <span style={{ font: "13px 'Caveat', cursive", color: ink2 }}>MFA step replaces password inline</span>
        <div style={{ flex: 1, height: 1, background: muted }} />
      </div>
      <Sketch r={0.6} style={{ padding: 11, display: "flex", flexDirection: "column", gap: 9, borderStyle: "dashed" }}>
        <span style={{ font: "600 11.5px/1 'Kalam', cursive", color: ink2 }}>6-digit code</span>
        <div style={{ display: "flex", gap: 6 }}>{[0,1,2,3,4,5].map(i => <div key={i} style={{ width: 30, height: 36, border: `1.5px solid ${ink}`, borderRadius: 6 }} />)}</div>
      </Sketch>
    </AuthCard>
  );
}

function AuthRegister() {
  return (
    <AuthCard title="Create organization" sub="Spin up a new tenant and its first admin." w={420}
      footer={<span>Already have an account? Sign in</span>}>
      <Field label="Organization name" ph="65%" />
      <Field label="Slug" value="acme-inc" mono hint="Auto-suggested · checked for uniqueness" />
      <Field label="Admin full name" ph="55%" />
      <Field label="Admin email" ph="70%" />
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <Field label="Admin password" ph="50%" />
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          {[useCtxAccent(), useCtxAccent(), "#2f7d4f", muted].map((c, i) => <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: c }} />)}
        </div>
      </div>
      <Btn accent full>Create organization</Btn>
    </AuthCard>
  );
}

function AuthInvite() {
  return (
    <AuthCard title="Accept your invitation" sub="You've been invited to join Acme Inc.">
      <Field label="Email" value="jordan@acme.co" hint="From your invitation — read only" />
      <Field label="Password" ph="55%" />
      <Field label="Confirm password" ph="55%" />
      <Btn accent full>Accept & continue</Btn>
    </AuthCard>
  );
}

function ChoiceCard({ icon, title, effort, lines, accentTop }) {
  const acc = useCtxAccent();
  return (
    <Sketch style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 10, borderTop: accentTop ? `3px solid ${acc}` : undefined }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, border: `1.5px solid ${ink}`, background: muted2, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Glyph name={icon} size={20} color={ink} />
      </div>
      <div style={{ font: "700 15px/1.1 'Kalam', cursive", color: ink }}>{title}</div>
      <div style={{ font: "14px/1.25 'Caveat', cursive", color: ink2 }}>{lines}</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 3 }}>
        {[0,1,2].map(i => <div key={i} style={{ width: 18, height: 5, borderRadius: 999, background: i < effort ? acc : muted2 }} />)}
        <span style={{ font: "12px 'Caveat', cursive", color: ink2, marginLeft: 6 }}>effort</span>
      </div>
    </Sketch>
  );
}

function SignupSplash() {
  return (
    <div style={{ height: "100%", overflow: "hidden", background: "#efece4", display: "flex", justifyContent: "center", padding: "26px 24px", font: "'Kalam', cursive" }}>
      <div style={{ width: 720, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ font: "800 22px/1.1 'Kalam', cursive", color: ink }}>Set up your organization</div>
          <div style={{ font: "16px/1.3 'Caveat', cursive", color: ink2 }}>Pick how you'd like to start. You can change anything later.</div>
        </div>
        <Banner kind="info">A draft from earlier was found — resume where you left off &nbsp; <span style={{ textDecoration: "underline" }}>Resume →</span></Banner>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Work email" w="50%" ph="60%" />
          <Field label="Organization name" w="50%" ph="55%" />
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <ChoiceCard icon="activity" title="Quick" effort={1} lines="Minimal wizard — a couple of KPIs and you're in." />
          <ChoiceCard icon="sparkles" title="Full · AI co-pilot" effort={3} lines="AI proposes roles, units & KPIs from a prompt." accentTop />
          <ChoiceCard icon="grid" title="From a template" effort={2} lines="Start from a built-in org template." />
        </div>
        <div>
          <SectionLabel>Template gallery</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {["SaaS Startup (Rich)", "Sales Org", "Ops & Support"].map((t, i) => (
              <Sketch key={i} style={{ padding: 12, display: "flex", flexDirection: "column", gap: 7 }}>
                <div style={{ font: "700 13px/1.1 'Kalam', cursive", color: ink }}>{t}</div>
                <div style={{ font: "13px 'Caveat', cursive", color: ink2 }}>10 roles · 11 units · 20 KPIs</div>
                <Btn sm>Use template</Btn>
              </Sketch>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SignupWizard() {
  const acc = useCtxAccent();
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: paper, font: "'Kalam', cursive", color: ink }}>
      {/* wizard header */}
      <div style={{ height: 50, flex: "none", borderBottom: `1.5px solid ${ink}`, display: "flex", alignItems: "center", gap: 10, padding: "0 18px" }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: acc }} />
        <span style={{ font: "800 15px/1 'Kalam', cursive" }}>KPI Nexus</span>
        <span style={{ color: muted }}>/</span>
        <span style={{ font: "600 13px/1 'Kalam', cursive", color: ink2 }}>Setup wizard</span>
        <div style={{ flex: 1 }} />
        <Pill>Saved ✓</Pill>
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "210px 1fr 300px", minHeight: 0 }}>
        {/* step rail */}
        <div style={{ borderRight: `1.5px solid ${ink}`, background: "#f7f6f2", padding: 14 }}>
          <SectionLabel>Steps</SectionLabel>
          <StepRail active={1} steps={["Organization", "AI co-pilot", "Review", "Finish"]} />
        </div>
        {/* content */}
        <div style={{ padding: 18, overflow: "hidden", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ font: "700 18px/1.1 'Kalam', cursive" }}>AI co-pilot</div>
            <div style={{ font: "15px/1.3 'Caveat', cursive", color: ink2 }}>Describe your org — the co-pilot drafts roles, units & KPIs.</div>
          </div>
          <Field label="Organization name" value="Acme Inc" />
          <SectionLabel>Review · draft depth</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 9 }}>
            {[["Roles","10"],["Positions","14"],["Units","11"],["Categories","5"],["KPIs","20"]].map(([l, v], i) => (
              <Sketch key={i} style={{ padding: 11, textAlign: "center" }}>
                <div style={{ font: "700 22px/1 'Kalam', cursive", fontVariantNumeric: "tabular-nums", color: ink }}>{v}</div>
                <div style={{ font: "12px 'Caveat', cursive", color: ink2, marginTop: 3 }}>{l}</div>
              </Sketch>
            ))}
          </div>
        </div>
        {/* AI rail */}
        <div style={{ borderLeft: `1.5px solid ${ink}`, background: "#f7f6f2", padding: 14, display: "flex", flexDirection: "column", gap: 11, minHeight: 0 }}>
          <SectionLabel style={{ marginBottom: 0 }}>AI co-pilot</SectionLabel>
          <Textarea label="Prompt" h={64} lines={2} />
          <Btn accent full>Generate</Btn>
          <Sketch style={{ padding: 11, display: "flex", flexDirection: "column", gap: 8, borderLeft: `3px solid ${acc}`, flex: 1 }}>
            <div style={{ font: "700 12px/1 'Kalam', cursive", color: ink }}>Proposed changes (diff)</div>
            {["+ 10 roles", "+ 11 org units", "+ 20 KPIs", "+ 5 categories"].map((t, i) => (
              <div key={i} style={{ font: "12px 'JetBrains Mono', monospace", color: "#2f7d4f" }}>{t}</div>
            ))}
            <div style={{ flex: 1 }} />
            <Btn sm accent full>Apply all</Btn>
          </Sketch>
        </div>
      </div>
      {/* footer */}
      <div style={{ height: 52, flex: "none", borderTop: `1.5px solid ${ink}`, display: "flex", alignItems: "center", padding: "0 18px", gap: 10 }}>
        <Btn sm>Back</Btn><div style={{ flex: 1 }} />
        <span style={{ font: "13px 'Caveat', cursive", color: ink2 }}>Finish: admin name · email · password · slug →</span>
        <Btn accent>Finish setup</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { AuthLogin, AuthRegister, AuthInvite, SignupSplash, SignupWizard });
