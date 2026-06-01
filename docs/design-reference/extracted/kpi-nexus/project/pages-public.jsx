/* pages-public.jsx — 02 marketing + 13 public/embeds (no app shell, no auth).
   Exports: MarketingLanding, ShareViewerLocked, ShareViewer, KpiEmbed */

function Brandmark({ size = 28, light }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{ width: size, height: size, borderRadius: size * 0.26, background: useCtxAccent(), display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <Glyph name="activity" size={size * 0.6} color="#fff" />
      </div>
      <span style={{ font: `800 ${size * 0.62}px/1 'Kalam', cursive`, color: light ? "#fff" : ink }}>KPI Nexus</span>
    </div>
  );
}

function MarketingLanding() {
  const acc = useCtxAccent();
  return (
    <div style={{ height: "100%", overflow: "hidden", background: paper, font: "'Kalam', cursive", color: ink, display: "flex", flexDirection: "column" }}>
      <div style={{ height: 56, flex: "none", display: "flex", alignItems: "center", padding: "0 28px", borderBottom: `1.5px solid ${muted}` }}>
        <Brandmark />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 22, font: "500 13px 'Kalam',cursive", color: ink2 }}><span>Product</span><span>Pricing</span><span>Docs</span></div>
        <div style={{ flex: 1 }} />
        <Btn sm>Sign in</Btn><div style={{ width: 8 }} /><Btn accent sm>Create organization</Btn>
      </div>
      {/* hero with faint dotted grid + soft wash */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "40px 28px",
        backgroundImage: `radial-gradient(${muted2} 1px, transparent 1px)`, backgroundSize: "18px 18px" }}>
        <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)", width: 600, height: 300, background: useCtxAccentBg(), filter: "blur(60px)", opacity: .7 }} />
        <div style={{ position: "relative", maxWidth: 640, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <Pill accentOn>Analytics workspace · keyboard-first</Pill>
          <div style={{ font: "800 38px/1.1 'Kalam', cursive", color: ink, letterSpacing: "-0.5px" }}>Measure what matters.</div>
          <div style={{ font: "20px/1.4 'Caveat', cursive", color: ink2, maxWidth: 460 }}>Define KPIs, track performance, and act on it — a calm, data-dense home for operators and analysts.</div>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}><Btn accent>Create organization</Btn><Btn>Sign in</Btn></div>
        </div>
        {/* product screenshot placeholder */}
        <div style={{ position: "relative", marginTop: 30, width: 620, maxWidth: "100%" }}>
          <Sketch style={{ padding: 10, boxShadow: "0 16px 50px rgba(40,38,34,0.16)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              {[0,1,2,3].map(i => <div key={i} style={{ background: "#f3f2ee", border: `1px solid ${muted}`, borderRadius: 6, padding: 8 }}><Bar w="60%" h={6} /><div style={{ height: 6 }} /><div style={{ font: "700 15px 'Kalam',cursive" }}>{["1.2M", "112%", "47", "2.3%"][i]}</div><Spark w={56} h={16} trend="up" /></div>)}
            </div>
            <div style={{ marginTop: 8, background: "#f3f2ee", border: `1px solid ${muted}`, borderRadius: 6, padding: 10 }}><Spark w={580} h={44} trend="up" /></div>
          </Sketch>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8, pointerEvents: "none" }}>
            <span style={{ font: "13px 'Caveat',cursive", color: ink2, background: paper, padding: "2px 8px", borderRadius: 6, border: `1px solid ${muted}` }}>↳ image-slot: real product screenshot</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShareViewerLocked() {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#efece4", font: "'Kalam',cursive", padding: 24 }}>
      <div style={{ width: 360, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "center" }}><Brandmark size={24} /></div>
        <Sketch style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14, textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, border: `1.5px solid ${ink}`, background: muted2, display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "center" }}><span style={{ fontSize: 20 }}>🔒</span></div>
          <div><div style={{ font: "700 16px 'Kalam',cursive" }}>This dashboard is protected</div><div style={{ font: "14px/1.3 'Caveat',cursive", color: ink2 }}>Enter the password to view it.</div></div>
          <Field ph="60%" />
          <Btn accent full>View dashboard</Btn>
        </Sketch>
        <div style={{ textAlign: "center", font: "13px 'Caveat',cursive", color: ink2 }}>Powered by KPI Nexus</div>
      </div>
    </div>
  );
}

function ShareViewer() {
  return (
    <div style={{ height: "100%", overflow: "hidden", background: paper, font: "'Kalam',cursive", color: ink, display: "flex", flexDirection: "column" }}>
      <div style={{ height: 50, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 22px", borderBottom: `1.5px solid ${muted}` }}>
        <Brandmark size={22} />
        <Pill>Shared · read-only</Pill>
        <div style={{ flex: 1 }} />
        <span style={{ font: "13px 'Caveat',cursive", color: ink2 }}>Revenue overview · Acme Inc · as captured May 31</span>
      </div>
      <div style={{ flex: 1, overflow: "hidden", padding: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          <Widget title="MRR" kind="number" /><Widget title="NRR" kind="trend" />
          <Widget title="Revenue by month" kind="bar" span={2} />
          <Widget title="MRR trend" kind="line" span={2} />
          <Widget title="Revenue mix" kind="pie" />
          <Widget title="Churn" kind="number" />
        </div>
      </div>
      <div style={{ height: 38, flex: "none", borderTop: `1.5px solid ${muted}`, display: "flex", alignItems: "center", justifyContent: "center", font: "13px 'Caveat',cursive", color: ink2 }}>Powered by KPI Nexus · no account needed</div>
    </div>
  );
}

function KpiEmbed() {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#efece4", padding: 24, font: "'Kalam',cursive" }}>
      <Sketch style={{ width: 320, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Glyph name="target" size={14} color={ink2} />
          <div style={{ font: "600 13px 'Kalam',cursive", color: ink2, flex: 1 }}>Monthly recurring revenue</div>
          <Pill style={{ fontSize: 9 }}>ORG_WIDE</Pill>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          <div style={{ font: "700 30px/1 'Kalam',cursive", fontVariantNumeric: "tabular-nums" }}>$1.24M</div>
          <Delta dir="up">+12.4%</Delta>
        </div>
        <Spark w={288} h={48} trend="up" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `1.25px dashed ${muted}`, paddingTop: 8 }}>
          <span style={{ font: "12px 'Caveat',cursive", color: ink2 }}>target $1.30M · on track</span>
          <span style={{ font: "10px 'Caveat',cursive", color: muted }}>KPI Nexus</span>
        </div>
      </Sketch>
    </div>
  );
}

Object.assign(window, { MarketingLanding, ShareViewerLocked, ShareViewer, KpiEmbed });
