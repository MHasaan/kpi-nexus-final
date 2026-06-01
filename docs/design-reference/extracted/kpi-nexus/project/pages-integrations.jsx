/* pages-integrations.jsx — 11 integrations. Exports: IntegrationsMarket, ConnectorsPage, ConnectorDetail, PluginsPage */

function IntegrationsMarket() {
  const provs = [["Slack", "Send alerts & acknowledge from channels", true, "12m ago"], ["Microsoft Teams", "Post alerts to Teams channels", false, null], ["Jira", "Create issues from tasks & recs", true, "1h ago"], ["Salesforce", "Sync pipeline KPIs", false, null], ["Google Sheets", "Pull metrics from sheets", false, null], ["PagerDuty", "Escalate critical alerts", false, null]];
  return (
    <AppShell active="Integrations" crumb="Integrations">
      <PageHead title="Integrations" sub="Connect third-party providers · tokens encrypted, never shown" />
      <SubNav items={["Marketplace", "Connectors", "Plugins"]} active="Marketplace" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {provs.map(([n, blurb, conn, sync], i) => (
          <Sketch key={i} style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, border: `1.5px solid ${ink}`, background: muted2, flex: "none" }} />
              <div style={{ flex: 1 }}><div style={{ font: "700 14px/1.1 'Kalam',cursive" }}>{n}</div></div>
              {conn && <Pill accentOn style={{ fontSize: 9 }}>✓ connected</Pill>}
            </div>
            <div style={{ font: "14px/1.3 'Caveat',cursive", color: ink2, minHeight: 34 }}>{blurb}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {conn ? <><Btn sm>Manage</Btn><Btn sm>Disconnect</Btn><span style={{ font: "11px 'Caveat',cursive", color: ink2, marginLeft: "auto" }}>synced {sync}</span></> : <Btn accent sm>Connect</Btn>}
            </div>
          </Sketch>
        ))}
      </div>
    </AppShell>
  );
}

function ConnectorsPage() {
  const rows = [["Stripe MRR", "REST", "Every 6h", "✓ success", "$.data.mrr"], ["GA sessions", "REST", "Daily", "⚠ partial", "$.rows[0].metric"], ["Warehouse churn", "GraphQL", "Daily", "✓ success", "data.churn.rate"]];
  return (
    <AppShell active="Integrations" crumb={["Integrations", "Connectors"]}>
      <PageHead title="Data connectors" sub="Pull external data into a KPI on a schedule or on demand" />
      <SubNav items={["Marketplace", "Connectors", "Plugins"]} active="Connectors" />
      <Banner kind="info">Create form is a stand-in for the planned 5-step wizard: source → schema map (JSON-path → KPI) → schedule → test/preview rows → save.</Banner>
      <div style={{ height: 12 }} />
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        <MiniCard title="New connector">
          <Field label="Name" ph="55%" />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}><Select label="Type" value="REST" w="45%" /><Field label="Cron" value="0 */6 * * *" mono w="55%" /></div>
          <div style={{ height: 10 }} /><Field label="URL" value="api.stripe.com/v1/…" mono />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}><Field label="Value JSON path" value="$.data.mrr" mono w="55%" /><Select label="KPI" value="MRR" w="45%" /></div>
          <div style={{ marginTop: 12 }}><Btn accent sm full>Create connector</Btn></div>
        </MiniCard>
        <div>
          <SectionLabel>Connectors</SectionLabel>
          <Table cols={[{ label: "Name", w: "1.3fr" }, { label: "Type", w: "0.7fr" }, { label: "Schedule", w: "0.9fr" }, { label: "Last run", w: "1fr" }, { label: "", w: "1.1fr", align: "right" }]}
            rows={rows.map(([n, t, s, st]) => [
              <b style={{ fontWeight: 600 }}>{n}</b>, <Pill style={{ fontSize: 9 }}>{t}</Pill>, <span style={{ color: ink2 }}>{s}</span>,
              <span style={{ color: st.startsWith("⚠") ? "#b4502f" : "#2f7d4f", font: "600 12px 'Kalam',cursive" }}>{st}</span>,
              <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}><Btn sm>Run now</Btn><Btn sm>Open</Btn></span>,
            ])} />
        </div>
      </div>
    </AppShell>
  );
}

function ConnectorDetail() {
  const runs = [["May 31, 06:00", "scheduled", "ingested 1 row"], ["May 31, 00:00", "scheduled", "ingested 1 row"], ["May 30, 18:00", "manual", "ingested 1 row"], ["May 30, 12:00", "scheduled", "failed · 502"]];
  return (
    <AppShell active="Integrations" crumb={["Integrations", "Connectors", "Stripe MRR"]}>
      <PageHead title="Stripe MRR" badge={<Pill style={{ fontSize: 9 }}>REST</Pill>} sub="Every 6h · maps $.data.mrr → MRR"
        actions={<Btn accent sm>Run now</Btn>} />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
        <MiniCard title="Config">
          <KV k="Type" v="REST" /><KV k="Schedule" v="0 */6 * * *" mono /><KV k="JSON path" v="$.data.mrr" mono /><KV k="Target KPI" v="MRR" />
        </MiniCard>
        <div>
          <SectionLabel>Ingestion history</SectionLabel>
          <Table cols={[{ label: "Run", w: "1.3fr" }, { label: "Kind", w: "0.9fr" }, { label: "Result", w: "1.4fr" }]}
            rows={runs.map(([t, k, r]) => [<span style={{ color: ink2 }}>{t}</span>, <Pill style={{ fontSize: 9 }}>{k}</Pill>, <span style={{ color: r.startsWith("failed") ? "#b4502f" : ink2 }}>{r}</span>])} />
        </div>
      </div>
    </AppShell>
  );
}

function PluginsPage() {
  const plugs = [["Heatmap widget", "widget", "1.2.0", true], ["Cohort template", "template", "0.9.1", true], ["CAGR formula", "formula-fn", "1.0.0", false], ["Snowflake connector", "connector", "2.1.0", false]];
  return (
    <AppShell active="Integrations" crumb={["Integrations", "Plugins"]}>
      <PageHead title="Plugins" sub="Custom extensions — widgets, templates, formula fns, connectors" />
      <SubNav items={["Marketplace", "Connectors", "Plugins"]} active="Plugins" />
      <Banner kind="warning">Catalog only — sandboxed execution arrives post-v1. External entry URLs are unverified; review before enabling.</Banner>
      <div style={{ height: 12 }} />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
        <MiniCard title="Install plugin">
          <Field label="Name" ph="55%" />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}><Select label="Type" value="widget" w="60%" /><Field label="Version" value="1.0.0" w="40%" /></div>
          <div style={{ height: 10 }} /><Field label="Entry URL" value="cdn.acme.dev/plugin.js" mono />
          <div style={{ marginTop: 12 }}><Btn accent sm full>Install</Btn></div>
        </MiniCard>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {plugs.map(([n, t, v, on], i) => (
            <Sketch key={i} style={{ padding: 13, display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Glyph name="plug" size={15} color={ink2} />
                <div style={{ font: "700 13.5px 'Kalam',cursive", flex: 1 }}>{n}</div>
                <span style={{ width: 30, height: 16, borderRadius: 999, background: on ? useCtxAccent() : muted, position: "relative" }}><span style={{ position: "absolute", [on ? "right" : "left"]: 2, top: 2, width: 12, height: 12, borderRadius: 999, background: "#fff" }} /></span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Pill style={{ fontSize: 9 }}>{t}</Pill><span style={{ font: "11px 'JetBrains Mono',monospace", color: ink2 }}>v{v}</span><span style={{ font: "12px 'Caveat',cursive", color: on ? "#2f7d4f" : ink2, marginLeft: "auto" }}>{on ? "enabled" : "disabled"}</span></div>
            </Sketch>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

Object.assign(window, { IntegrationsMarket, ConnectorsPage, ConnectorDetail, PluginsPage });
