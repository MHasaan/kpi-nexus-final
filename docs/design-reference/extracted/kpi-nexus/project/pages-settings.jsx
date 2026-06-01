/* pages-settings.jsx — 12 settings (tabbed shell). Exports: SettingsOrg, SettingsAI,
   SettingsNotifications, SettingsDlq, SettingsApiKeys, SettingsWebhooks, SettingsRetention,
   SettingsSso, SettingsScim, SettingsAudit */

const SET_NAV = ["Organization", "AI", "Notifications", "DLQ", "API keys", "Webhooks", "Retention", "SSO", "SCIM", "Audit"];
function SettingsShell({ active, title, sub, children, actions }) {
  return (
    <AppShell active="Settings" crumb={["Settings", active]} pad={0}>
      <div style={{ display: "flex", height: "100%" }}>
        <div style={{ width: 178, flex: "none", borderRight: `1.5px solid ${ink}`, background: "#f7f6f2", padding: 12 }}>
          <SectionLabel>Settings</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {SET_NAV.map((t, i) => (
              <div key={i} style={{ font: `${t === active ? 700 : 500} 12.5px/1 'Kalam',cursive`, color: t === active ? ink : ink2, padding: "7px 10px", borderRadius: 7,
                background: t === active ? useCtxAccentBg() : "transparent", border: t === active ? `1.25px solid ${useCtxAccent()}` : "1.25px solid transparent" }}>{t}</div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: "hidden", padding: 20, minWidth: 0 }}>
          <PageHead title={title} sub={sub} actions={actions} />
          {children}
        </div>
      </div>
    </AppShell>
  );
}
function SetRow({ title, desc, control }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 18, padding: "14px 0", borderTop: `1px dashed ${muted2}`, alignItems: "center" }}>
      <div><div style={{ font: "600 13.5px 'Kalam',cursive", color: ink }}>{title}</div><div style={{ font: "14px/1.3 'Caveat',cursive", color: ink2, marginTop: 2 }}>{desc}</div></div>
      <div>{control}</div>
    </div>
  );
}
function Toggle({ on }) {
  return <span style={{ width: 34, height: 18, borderRadius: 999, background: on ? useCtxAccent() : muted, position: "relative", display: "inline-block" }}><span style={{ position: "absolute", [on ? "right" : "left"]: 2, top: 2, width: 14, height: 14, borderRadius: 999, background: "#fff" }} /></span>;
}

function SettingsOrg() {
  return (
    <SettingsShell active="Organization" title="Organization" sub="Branding, terminology & calendar — re-labels the whole app" actions={<Btn accent sm>Save changes</Btn>}>
      <Sketch style={{ padding: "2px 16px" }}>
        <SetRow title="Organization name" desc="Shown in the app shell & emails" control={<Field value="Acme Inc" />} />
        <SetRow title="Brand colour" desc="Feeds the accent in the app shell" control={<div style={{ display: "flex", gap: 7 }}>{["#0b84c6", "#2f7d4f", "#7a5ae0", "#b4502f"].map((c, i) => <div key={i} style={{ width: 24, height: 24, borderRadius: 6, background: c, border: `${i === 0 ? 2.5 : 1.25}px solid ${ink}` }} />)}</div>} />
        <SetRow title="Terminology" desc={'Rename "KPI"→"Metric", "Org unit"→"Team"…'} control={<div style={{ display: "flex", gap: 8 }}><Field value="Metric" /><Field value="Metrics" /></div>} />
        <SetRow title="Fiscal year start" desc="Used for period scoping" control={<Select value="January" />} />
      </Sketch>
    </SettingsShell>
  );
}

function SettingsAI() {
  return (
    <SettingsShell active="AI" title="AI providers & budget" sub="Routing, budget caps & bring-your-own keys">
      <MiniCard title="Budget">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}><Progress pct={62} /></div>
          <span style={{ font: "13px 'Caveat',cursive", color: ink2 }}>$31 / $50 today · resets 00:00 UTC</span>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}><Field label="Daily cap" value="$50" w="50%" /><Field label="Monthly cap" value="$1,200" w="50%" /></div>
      </MiniCard>
      <div style={{ height: 14 }} />
      <SectionLabel>Per-feature routing</SectionLabel>
      <Table dense cols={[{ label: "Feature", w: "1.4fr" }, { label: "Provider", w: "1fr" }, { label: "Model", w: "1.2fr" }, { label: "Fallback", w: "1fr" }]}
        rows={[["Insights", "Gemini", "gemini-1.5-pro", "Claude"], ["Ask (NLQ)", "Gemini", "gemini-1.5-flash", "OpenAI"], ["Recommendations", "Claude", "claude-3.5", "Gemini"], ["Onboarding co-pilot", "Gemini", "gemini-1.5-pro", "Ollama"]].map(r => r.map((c, i) => i ? <span style={{ color: i === 3 ? ink2 : ink, font: i > 0 ? "12px 'JetBrains Mono',monospace" : undefined }}>{c}</span> : <b style={{ fontWeight: 600 }}>{c}</b>))} />
      <div style={{ height: 14 }} />
      <SectionLabel>Bring-your-own keys</SectionLabel>
      <Sketch style={{ padding: "2px 16px" }}>
        <SetRow title="OpenAI" desc="AES-encrypted · never displayed after save" control={<Pill style={{ fontSize: 9 }}>✓ set ····3kQx</Pill>} />
        <SetRow title="Anthropic" desc="Used when routed / on fallback" control={<Btn sm>Add key</Btn>} />
      </Sketch>
    </SettingsShell>
  );
}

function SettingsNotifications() {
  return (
    <SettingsShell active="Notifications" title="Notifications" sub="Per-event channels & quiet hours" actions={<Btn accent sm>Save</Btn>}>
      <Sketch style={{ padding: "2px 16px" }}>
        <SetRow title="Alert triggered" desc="When a rule fires" control={<div style={{ display: "flex", gap: 10, alignItems: "center" }}><span style={{ font: "12px 'Kalam',cursive", color: ink2 }}>Email · Slack</span><Toggle on /></div>} />
        <SetRow title="Mentioned in a comment" desc="@mentions of you" control={<Toggle on />} />
        <SetRow title="Approval decided" desc="Your requests approved / rejected" control={<Toggle on />} />
        <SetRow title="Weekly digest" desc="Monday summary email" control={<Toggle />} />
        <SetRow title="Quiet hours" desc="Mute non-critical notifications" control={<div style={{ display: "flex", gap: 8, alignItems: "center" }}><Field value="22:00" w={70} /><span style={{ color: ink2 }}>→</span><Field value="07:00" w={70} /></div>} />
      </Sketch>
    </SettingsShell>
  );
}

function SettingsDlq() {
  const rows = [["Ops webhook", "Churn breach", "502 Bad Gateway", "3"], ["SMS · on-call", "Uptime SLA", "carrier reject", "2"], ["#alerts", "MRR decel", "channel archived", "1"]];
  return (
    <SettingsShell active="DLQ" title="Notification DLQ" sub="Failed deliveries — retry individually or in bulk" actions={<><Btn sm>Refresh</Btn><Btn accent sm>Retry all</Btn></>}>
      <Table cols={[{ label: "Channel", w: "1.2fr" }, { label: "Alert", w: "1.2fr" }, { label: "Error", w: "1.4fr" }, { label: "Attempts", w: "0.7fr", align: "center" }, { label: "", w: "0.7fr", align: "right" }]}
        rows={rows.map(([c, a, e, n]) => [<b style={{ fontWeight: 600 }}>{c}</b>, <span style={{ color: ink2 }}>{a}</span>, <span style={{ color: "#b4502f", font: "12px 'JetBrains Mono',monospace" }}>{e}</span>, <span style={{ fontVariantNumeric: "tabular-nums" }}>{n}</span>, <Btn sm>Retry</Btn>])} />
    </SettingsShell>
  );
}

function SettingsApiKeys() {
  return (
    <div style={{ position: "relative", height: "100%" }}>
      <SettingsShell active="API keys" title="API keys" sub="Mint scoped keys · scopes are the 18 permissions" actions={<Btn accent sm>＋ Create key</Btn>}>
        <Table cols={[{ label: "Prefix", w: "1fr" }, { label: "Scopes", w: "1.8fr" }, { label: "Last used", w: "1fr" }, { label: "", w: "0.7fr", align: "right" }]}
          rows={[["kpn_8fX2", "KPI_DATA_ENTRY", "2h ago"], ["kpn_Lm7K", "KPI_VIEW · DASHBOARD_VIEW", "3d ago"], ["kpn_zQ91", "ANALYTICS_VIEW", "never"]].map(([p, s, l]) => [
            <span style={{ font: "12px 'JetBrains Mono',monospace", color: ink }}>{p}····</span>, <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>{s.split(" · ").map((x, i) => <Pill key={i} style={{ fontSize: 9 }}>{x}</Pill>)}</span>, <span style={{ color: ink2 }}>{l}</span>, <Btn sm>Revoke</Btn>,
          ])} />
      </SettingsShell>
      {/* shown-once modal */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(40,38,34,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Sketch r={1.4} style={{ width: 420, padding: 20, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 12px 40px rgba(40,38,34,0.3)" }}>
          <div style={{ font: "700 16px 'Kalam',cursive" }}>Copy your API key now</div>
          <Banner kind="warning">This is the only time the full key is shown. Store it securely.</Banner>
          <Sketch r={0.5} style={{ padding: "10px 12px", background: "#f3f2ee", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ font: "12px 'JetBrains Mono',monospace", color: ink, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>kpn_8fX2aQ··live··Zk19PqR4mN</span><Btn sm accent>Copy</Btn>
          </Sketch>
          <div style={{ display: "flex", justifyContent: "flex-end" }}><Btn sm>I've saved it — dismiss</Btn></div>
        </Sketch>
      </div>
    </div>
  );
}

function SettingsWebhooks() {
  const EVT = ["data_point_added", "alert_triggered", "task_created", "approval_request_decided", "connector_run_completed"];
  return (
    <SettingsShell active="Webhooks" title="Outbound webhooks" sub="Subscribe external URLs to domain events">
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        <MiniCard title="New webhook">
          <Field label="Name" ph="55%" /><div style={{ height: 10 }} /><Field label="URL" value="hooks.acme.dev/kpi" mono />
          <div style={{ marginTop: 10, font: "600 11.5px 'Kalam',cursive", color: ink2 }}>Events</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
            {EVT.map((e, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}><PermCell on={i < 2} /><span style={{ font: "11.5px 'JetBrains Mono',monospace", color: ink2 }}>{e}</span></div>)}
          </div>
          <div style={{ marginTop: 12 }}><Btn accent sm full>Create webhook</Btn></div>
        </MiniCard>
        <div>
          <SectionLabel>Webhooks</SectionLabel>
          <Table cols={[{ label: "Name", w: "1fr" }, { label: "URL", w: "1.4fr" }, { label: "Health", w: "0.9fr" }, { label: "", w: "1.3fr", align: "right" }]}
            rows={[["KPI sync", "hooks.acme.dev/kpi", "✓ 200"], ["Alert relay", "ops.acme.dev/hook", "⚠ 500"]].map(([n, u, h]) => [
              <b style={{ fontWeight: 600 }}>{n}</b>, <span style={{ font: "11px 'JetBrains Mono',monospace", color: ink2 }}>{u}</span>, <span style={{ color: h.startsWith("⚠") ? "#b4502f" : "#2f7d4f" }}>{h}</span>,
              <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}><Btn sm>Test</Btn><Btn sm>Rotate</Btn></span>,
            ])} />
        </div>
      </div>
    </SettingsShell>
  );
}

function SettingsRetention() {
  const tiers = [["FREE", "90 days", false], ["PRO", "1 year", true], ["ENTERPRISE", "7 years", false]];
  return (
    <SettingsShell active="Retention" title="Data retention" sub="Tier presets + per-entity policies">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
        {tiers.map(([t, d, cur], i) => (
          <Sketch key={i} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, borderTop: cur ? `3px solid ${useCtxAccent()}` : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}><div style={{ font: "700 14px 'Kalam',cursive" }}>{t}</div>{cur && <Pill accentOn style={{ fontSize: 9 }}>current</Pill>}</div>
            <div style={{ font: "700 22px/1 'Kalam',cursive", color: ink }}>{d}</div>
            <Btn sm accent={!cur} full>{cur ? "Applied" : "Apply"}</Btn>
          </Sketch>
        ))}
      </div>
      <SectionLabel>Current policies</SectionLabel>
      <Sketch style={{ padding: "2px 16px" }}>
        {[["Data points", "1 year"], ["Activity log", "1 year"], ["Audit log", "7 years"], ["AI usage logs", "90 days"]].map(([e, d], i) => <KV key={i} k={e} v={d} />)}
      </Sketch>
    </SettingsShell>
  );
}

function SettingsSso() {
  return (
    <SettingsShell active="SSO" title="Single sign-on" sub="SAML / OIDC + JIT provisioning" actions={<Btn accent sm>Save</Btn>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        <MiniCard title="Identity provider">
          <Seg items={["SAML", "OIDC"]} active={0} />
          <div style={{ height: 12 }} /><Field label="IdP SSO URL" value="idp.acme.com/sso/saml" mono />
          <div style={{ height: 10 }} /><Field label="IdP entity id" value="urn:acme:idp" mono />
          <div style={{ display: "flex", gap: 24, marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Toggle on /><span style={{ font: "13px 'Kalam',cursive" }}>JIT provisioning</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Toggle /><span style={{ font: "13px 'Kalam',cursive" }}>Active</span></div>
          </div>
        </MiniCard>
        <MiniCard title="Paste into your IdP">
          <span style={{ font: "600 11.5px 'Kalam',cursive", color: ink2 }}>ACS / callback URL</span>
          <Sketch r={0.5} style={{ padding: "6px 9px", marginTop: 5, marginBottom: 10, background: "#f3f2ee" }}><span style={{ font: "11px 'JetBrains Mono',monospace", color: ink2 }}>app.kpinexus.com/sso/acs</span></Sketch>
          <span style={{ font: "600 11.5px 'Kalam',cursive", color: ink2 }}>Entity id</span>
          <Sketch r={0.5} style={{ padding: "6px 9px", marginTop: 5, background: "#f3f2ee" }}><span style={{ font: "11px 'JetBrains Mono',monospace", color: ink2 }}>urn:kpinexus:acme</span></Sketch>
        </MiniCard>
      </div>
    </SettingsShell>
  );
}

function SettingsScim() {
  return (
    <SettingsShell active="SCIM" title="SCIM provisioning" sub="Mint the bearer token your IdP uses at /scim/v2">
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        <MiniCard title="Mint token">
          <Field label="Label" ph="55%" />
          <div style={{ marginTop: 12 }}><Btn accent sm full>Mint token</Btn></div>
          <Banner kind="warning">Shown once — copy immediately.</Banner>
          <Sketch r={0.5} style={{ padding: "8px 10px", marginTop: 8, background: "#f3f2ee", display: "flex", gap: 8, alignItems: "center" }}><span style={{ font: "11px 'JetBrains Mono',monospace", color: ink, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>scim_okta_9fX2···aQ81</span><Btn sm>Copy</Btn></Sketch>
        </MiniCard>
        <div>
          <SectionLabel>Tokens</SectionLabel>
          <Table cols={[{ label: "Label", w: "1.4fr" }, { label: "Last used", w: "1fr" }, { label: "", w: "0.6fr", align: "right" }]}
            rows={[["Okta production", "20m ago"], ["Azure AD test", "never"]].map(([l, u]) => [<b style={{ fontWeight: 600 }}>{l}</b>, <span style={{ color: ink2 }}>{u}</span>, <Btn sm>Revoke</Btn>])} />
          <div style={{ marginTop: 12 }}><span style={{ font: "600 11.5px 'Kalam',cursive", color: ink2 }}>SCIM base URL</span>
            <Sketch r={0.5} style={{ padding: "6px 9px", marginTop: 5, background: "#f3f2ee" }}><span style={{ font: "11px 'JetBrains Mono',monospace", color: ink2 }}>app.kpinexus.com/scim/v2</span></Sketch>
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}

function SettingsAudit() {
  const rows = [["Sara K.", "UPDATE", "KPI · MRR target", "2h ago"], ["Marcus L.", "CREATE", "Task · Save play", "3h ago"], ["System", "DELETE", "Connector · GA (purged)", "5h ago"], ["Dana W.", "UPDATE", "Role · Editor perms", "1d ago"], ["Sara K.", "LOGIN", "Session", "1d ago"]];
  const actionColor = { CREATE: "#2f7d4f", UPDATE: "#0b84c6", DELETE: "#b4502f", LOGIN: "#555049" };
  return (
    <SettingsShell active="Audit" title="Audit log" sub="Searchable forensic trail · complements Activity" actions={<Btn sm>Export</Btn>}>
      <Toolbar left={<><Select value="Action: All" w={140} /><Select value="Entity: All" w={140} /><Btn sm accent>Apply</Btn></>} />
      <Table cols={[{ label: "Actor", w: "1.1fr" }, { label: "Action", w: "0.9fr" }, { label: "Entity", w: "2fr" }, { label: "When", w: "0.9fr" }]}
        rows={rows.map(([a, act, e, t]) => [
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Avatar size={20} /><b style={{ fontWeight: 600 }}>{a}</b></span>,
          <Pill style={{ fontSize: 9, color: actionColor[act], borderColor: actionColor[act] }}>{act}</Pill>, <span style={{ color: ink2 }}>{e}</span>, <span style={{ color: ink2 }}>{t}</span>,
        ])} />
    </SettingsShell>
  );
}

Object.assign(window, { SettingsOrg, SettingsAI, SettingsNotifications, SettingsDlq, SettingsApiKeys, SettingsWebhooks, SettingsRetention, SettingsSso, SettingsScim, SettingsAudit });
