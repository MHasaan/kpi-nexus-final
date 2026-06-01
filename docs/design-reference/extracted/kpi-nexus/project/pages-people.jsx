/* pages-people.jsx — 09 People & Org. Exports: UsersDir, UserDetail, RolesPage,
   PositionsPage, OrgUnitsPage, TeamPage, MyKpisPage, ProfilePage */

function UserStatus({ s }) {
  const map = { ACTIVE: "#2f7d4f", INVITED: "#0b84c6", SUSPENDED: "#7a5b12", ARCHIVED: "#555049" };
  return <Pill style={{ fontSize: 9, color: map[s], borderColor: map[s] }}>{s}</Pill>;
}
function UsersDir() {
  const rows = [["Sara Kim", "sara@acme.co", "ACTIVE", "Admin", "—"], ["Marcus Lee", "marcus@acme.co", "ACTIVE", "Manager", "Sara Kim"], ["Priya Nair", "priya@acme.co", "ACTIVE", "Member", "Marcus Lee"], ["Dana Wu", "dana@acme.co", "INVITED", "Editor", "Sara Kim"], ["Lee Ray", "lee@acme.co", "SUSPENDED", "Member", "Marcus Lee"]];
  return (
    <AppShell active="People & Org" crumb={["People", "Users"]}>
      <PageHead title="Users" badge={<Pill>5</Pill>} sub="Directory · invite · manage status"
        actions={<Btn accent sm>＋ Invite user</Btn>} />
      <SubNav items={["Users", "Roles", "Positions", "Org units", "Team"]} active="Users" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        <Table cols={[{ label: "Name", w: "1.4fr" }, { label: "Email", w: "1.6fr" }, { label: "Status", w: "0.9fr" }, { label: "Role", w: "0.9fr" }, { label: "Manager", w: "1fr" }]}
          rows={rows.map(([n, e, s, r, m]) => [
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar size={22} /><b style={{ fontWeight: 600 }}>{n}</b></span>,
            <span style={{ font: "12px 'JetBrains Mono',monospace", color: ink2 }}>{e}</span>, <UserStatus s={s} />, <span>{r}</span>, <span style={{ color: ink2 }}>{m}</span>,
          ])} />
        <MiniCard title="Invite">
          <Field label="Email" ph="65%" /><div style={{ height: 10 }} /><Field label="Name" ph="55%" /><div style={{ height: 10 }} /><Select label="Role" value="Member" />
          <div style={{ marginTop: 12 }}><Btn accent sm full>Send invite</Btn></div>
          <Banner kind="success">Invite created — share accept URL · /accept-invitation?token=…</Banner>
        </MiniCard>
      </div>
    </AppShell>
  );
}

function UserDetail() {
  const kpis = [["Personal sales target", "$82k", "$100k", "up"], ["Accounts managed", "24", "25", "flat"], ["Response SLA", "1.8h", "2h", "up"]];
  return (
    <AppShell active="People & Org" crumb={["People", "Users", "Marcus Lee"]}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <Avatar size={48} label="ML" />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}><div style={{ font: "700 20px/1 'Kalam',cursive" }}>Marcus Lee</div><UserStatus s="ACTIVE" /></div>
          <div style={{ font: "13px 'JetBrains Mono',monospace", color: ink2, marginTop: 4 }}>marcus@acme.co · Manager · reports to Sara Kim</div>
        </div>
        <Btn sm>Suspend</Btn><Btn sm>Edit</Btn>
      </div>
      <SectionLabel>PER_USER KPI assignments</SectionLabel>
      <Table cols={[{ label: "KPI", w: "2fr" }, { label: "Current", w: "1fr" }, { label: "Target", w: "1fr" }, { label: "Trend", w: "1fr" }, { label: "Status", w: "1fr" }]}
        rows={kpis.map(([n, c, t, tr]) => [
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Pill style={{ fontSize: 9 }}>PER_USER</Pill><b style={{ fontWeight: 600 }}>{n}</b></span>,
          <b style={{ fontWeight: 700 }}>{c}</b>, <span style={{ color: ink2 }}>{t}</span>, <Spark w={80} h={20} trend={tr} />,
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#2f7d4f", font: "600 12px 'Kalam',cursive" }}><Glyph name="check" size={12} />On track</span>,
        ])} />
    </AppShell>
  );
}

const PERM_GROUPS = [
  ["KPIs", ["View", "Create", "Edit", "Delete", "Data entry"], [1, 1, 1, 0, 1]],
  ["Dashboards", ["View", "Manage"], [1, 1]],
  ["Users & RBAC", ["Users view", "Users manage", "Roles manage"], [1, 1, 0]],
  ["Org", ["Positions", "Groups view", "Groups manage"], [1, 1, 0]],
  ["Insights", ["Alerts", "Insights", "Analytics", "Reports"], [1, 1, 1, 1]],
  ["Admin", ["Org settings"], [0]],
];
function PermCell({ on, inherited }) {
  const acc = useCtxAccent();
  return (
    <div style={{ width: 18, height: 18, borderRadius: 4, flex: "none",
      border: `1.5px solid ${inherited ? muted : ink}`,
      background: on ? (inherited ? muted : acc) : paper,
      display: "flex", alignItems: "center", justifyContent: "center", font: "700 11px 'Kalam',cursive", color: on ? "#fff" : "transparent" }}>{on ? "✓" : ""}</div>
  );
}
function RolesPage() {
  return (
    <AppShell active="People & Org" crumb={["People", "Roles"]}>
      <PageHead title="Roles & permissions" sub="18 canonical permissions · inherited shown derived"
        actions={<Btn accent sm>＋ New role</Btn>} />
      <SubNav items={["Users", "Roles", "Positions", "Org units", "Team"]} active="Roles" />
      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 16 }}>
        <div>
          <SectionLabel>Roles</SectionLabel>
          <Sketch style={{ padding: "2px 12px" }}>
            {[["Admin", "1", true], ["Manager", "3", false], ["Editor", "2", false], ["Member", "8", false]].map(([n, ct, adm], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderTop: i ? `1px dashed ${muted2}` : "none", background: i === 1 ? "transparent" : "transparent" }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: useCtxAccent() }} />
                <span style={{ font: `${i === 1 ? 700 : 500} 13px 'Kalam',cursive`, flex: 1 }}>{n}</span>
                {adm && <Pill style={{ fontSize: 9 }}>admin</Pill>}
                <span style={{ font: "12px 'Caveat',cursive", color: ink2 }}>{ct}</span>
              </div>
            ))}
          </Sketch>
        </div>
        <MiniCard title="Permission matrix · Manager">
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
            {PERM_GROUPS.map(([grp, perms, vals], gi) => (
              <div key={gi}>
                <div style={{ font: "700 11px/1 'Kalam',cursive", textTransform: "uppercase", letterSpacing: ".5px", color: ink2, marginBottom: 7 }}>{grp}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {perms.map((p, pi) => (
                    <div key={pi} style={{ display: "flex", alignItems: "center", gap: 7, width: 150 }}>
                      <PermCell on={vals[pi] === 1} inherited={gi === 4 && pi > 1} />
                      <span style={{ font: "12.5px 'Kalam',cursive", color: ink }}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ font: "13px 'Caveat',cursive", color: ink2, marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${muted2}` }}>↳ Faded checks are inherited (read-only). Effective order: isAdmin → resource → role → inherited. Permission changes may be approval-gated.</div>
        </MiniCard>
      </div>
    </AppShell>
  );
}

function PositionsPage() {
  const tracks = [["Executive", [["Chief Revenue Officer", "L7", "E4"], ["VP Engineering", "L6", "E3"]]], ["Manager", [["Sales Manager", "L5", "M2"], ["Support Lead", "L4", "M1"]]], ["IC", [["Account Executive", "L3", "I3"], ["Software Engineer", "L3", "I3"], ["Support Specialist", "L2", "I2"]]]];
  return (
    <AppShell active="People & Org" crumb={["People", "Positions"]}>
      <PageHead title="Positions" sub="Job positions used in the org structure" actions={<Btn accent sm>＋ New position</Btn>} />
      <SubNav items={["Users", "Roles", "Positions", "Org units", "Team"]} active="Positions" />
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16 }}>
        <MiniCard title="New position">
          <Field label="Name" ph="60%" /><div style={{ height: 10 }} />
          <div style={{ display: "flex", gap: 8 }}><Select label="Track" value="IC" w="50%" /><Field label="Level" value="L3" w="50%" /></div>
          <div style={{ height: 10 }} /><Field label="Pay grade" value="I3" />
          <div style={{ marginTop: 12 }}><Btn accent sm full>Add position</Btn></div>
        </MiniCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {tracks.map(([t, rows], i) => (
            <div key={i}>
              <SectionLabel>{t}</SectionLabel>
              <Table dense cols={[{ label: "Position", w: "2fr" }, { label: "Level", w: "0.7fr" }, { label: "Pay grade", w: "0.9fr" }]}
                rows={rows.map(([n, l, g]) => [<b style={{ fontWeight: 600 }}>{n}</b>, <span style={{ color: ink2 }}>{l}</span>, <span style={{ font: "12px 'JetBrains Mono',monospace", color: ink2 }}>{g}</span>])} />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function OrgUnitsPage() {
  return (
    <AppShell active="People & Org" crumb={["People", "Org units"]}>
      <PageHead title="Org structure" sub="Build the unit hierarchy · members drive PER_UNIT visibility" actions={<Btn accent sm>＋ New unit</Btn>} />
      <SubNav items={["Users", "Roles", "Positions", "Org units", "Team"]} active="Org units" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <MiniCard title="Units">
          <TreeRow depth={0} name="Acme Inc" value="" contrib="" open />
          <TreeRow depth={1} name="Revenue" value="" contrib="42 people" open />
          <TreeRow depth={2} name="Sales" value="" contrib="18 people" leaf />
          <TreeRow depth={2} name="Customer Success" value="" contrib="11 people" leaf />
          <TreeRow depth={1} name="Engineering" value="" contrib="30 people" open />
          <TreeRow depth={2} name="Platform" value="" contrib="9 people" leaf />
          <TreeRow depth={2} name="Product" value="" contrib="12 people" leaf />
        </MiniCard>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MiniCard title="Sales · members">
            {[["Marcus Lee", "MANAGER"], ["Priya Nair", "member"], ["Lee Ray", "member"]].map(([n, r], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderTop: i ? `1px dashed ${muted2}` : "none" }}>
                <Avatar size={22} /><span style={{ font: "13px 'Kalam',cursive", flex: 1 }}>{n}</span><Pill style={{ fontSize: 9 }}>{r}</Pill>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}><Select value="Add user…" w="55%" /><Select value="member" w="30%" /><Btn sm>＋</Btn></div>
          </MiniCard>
        </div>
      </div>
    </AppShell>
  );
}

function TeamPage() {
  const team = [["Priya Nair", [["Response SLA", "1.8h / 2h", "ok"], ["CSAT", "4.7 / 4.5", "ok"]]], ["Lee Ray", [["Tickets closed", "82 / 90", "risk"], ["CSAT", "4.2 / 4.5", "risk"]]], ["Jordan Ho", [["Pipeline created", "$340k / $300k", "ok"], ["Calls", "120 / 100", "ok"]]]];
  return (
    <AppShell active="People & Org" crumb={["People", "Team"]}>
      <PageHead title="My team" sub="Direct reports' personal KPIs side-by-side" />
      <SubNav items={["Users", "Roles", "Positions", "Org units", "Team"]} active="Team" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {team.map(([n, kpis], i) => (
          <Sketch key={i} style={{ padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Avatar size={28} /><div style={{ font: "700 14px 'Kalam',cursive" }}>{n}</div></div>
            {kpis.map(([kn, v, st], j) => (
              <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 7, borderTop: `1px dashed ${muted2}` }}>
                <Glyph name={st === "ok" ? "check" : "bell"} size={13} color={st === "ok" ? "#2f7d4f" : "#b4502f"} />
                <span style={{ font: "13px 'Kalam',cursive", flex: 1 }}>{kn}</span>
                <span style={{ font: "12.5px 'Kalam',cursive", color: ink2, fontVariantNumeric: "tabular-nums" }}>{v}</span>
              </div>
            ))}
          </Sketch>
        ))}
      </div>
    </AppShell>
  );
}

function MyKpisPage() {
  const rows = [["Personal sales target", "$82k", "$100k", "up", "May"], ["Accounts managed", "24", "25", "flat", "May"], ["Response SLA", "1.8h", "2h", "up", "wk 22"]];
  return (
    <AppShell active="People & Org" crumb={["You", "My KPIs"]}>
      <PageHead title="My KPIs" sub="Your personal assignments · record values inline" />
      <Banner kind="info">Entries post to the scope-correct endpoint (/user-kpis/my-kpis/:id/data) · optimistic.</Banner>
      <div style={{ height: 12 }} />
      <Table cols={[{ label: "KPI", w: "2fr" }, { label: "Current", w: "0.9fr" }, { label: "Target", w: "0.9fr" }, { label: "Trend", w: "1fr" }, { label: "Record next", w: "1.6fr" }]}
        rows={rows.map(([n, c, t, tr, per]) => [
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Pill style={{ fontSize: 9 }}>PER_USER</Pill><b style={{ fontWeight: 600 }}>{n}</b></span>,
          <b style={{ fontWeight: 700 }}>{c}</b>, <span style={{ color: ink2 }}>{t}</span>, <Spark w={80} h={20} trend={tr} />,
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><Sketch r={0.5} style={{ padding: "3px 9px", flex: 1 }}><span style={{ font: "12px 'Caveat',cursive", color: ink2 }}>value for {per}…</span></Sketch><Btn accent sm>Save</Btn></span>,
        ])} />
    </AppShell>
  );
}

function ProfilePage() {
  return (
    <AppShell active={null} crumb={["You", "Profile"]}>
      <PageHead title="Profile & preferences" sub="Account · language · security" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <MiniCard title="Account">
            <KV k="Name" v="Sara Kim" /><KV k="Email" v="sara@acme.co" /><KV k="User id" v="usr_8fX2aQ" mono /><KV k="Status" v="Active" />
          </MiniCard>
          <MiniCard title="Language & appearance">
            <Select label="Locale" value="English (US)" />
            <div style={{ font: "13px 'Caveat',cursive", color: ink2, marginTop: 6 }}>es · fr · اردو (ur-PK flips layout to RTL)</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
              <Seg items={["☀ Light", "🌙 Dark", "Auto"]} active={0} />
            </div>
          </MiniCard>
        </div>
        <MiniCard title="Security · MFA">
          <Banner kind="warning">MFA is not enabled. Add an authenticator app for stronger security.</Banner>
          <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
            <div style={{ width: 92, height: 92, flex: "none", border: `1.5px solid ${ink}`, borderRadius: 8, background: "repeating-conic-gradient(#33312e 0% 25%, #fff 0% 50%) 50% / 12px 12px" }} />
            <div style={{ flex: 1 }}>
              <span style={{ font: "600 11.5px 'Kalam',cursive", color: ink2 }}>Secret (fallback)</span>
              <Sketch r={0.5} style={{ padding: "5px 8px", marginTop: 5, background: "#f3f2ee" }}><span style={{ font: "11px 'JetBrains Mono',monospace", color: ink2 }}>JBSWY3DPEHPK3PXP</span></Sketch>
              <div style={{ font: "12px 'Caveat',cursive", color: ink2, marginTop: 8 }}>Scan the QR or enter the secret in your authenticator.</div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <span style={{ font: "600 11.5px 'Kalam',cursive", color: ink2 }}>Recovery codes — save these</span>
            <Sketch r={0.5} style={{ padding: 10, marginTop: 6, background: "#f3f2ee", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px" }}>
              {["8x2k-91ab", "qd7f-3m0p", "z1c4-7710", "ww9e-aa21"].map((c, i) => <span key={i} style={{ font: "11px 'JetBrains Mono',monospace", color: ink }}>{c}</span>)}
            </Sketch>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}><Field value="6-digit code" w="55%" /><Btn accent sm>Confirm & enable</Btn></div>
        </MiniCard>
      </div>
    </AppShell>
  );
}

Object.assign(window, { UsersDir, UserDetail, RolesPage, PositionsPage, OrgUnitsPage, TeamPage, MyKpisPage, ProfilePage });
