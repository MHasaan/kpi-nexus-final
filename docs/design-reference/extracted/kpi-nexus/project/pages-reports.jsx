/* pages-reports.jsx — 10 reports. Exports: ReportsList, ReportNew, ReportDetail, BoardPack */

function ReportsList() {
  const rows = [["Weekly revenue", "PDF", "Every Mon 8:00", "✓ ok", "4"], ["Monthly board pack", "PDF", "1st of month", "✓ ok", "9"], ["Sales export", "XLSX", "Every day 6:00", "⚠ failed", "2"], ["KPI snapshot", "CSV", "On demand", "— never", "1"]];
  return (
    <AppShell active="Reports" crumb="Reports">
      <PageHead title="Reports" sub="Scheduled & on-demand · run as their creator (visibility applies)"
        actions={<Btn accent sm>＋ New report</Btn>} />
      <Table cols={[{ label: "Report", w: "1.8fr" }, { label: "Format", w: "0.8fr" }, { label: "Schedule", w: "1.3fr" }, { label: "Last run", w: "1fr" }, { label: "Recipients", w: "1fr" }]}
        rows={rows.map(([n, f, s, st, r]) => [
          <b style={{ fontWeight: 600 }}>{n}</b>, <Pill style={{ fontSize: 9 }}>{f}</Pill>,
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: ink2 }}><Glyph name="calendar" size={12} />{s}</span>,
          <span style={{ color: st.startsWith("⚠") ? "#b4502f" : ink2 }}>{st}</span>, <span style={{ color: ink2 }}>{r} people</span>,
        ])} />
    </AppShell>
  );
}

function ReportNew() {
  return (
    <AppShell active="Reports" crumb={["Reports", "New"]}>
      <PageHead title="Create report" sub="Source · format · schedule · recipients" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MiniCard title="Definition">
            <Field label="Name" ph="55%" /><div style={{ height: 10 }} /><Textarea label="Description" h={56} lines={2} />
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}><Select label="Format" value="PDF" w="33%" /><Select label="Source dashboard" value="Revenue overview" w="67%" /></div>
          </MiniCard>
          <MiniCard title="Schedule">
            <Seg items={["Daily", "Weekly", "Monthly", "Custom cron"]} active={1} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <Field value="0 8 * * 1" mono w={140} />
              <span style={{ font: "13px 'Caveat',cursive", color: ink2 }}>= Every Mon 8:00 · next: Jun 2, 8:00</span>
            </div>
          </MiniCard>
        </div>
        <MiniCard title="Recipients">
          {["sara@acme.co", "board@acme.co"].map((r, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 0" }}><Avatar size={20} /><span style={{ font: "12px 'JetBrains Mono',monospace", color: ink2, flex: 1 }}>{r}</span><Glyph name="plus" size={13} color={muted} style={{ transform: "rotate(45deg)" }} /></div>)}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}><Field ph="55%" /><Btn sm>＋</Btn></div>
          <div style={{ marginTop: 14 }}><Btn accent sm full>Create report</Btn></div>
        </MiniCard>
      </div>
    </AppShell>
  );
}

function ReportDetail() {
  const runs = [["May 27, 8:00", "done", "→ 4 recipients"], ["May 20, 8:00", "done", "→ 4 recipients"], ["May 13, 8:00", "failed", "render timeout"], ["May 6, 8:00", "done", "→ 4 recipients"]];
  return (
    <AppShell active="Reports" crumb={["Reports", "Weekly revenue"]}>
      <PageHead title="Weekly revenue" badge={<Pill style={{ fontSize: 9 }}>PDF</Pill>} sub="Every Mon 8:00 · 4 recipients"
        actions={<><Btn sm>Refresh</Btn><Btn accent sm>Trigger now</Btn></>} />
      <SectionLabel>Run history</SectionLabel>
      <Table cols={[{ label: "Run", w: "1.4fr" }, { label: "Status", w: "1fr" }, { label: "Delivery", w: "1.4fr" }, { label: "", w: "0.8fr", align: "right" }]}
        rows={runs.map(([t, st, d]) => [
          <span style={{ color: ink2 }}>{t}</span>,
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "600 12px 'Kalam',cursive", color: st === "failed" ? "#b4502f" : "#2f7d4f" }}><Glyph name={st === "failed" ? "bell" : "check"} size={12} />{st}</span>,
          <span style={{ color: ink2 }}>{d}</span>,
          st === "failed" ? <Btn sm>Retry</Btn> : <Btn sm>Download</Btn>,
        ])} />
    </AppShell>
  );
}

function BoardPack() {
  const quads = [["Financial", [["MRR", "$1.24M", "up", "+12.4%"], ["Gross margin", "68.2%", "down", "−0.2%"]]], ["Customer", [["NPS", "47", "up", "+4"], ["Churn", "2.3%", "down", "+0.3%"]]], ["Internal", [["Uptime", "99.9%", "flat", "±0"], ["Cycle time", "18d", "up", "−2d"]]], ["Learning", [["eNPS", "38", "up", "+6"], ["Retention", "94%", "flat", "±0"]]]];
  return (
    <AppShell active="Reports" crumb={["Reports", "Board pack"]}>
      <PageHead title="Executive board pack" sub="One-screen summary · print-optimized for the monthly PDF"
        actions={<Btn sm>Print / export PDF</Btn>} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {quads.map(([t, kpis], i) => (
          <Sketch key={i} style={{ padding: 14 }}>
            <div style={{ font: "700 13px 'Kalam',cursive", color: ink, marginBottom: 9, borderBottom: `1.5px dashed ${muted}`, paddingBottom: 7 }}>{t}</div>
            {kpis.map(([n, v, d, dl], j) => (
              <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                <span style={{ font: "13px 'Kalam',cursive", flex: 1, color: ink2 }}>{n}</span>
                <span style={{ font: "700 14px 'Kalam',cursive", fontVariantNumeric: "tabular-nums" }}>{v}</span>
                <span style={{ width: 70, textAlign: "right" }}><Delta dir={d === "down" ? "down" : "up"}>{dl}</Delta></span>
              </div>
            ))}
          </Sketch>
        ))}
      </div>
      <SectionLabel>Top movers this period</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <MiniCard title="▲ Gainers">
          {[["Expansion MRR", "+18%"], ["eNPS", "+6"], ["Pipeline coverage", "+0.4x"]].map(([n, d], i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}><span style={{ font: "13px 'Kalam',cursive" }}>{n}</span><Delta dir="up">{d}</Delta></div>)}
        </MiniCard>
        <MiniCard title="▼ Decliners">
          {[["Enterprise churn", "+0.4pt"], ["Gross margin", "−0.2pt"], ["CSAT", "−0.1"]].map(([n, d], i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}><span style={{ font: "13px 'Kalam',cursive" }}>{n}</span><Delta dir="down">{d}</Delta></div>)}
        </MiniCard>
      </div>
    </AppShell>
  );
}

Object.assign(window, { ReportsList, ReportNew, ReportDetail, BoardPack });
