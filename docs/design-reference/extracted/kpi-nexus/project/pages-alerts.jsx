/* pages-alerts.jsx — 06 alerts. Exports: AlertsInbox, AlertRuleBuilder, AlertDetail, AlertChannels */

function Sev({ level }) {
  const map = { HIGH: ["#b4502f", "bell"], MEDIUM: ["#7a5b12", "bell"], LOW: ["#555049", "activity"] };
  const [c, ic] = map[level];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "600 11px/1 'Kalam',cursive", color: c, border: `1.25px solid ${c}`, borderRadius: 999, padding: "2px 8px" }}><Glyph name={ic} size={11} />{level}</span>;
}
function StatusChip({ s }) {
  const c = s === "Open" ? "#b4502f" : s === "Acknowledged" ? "#7a5b12" : "#2f7d4f";
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "600 12px/1 'Kalam',cursive", color: c }}><span style={{ width: 7, height: 7, borderRadius: 999, background: c }} />{s}</span>;
}
function AlertsInbox() {
  const rows = [
    ["HIGH", "Churn rate", "Breached 3% critical threshold (Enterprise)", "Open", "12m ago"],
    ["MEDIUM", "MRR", "Growth decelerated 2 periods running", "Open", "1h ago"],
    ["HIGH", "Uptime", "Below 99.9% SLA for 20 min", "Acknowledged", "3h ago"],
    ["LOW", "CSAT", "Dipped below 4.5 (single day)", "Resolved", "1d ago"],
    ["MEDIUM", "Lead conversion", "Anomaly detected (+3.4σ)", "Resolved", "2d ago"],
  ];
  return (
    <AppShell active="Alerts" crumb="Alerts">
      <PageHead title="Alerts" badge={<Pill>2 open</Pill>} sub="Triage triggered alerts · acknowledge & resolve"
        actions={<Btn accent sm>＋ New rule</Btn>} />
      <Toolbar left={<><Seg items={["All", "Open", "Acknowledged", "Resolved"]} active={1} /><Select value="Severity: All" w={150} /></>} right={<Btn sm>Bulk acknowledge</Btn>} />
      <Table cols={[{ label: "Severity", w: "0.9fr" }, { label: "KPI", w: "1fr" }, { label: "Message", w: "2.2fr" }, { label: "Status", w: "1fr" }, { label: "Triggered", w: "0.9fr" }]}
        rows={rows.map(([sv, k, m, st, t]) => [<Sev level={sv} />, <b style={{ fontWeight: 600 }}>{k}</b>, <span style={{ color: ink2 }}>{m}</span>, <StatusChip s={st} />, <span style={{ color: ink2 }}>{t}</span>])} />
    </AppShell>
  );
}

function AlertRuleBuilder() {
  return (
    <AppShell active="Alerts" crumb={["Alerts", "New rule"]}>
      <PageHead title="New alert rule" sub="Define the condition, severity & escalation policy" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MiniCard title="Condition">
            <Field label="Rule name" ph="55%" />
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}><Select label="Type" value="Threshold" w="50%" /><Select label="KPI" value="Churn rate" w="50%" /></div>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}><Select label="Operator" value="≥" w="33%" /><Field label="Threshold" value="3.0%" w="33%" /><Select label="Severity" value="HIGH" w="33%" /></div>
            <div style={{ font: "13px 'Caveat',cursive", color: ink2, marginTop: 8 }}>↳ Operator & threshold appear for threshold-type rules; anomaly type swaps in method/sensitivity.</div>
          </MiniCard>
          <MiniCard title="Escalation policy">
            {[["Level 1", "immediately", "Slack #alerts"], ["Level 2", "after 15 min", "Email · on-call"], ["Level 3", "after 1 hr", "SMS · manager"]].map(([l, d, ch], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i ? `1px dashed ${muted2}` : "none" }}>
                <div style={{ width: 22, height: 22, borderRadius: 999, border: `1.5px solid ${ink}`, display: "flex", alignItems: "center", justifyContent: "center", font: "700 11px 'Kalam',cursive", flex: "none" }}>{i + 1}</div>
                <div style={{ flex: 1 }}><div style={{ font: "600 12.5px 'Kalam',cursive" }}>{l} · {d}</div><div style={{ font: "13px 'Caveat',cursive", color: ink2 }}>{ch}</div></div>
                <Glyph name="gear" size={14} color={ink2} />
              </div>
            ))}
            <div style={{ marginTop: 10 }}><Btn sm>＋ Add level</Btn></div>
          </MiniCard>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Banner kind="info">Preview: fires when churn ≥ 3.0% → Slack now, email in 15m, SMS in 1h.</Banner>
          <Btn accent full>Create rule</Btn>
        </div>
      </div>
    </AppShell>
  );
}

function AlertDetail() {
  return (
    <AppShell active="Alerts" crumb={["Alerts", "Churn rate breach"]} pad={0}>
      <div style={{ padding: "16px 20px", borderBottom: `1.5px solid ${ink}`, background: paper, display: "flex", alignItems: "center", gap: 10 }}>
        <Sev level="HIGH" />
        <div style={{ font: "700 18px/1.1 'Kalam',cursive" }}>Churn rate breached critical threshold</div>
        <StatusChip s="Open" />
        <div style={{ flex: 1 }} /><Btn sm>💬 Comments</Btn><Btn sm>Acknowledge</Btn><Btn accent sm>Resolve</Btn>
      </div>
      <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MiniCard title="Trigger">
            <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
              <div><div style={{ font: "13px 'Caveat',cursive", color: ink2 }}>Value</div><div style={{ font: "700 24px/1 'Kalam',cursive", color: "#b4502f" }}>3.4%</div></div>
              <div><div style={{ font: "13px 'Caveat',cursive", color: ink2 }}>Threshold</div><div style={{ font: "600 20px/1 'Kalam',cursive", color: ink2 }}>3.0%</div></div>
            </div>
            <AnomChartLite />
          </MiniCard>
        </div>
        <MiniCard title="Escalation trail" icon="activity">
          {[["Level 1 · Slack", "delivered · 12m ago", true], ["Level 2 · Email", "delivered · pending ack", true], ["Level 3 · SMS", "scheduled in 48m", false]].map(([l, s, done], i) => (
            <div key={i} style={{ display: "flex", gap: 9, padding: "8px 0", borderTop: i ? `1px dashed ${muted2}` : "none" }}>
              <div style={{ width: 14, height: 14, borderRadius: 999, flex: "none", marginTop: 2, background: done ? "#2f7d4f" : paper, border: `1.5px solid ${done ? "#2f7d4f" : muted}` }} />
              <div><div style={{ font: "600 12.5px 'Kalam',cursive" }}>{l}</div><div style={{ font: "13px 'Caveat',cursive", color: ink2 }}>{s}</div></div>
            </div>
          ))}
        </MiniCard>
      </div>
    </AppShell>
  );
}
function AnomChartLite() {
  const w = 540, h = 120;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: "block" }}>
      <line x1="0" y1="70" x2={w} y2="70" stroke={ink} strokeWidth="1.5" strokeDasharray="5 4" />
      <path d="M0 88 L90 84 L180 80 L270 76 L360 64 L450 40 L540 24" fill="none" stroke="#b4502f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="450" cy="40" r="5" fill={paper} stroke="#b4502f" strokeWidth="2.5" />
    </svg>
  );
}

function AlertChannels() {
  return (
    <AppShell active="Alerts" crumb={["Alerts", "Channels"]}>
      <PageHead title="Notification channels" sub="Where alerts get delivered — fields adapt to channel kind" />
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        <MiniCard title="New channel">
          <Field label="Name" ph="55%" />
          <div style={{ height: 10 }} /><Select label="Kind" value="Slack" />
          <div style={{ height: 10 }} /><Field label="Webhook URL" value="hooks.slack.com/…" mono />
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}><Btn sm>Send test</Btn><Btn accent sm>Create</Btn></div>
          <div style={{ font: "13px 'Caveat',cursive", color: ink2, marginTop: 8 }}>↳ Email shows recipients · SMS shows from-number · webhook shows URL.</div>
        </MiniCard>
        <div>
          <SectionLabel>Channels</SectionLabel>
          <Table cols={[{ label: "Channel", w: "1.5fr" }, { label: "Kind", w: "0.9fr" }, { label: "Last delivery", w: "1.2fr" }, { label: "", w: "1.2fr", align: "right" }]}
            rows={[["#alerts", "Slack", "✓ 12m ago"], ["On-call email", "Email", "✓ 1h ago"], ["Ops webhook", "Webhook", "⚠ failed 3h ago"]].map(([n, k, d]) => [
              <b style={{ fontWeight: 600 }}>{n}</b>, <Pill style={{ fontSize: 9 }}>{k}</Pill>, <span style={{ color: d.startsWith("⚠") ? "#b4502f" : ink2 }}>{d}</span>,
              <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}><Btn sm>Test</Btn><Btn sm>Disable</Btn></span>,
            ])} />
        </div>
      </div>
    </AppShell>
  );
}

Object.assign(window, { AlertsInbox, AlertRuleBuilder, AlertDetail, AlertChannels });
