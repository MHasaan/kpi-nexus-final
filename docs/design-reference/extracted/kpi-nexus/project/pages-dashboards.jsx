/* pages-dashboards.jsx — 05 dashboards. Exports: DashboardsList, DashboardNew,
   DashboardBuilder, DashboardShare, DashboardSnapshots, WidgetDrilldown */

function MiniWidgetPreview() {
  const acc = useCtxAccent();
  return (
    <div style={{ height: 90, background: "#f3f2ee", borderRadius: 8, border: `1.25px solid ${muted}`, padding: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
      <div style={{ background: paper, border: `1px solid ${muted}`, borderRadius: 5, padding: 5 }}><div style={{ font: "700 13px 'Kalam',cursive" }}>1.2M</div><Spark w={50} h={14} trend="up" /></div>
      <div style={{ background: paper, border: `1px solid ${muted}`, borderRadius: 5, display: "flex", alignItems: "flex-end", gap: 3, padding: 5 }}>{[12, 20, 14, 24, 18].map((b, i) => <div key={i} style={{ flex: 1, height: b, background: acc, borderRadius: 2 }} />)}</div>
    </div>
  );
}
function DashboardsList() {
  const dbs = [["Revenue overview", "Sara K.", true, 8], ["Sales pipeline", "Marcus L.", false, 6], ["Support health", "Priya N.", true, 5], ["Exec board pack", "Sara K.", false, 12], ["Product north star", "Dana W.", false, 4], ["Ops daily", "Team", true, 9]];
  return (
    <AppShell active="Dashboards" crumb="Dashboards">
      <PageHead title="Dashboards" badge={<Pill>6</Pill>} sub="Composable widget boards bound to your KPIs"
        actions={<Btn accent sm>＋ New dashboard</Btn>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {dbs.map(([n, o, shared, wc], i) => (
          <Sketch key={i} style={{ padding: 13, display: "flex", flexDirection: "column", gap: 10 }}>
            <MiniWidgetPreview />
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ font: "700 14px/1.1 'Kalam',cursive", flex: 1 }}>{n}</div>
              {shared && <Pill accentOn>shared</Pill>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, font: "12px 'Caveat',cursive", color: ink2 }}>
              <Avatar size={18} /><span>{o}</span><span>·</span><span>{wc} widgets</span><span>·</span><span>2d ago</span>
            </div>
          </Sketch>
        ))}
      </div>
    </AppShell>
  );
}

function DashboardNew() {
  return (
    <AppShell active="Dashboards" crumb={["Dashboards", "New"]}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <PageHead title="Create dashboard" sub="Minimal to start — you'll drop into edit mode next." />
        <MiniCard>
          <Field label="Name" ph="60%" />
          <div style={{ height: 12 }} />
          <Textarea label="Description" h={70} lines={2} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
            <span style={{ width: 34, height: 18, borderRadius: 999, background: useCtxAccent(), position: "relative" }}><span style={{ position: "absolute", right: 2, top: 2, width: 14, height: 14, borderRadius: 999, background: "#fff" }} /></span>
            <span style={{ font: "13px 'Kalam',cursive" }}>Shared with organization</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}><Btn sm>Cancel</Btn><Btn accent sm>Create & edit</Btn></div>
        </MiniCard>
      </div>
    </AppShell>
  );
}

function Widget({ title, kind, span = 1, edit }) {
  const acc = useCtxAccent();
  return (
    <Sketch style={{ padding: 12, gridColumn: `span ${span}`, position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
      {edit && <div style={{ position: "absolute", top: 6, right: 8, display: "flex", gap: 6 }}><span style={{ font: "13px", color: muted }}>⋮⋮</span></div>}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ font: "600 12px 'Kalam',cursive", color: ink2, flex: 1 }}>{title}</div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, font: "10px 'Kalam',cursive", color: "#2f7d4f" }}><span style={{ width: 6, height: 6, borderRadius: 999, background: "#2f7d4f" }} /> live</span>
      </div>
      {kind === "number" && <><div style={{ font: "700 28px/1 'Kalam',cursive", fontVariantNumeric: "tabular-nums" }}>$1.24M</div><Delta dir="up">+12.4%</Delta></>}
      {kind === "line" && <Spark w={240} h={56} trend="up" />}
      {kind === "bar" && <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 64 }}>{[28, 44, 36, 56, 40, 60, 50].map((b, i) => <div key={i} style={{ flex: 1, height: b, background: acc, borderRadius: "3px 3px 0 0", border: `1px solid ${ink}` }} />)}</div>}
      {kind === "pie" && <div style={{ display: "flex", justifyContent: "center", padding: 4 }}><div style={{ width: 64, height: 64, borderRadius: 999, border: `1.5px solid ${ink}`, background: `conic-gradient(${acc} 0 62%, ${muted2} 0 100%)` }} /></div>}
      {kind === "trend" && <><div style={{ font: "700 22px/1 'Kalam',cursive" }}>112%</div><Spark w={200} h={40} trend="up" /></>}
    </Sketch>
  );
}
function DashboardBuilder() {
  return (
    <AppShell active="Dashboards" crumb={["Dashboards", "Revenue overview"]} pad={0}>
      <div style={{ padding: "14px 20px", borderBottom: `1.5px solid ${ink}`, background: paper, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ font: "700 18px/1 'Kalam',cursive" }}>Revenue overview</div>
        <Pill accentOn>Edit mode</Pill>
        <div style={{ flex: 1 }} />
        <Seg items={["7D", "30D", "QTD", "Custom"]} active={1} />
        <Btn sm>＋ Add widget</Btn><Btn sm>Snapshot</Btn><Btn sm>Share</Btn><Btn sm>Print</Btn>
      </div>
      <div style={{ padding: 18, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
          <Widget title="MRR" kind="number" edit /><Widget title="NRR" kind="trend" edit />
          <Widget title="Revenue by month" kind="bar" span={2} edit />
          <Widget title="MRR trend" kind="line" span={2} edit />
          <Widget title="Revenue mix" kind="pie" edit />
          <Sketch style={{ padding: 12, borderStyle: "dashed", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 110, color: ink2 }}>
            <Glyph name="plus" size={22} color={ink2} /><span style={{ font: "13px 'Caveat',cursive" }}>Add widget</span>
          </Sketch>
        </div>
        <div style={{ font: "13px 'Caveat',cursive", color: ink2, marginTop: 12 }}>↳ Drag handles (⋮⋮) appear only in Edit mode · controls sit in a .widget-no-drag zone · layout saves with optimistic concurrency.</div>
      </div>
    </AppShell>
  );
}

function DashboardShare() {
  return (
    <AppShell active="Dashboards" crumb={["Dashboards", "Revenue overview", "Share"]}>
      <PageHead title="Share links" badge={<Pill>public</Pill>} sub="Anyone with the link can view — optional password & expiry" />
      <Banner kind="warning">Share links are public. Add a password and expiry for sensitive boards.</Banner>
      <div style={{ height: 14 }} />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
        <MiniCard title="Create link">
          <Field label="Password (optional)" ph="50%" />
          <div style={{ height: 10 }} /><Select label="Expires" value="In 30 days" />
          <div style={{ marginTop: 12 }}><Btn accent sm full>Create share link</Btn></div>
        </MiniCard>
        <div>
          <SectionLabel>Existing links</SectionLabel>
          <Table cols={[{ label: "URL", w: "2fr" }, { label: "Protections", w: "1.3fr" }, { label: "", w: "0.8fr", align: "right" }]}
            rows={[
              [<span style={{ font: "11px 'JetBrains Mono',monospace", color: ink2 }}>/share/9fX2···aQ</span>, <span style={{ display: "inline-flex", gap: 5 }}><Pill style={{ fontSize: 9 }}>🔒 password</Pill><Pill style={{ fontSize: 9 }}>exp 30d</Pill></span>, <Btn sm>Revoke</Btn>],
              [<span style={{ font: "11px 'JetBrains Mono',monospace", color: ink2 }}>/share/Lm7K···zP</span>, <Pill style={{ fontSize: 9 }}>no expiry</Pill>, <Btn sm>Revoke</Btn>],
            ]} />
        </div>
      </div>
    </AppShell>
  );
}

function DashboardSnapshots() {
  return (
    <AppShell active="Dashboards" crumb={["Dashboards", "Revenue overview", "Snapshots"]}>
      <PageHead title="Snapshots" sub="Immutable point-in-time captures of this board's data" />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
        <MiniCard title="Capture now">
          <Field label="Label" ph="55%" />
          <div style={{ marginTop: 12 }}><Btn accent sm full>📸 Capture snapshot</Btn></div>
        </MiniCard>
        <div>
          <SectionLabel>Past snapshots</SectionLabel>
          <Table cols={[{ label: "Label", w: "2fr" }, { label: "Captured", w: "1.4fr" }, { label: "", w: "0.7fr", align: "right" }]}
            rows={[["Q2 close", "May 31 · by Sara"], ["Board prep", "May 24 · by Sara"], ["Month-end Apr", "Apr 30 · by Marcus"]].map(([l, c]) => [
              <b style={{ fontWeight: 600 }}>{l}</b>, <span style={{ color: ink2 }}>{c}</span>, <Btn sm>Open</Btn>,
            ])} />
        </div>
      </div>
    </AppShell>
  );
}

function WidgetDrilldown() {
  return (
    <AppShell active="Dashboards" crumb={["Dashboards", "Revenue overview", "MRR widget"]} pad={0}>
      <div style={{ padding: "14px 20px", borderBottom: `1.5px solid ${ink}`, background: paper, display: "flex", alignItems: "center", gap: 10 }}>
        <Btn sm>← Back to dashboard</Btn>
        <div style={{ font: "700 18px/1 'Kalam',cursive" }}>Monthly recurring revenue</div>
        <div style={{ flex: 1 }} /><Seg items={["30D", "QTD", "1Y"]} active={1} /><Btn sm>Open KPI →</Btn>
      </div>
      <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 260px", gap: 16, overflow: "hidden" }}>
        <MiniCard title="Full chart"><BigChartDD /></MiniCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MiniCard title="Data quality" icon="activity"><KV k="Completeness" v="98.6%" /><KV k="Last point" v="2h ago" /><div style={{ marginTop: 6 }}><span style={{ font: "600 12px 'Kalam',cursive", color: "#2f7d4f" }}>✓ Healthy</span></div></MiniCard>
          <MiniCard title="Underlying data">{[0, 1, 2, 3].map(i => <KV key={i} k={`May ${28 - i}`} v={`$1.2${4 - i}M`} mono />)}</MiniCard>
        </div>
      </div>
    </AppShell>
  );
}
function BigChartDD() {
  const acc = useCtxAccent(); const w = 560, h = 180;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: "block" }}>
      {[45, 90, 135].map(y => <line key={y} x1="0" y1={y} x2={w} y2={y} stroke={muted2} strokeWidth="1" />)}
      <path d="M0 140 L70 124 L140 130 L210 96 L280 104 L350 70 L420 78 L490 44 L560 30" fill="none" stroke={acc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

Object.assign(window, { DashboardsList, DashboardNew, DashboardBuilder, DashboardShare, DashboardSnapshots, WidgetDrilldown });
