/* homes.jsx — the three Dashboard-home wireframe approaches + shared shell.
   Depends on wireframe-kit.jsx. Exports to window: HomeClassic, HomeFeed, HomeCommand */

const { useContext: useCtx } = React;

// nav model (permission-filtered in the real app)
const NAV = [
  { group: null, items: [["home", "Home", true]] },
  { group: "Measure", items: [["target", "KPIs"], ["chart", "Dashboards"], ["bell", "Alerts"]] },
  { group: "Intelligence", items: [["sparkles", "AI"], ["flag", "OKRs"], ["check", "Tasks"], ["git", "Approvals"]] },
  { group: "Org", items: [["doc", "Reports"], ["users", "People & Org"], ["plug", "Integrations"], ["activity", "Activity"]] },
];

// ---- shared shell chrome ----
function OrgSwitch({ collapsed }) {
  return (
    <Sketch r={0.7} style={{ display: "flex", alignItems: "center", gap: 8, padding: collapsed ? 7 : "7px 9px", justifyContent: collapsed ? "center" : "flex-start" }}>
      <div style={{ width: 22, height: 22, borderRadius: 6, background: muted, border: `1.5px solid ${ink}`, flex: "none" }} />
      {!collapsed && <>
        <div style={{ flex: 1 }}><Bar w="70%" h={8} dark /><div style={{ height: 4 }} /><Bar w="45%" h={6} /></div>
        <Glyph name="chevron" size={14} color={ink2} />
      </>}
    </Sketch>
  );
}

function Sidebar({ mode }) {            // mode: "full" | "rail"
  const collapsed = mode === "rail";
  const W = collapsed ? 64 : 232;
  return (
    <div style={{ width: W, flex: "none", borderRight: `1.5px solid ${ink}`, background: "#f7f6f2",
      display: "flex", flexDirection: "column", padding: collapsed ? "12px 8px" : 12, gap: 10 }}>
      <OrgSwitch collapsed={collapsed} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 2, flex: 1 }}>
        {NAV.map((grp, gi) => (
          <div key={gi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {!collapsed && grp.group && (
              <div style={{ font: "700 9.5px/1 'Kalam', cursive", letterSpacing: ".8px", textTransform: "uppercase", color: ink2, padding: "2px 10px 3px" }}>{grp.group}</div>
            )}
            {grp.items.map(([n, l, active], i) => (
              <NavItem key={i} name={n} label={l} active={!!active} collapsed={collapsed} accentActive />
            ))}
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1.5px dashed ${muted}`, paddingTop: 10, display: "flex", alignItems: "center", gap: 9, justifyContent: collapsed ? "center" : "flex-start" }}>
        <Avatar size={26} label="SK" />
        {!collapsed && <div style={{ flex: 1 }}><Bar w="60%" h={8} dark /><div style={{ height: 4 }} /><Bar w="80%" h={6} /></div>}
        {!collapsed && <Glyph name="gear" size={15} color={ink2} />}
      </div>
    </div>
  );
}

function Header({ crumb = "Dashboard", compact }) {
  return (
    <div style={{ height: compact ? 50 : 56, flex: "none", borderBottom: `1.5px solid ${ink}`, background: paper,
      display: "flex", alignItems: "center", gap: 12, padding: "0 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, font: "700 13px/1 'Kalam', cursive", color: ink }}>
        <span style={{ color: ink2, fontWeight: 500 }}>Acme Inc</span>
        <span style={{ color: muted }}>/</span>
        <span>{crumb}</span>
      </div>
      <div style={{ flex: 1 }} />
      <Sketch r={0.6} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", minWidth: compact ? 150 : 210, background: "#f3f2ee", boxShadow: "inset 1px 1px 0 rgba(51,49,46,0.06)" }}>
        <Glyph name="search" size={14} color={ink2} />
        <Bar w="55%" h={7} />
        <div style={{ flex: 1 }} />
        <Kbd>⌘K</Kbd>
      </Sketch>
      <div style={{ position: "relative" }}>
        <Glyph name="bell" size={18} color={ink} />
        <span style={{ position: "absolute", top: -4, right: -5, width: 13, height: 13, borderRadius: 999, background: noteColor, color: "#fff", font: "700 8px/13px 'Kalam',cursive", textAlign: "center" }}>3</span>
      </div>
      <Glyph name="msg" size={18} color={ink} />
      <Glyph name="sparkles" size={17} color={ink2} />
      <Avatar size={28} label="SK" />
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <div style={{ font: "700 14px/1 'Kalam', cursive", color: ink, whiteSpace: "nowrap" }}>{children}</div>
      {action}
    </div>
  );
}

// frame wrapper giving a window-ish artboard
function Frame({ children, mode }) {
  return (
    <div style={{ display: "flex", height: "100%", background: paper, font: "13px 'Kalam', cursive", color: ink }}>
      {children}
    </div>
  );
}

/* ============================ APPROACH 1 — CLASSIC GRID ============================ */
function HomeClassic() {
  const kpis = [
    ["Monthly recurring revenue", "$1.24M", "up", "+12.4%", "up"],
    ["Net revenue retention", "112%", "up", "+3.1%", "up"],
    ["Active accounts", "8,420", "up", "+5.0%", "up"],
    ["Churn rate", "2.3%", "up", "−0.4%", "down"],
    ["Avg. ticket resolution", "4.6h", "down", "+0.8h", "down"],
    ["NPS", "47", "flat", "±0", "flat"],
  ];
  return (
    <Frame>
      <Sidebar mode="full" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Header crumb="Dashboard" />
        <div style={{ flex: 1, overflow: "hidden", padding: "18px 20px", position: "relative" }}>
          {/* heading row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ font: "700 20px/1 'Kalam', cursive", color: ink, whiteSpace: "nowrap" }}>Good morning, Sara</div>
            <Pill accentOn>ADMIN</Pill>
            <div style={{ flex: 1 }} />
            <Sketch r={0.6} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 9px" }}>
              <Glyph name="calendar" size={13} color={ink2} /><Bar w={48} h={7} /><Glyph name="chevron" size={12} color={ink2} />
            </Sketch>
            <Btn accent>＋ Create KPI</Btn>
          </div>
          {/* summary grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
            <Tile value="142" delta="+6" dir="up" trend="up" accentTop />
            <Tile value="118" delta="83%" dir="up" trend="up" />
            <Tile value="17" delta="+4" dir="down" trend="down" />
            <Tile value="98.6%" delta="fresh" dir="up" trend="flat" />
          </div>
          {/* two-col body */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
            <div>
              <SectionTitle action={<div style={{ display: "flex", gap: 7 }}><Btn sm><Glyph name="filter" size={12} /> Filter</Btn><Btn sm>View all →</Btn></div>}>Your KPIs</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {kpis.map(([n, v, d, dl, t], i) => (
                  <Sketch key={i} style={{ padding: 12, display: "flex", flexDirection: "column", gap: 9 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <Glyph name="target" size={14} color={ink2} />
                      <div style={{ font: "600 12.5px/1.2 'Kalam', cursive", color: ink, flex: 1 }}>{n}</div>
                      <Pill>ORG_WIDE</Pill>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                      <div style={{ font: "700 22px/1 'Kalam', cursive", fontVariantNumeric: "tabular-nums" }}>{v}</div>
                      <Spark w={96} h={30} trend={t} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `1.25px dashed ${muted}`, paddingTop: 7 }}>
                      <Delta dir={d}>{dl}</Delta>
                      <span style={{ font: "500 10px/1 'Caveat', cursive", color: ink2, fontSize: 12 }}>vs target · 2h ago</span>
                    </div>
                  </Sketch>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* setup checklist */}
              <Sketch style={{ padding: 13 }}>
                <SectionTitle action={<Glyph name="chevron" size={14} color={ink2} />}>Finish setup</SectionTitle>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                  <div style={{ flex: 1, height: 8, borderRadius: 999, background: muted2, border: `1.25px solid ${ink}`, overflow: "hidden" }}>
                    <div style={{ width: "64%", height: "100%", background: useCtx(WFContext).accentOn ? accent : ink2 }} />
                  </div>
                  <span style={{ font: "700 11px/1 'Kalam', cursive", color: ink2 }}>9 / 14</span>
                </div>
                {["Invite your team", "Create first KPI", "Connect Slack", "Enable MFA"].map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: i ? `1px dashed ${muted2}` : "none" }}>
                    <div style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${ink}`, background: i < 2 ? muted : paper, flex: "none" }} />
                    <Bar w={i % 2 ? "70%" : "82%"} h={7} />
                    <div style={{ flex: 1 }} />
                    <Glyph name="chevron" size={12} color={muted} style={{ transform: "rotate(-90deg)" }} />
                  </div>
                ))}
              </Sketch>
              {/* recent activity */}
              <Sketch style={{ padding: 13 }}>
                <SectionTitle>Recent activity</SectionTitle>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ display: "flex", gap: 9, padding: "6px 0", borderTop: i ? `1px dashed ${muted2}` : "none" }}>
                    <Avatar size={22} />
                    <div style={{ flex: 1 }}><Bar w={i%2?"85%":"95%"} h={7} /><div style={{ height: 5 }} /><Bar w="40%" h={6} /></div>
                  </div>
                ))}
              </Sketch>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ============================ APPROACH 2 — ATTENTION FEED ============================ */
function FeedRow({ icon, kind, kindColor, lines, btn, btnAccent }) {
  return (
    <Sketch style={{ padding: 13, display: "flex", gap: 12, alignItems: "flex-start", borderLeft: `4px solid ${kindColor}` }}>
      <div style={{ width: 34, height: 34, borderRadius: 8, border: `1.5px solid ${ink}`, background: muted2, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <Glyph name={icon} size={18} color={ink} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "700 10px/1 'Kalam', cursive", letterSpacing: ".4px", textTransform: "uppercase", color: kindColor }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: kindColor }} />{kind}
          </span>
          <span style={{ font: "12px 'Caveat', cursive", color: ink2 }}>· 12m ago</span>
        </div>
        <div style={{ font: "600 13.5px/1.3 'Kalam', cursive", color: ink, marginBottom: 6 }}>{lines}</div>
        <Bar w="78%" h={7} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flex: "none" }}>
        <Btn sm accent={btnAccent}>{btn}</Btn>
        <span style={{ font: "12px 'Caveat', cursive", color: muted }}>dismiss</span>
      </div>
    </Sketch>
  );
}
function HomeFeed() {
  const teamKpis = [["Pipeline","$4.1M","up"],["Win rate","31%","up"],["Cycle time","18d","down"],["Quota att.","87%","flat"],["Leads","2,310","up"]];
  return (
    <Frame>
      <Sidebar mode="rail" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Header crumb="Home" />
        <div style={{ flex: 1, overflow: "hidden", padding: "18px 22px", position: "relative", display: "grid", gridTemplateColumns: "1fr 268px", gap: 18 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ font: "700 20px/1 'Kalam', cursive", color: ink }}>Here's what needs you</div>
              <Pill>MANAGER</Pill>
            </div>
            <div style={{ font: "14px/1 'Caveat', cursive", color: ink2, marginBottom: 14 }}>4 items across your team · sorted by priority</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              <FeedRow icon="bell" kind="Critical alert" kindColor="#b4502f" lines="Churn rate breached 3% threshold for Enterprise segment" btn="Investigate" btnAccent />
              <FeedRow icon="sparkles" kind="AI recommendation" kindColor="#0b84c6" lines="Reallocate spend — 3 KPIs trending below target this week" btn="Review" />
              <FeedRow icon="git" kind="Approval request" kindColor="#7a5b12" lines="Marcus requested approval to change the 'Win rate' target" btn="Approve" btnAccent />
              <FeedRow icon="check" kind="Overdue task" kindColor="#555049" lines="Record Q2 data for 'Customer satisfaction' — due yesterday" btn="Record" />
            </div>

            <div style={{ marginTop: 20 }}>
              <SectionTitle action={<Btn sm>All team KPIs →</Btn>}>Team KPIs at a glance</SectionTitle>
              <div style={{ display: "flex", gap: 11, overflow: "hidden" }}>
                {teamKpis.map(([n, v, t], i) => (
                  <Sketch key={i} style={{ padding: 11, width: 140, flex: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                    <div style={{ font: "600 11.5px/1.2 'Kalam', cursive", color: ink2 }}>{n}</div>
                    <div style={{ font: "700 19px/1 'Kalam', cursive", fontVariantNumeric: "tabular-nums" }}>{v}</div>
                    <Spark w={116} h={24} trend={t} />
                  </Sketch>
                ))}
              </div>
            </div>
          </div>

          {/* right: my tasks */}
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <Sketch style={{ padding: 13 }}>
              <SectionTitle action={<Pill>3</Pill>}>My tasks</SectionTitle>
              {[0,1,2].map(i => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: i ? `1px dashed ${muted2}` : "none" }}>
                  <div style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${ink}`, flex: "none" }} />
                  <div style={{ flex: 1 }}><Bar w={i%2?"75%":"90%"} h={7} /><div style={{ height: 5 }} /><Bar w="35%" h={6} /></div>
                </div>
              ))}
            </Sketch>
            <Sketch style={{ padding: 13 }}>
              <SectionTitle action={<Glyph name="msg" size={14} color={ink2} />}>Mentions</SectionTitle>
              {[0,1].map(i => (
                <div key={i} style={{ display: "flex", gap: 9, padding: "7px 0", borderTop: i ? `1px dashed ${muted2}` : "none" }}>
                  <Avatar size={22} />
                  <div style={{ flex: 1 }}><Bar w="95%" h={7} /><div style={{ height: 5 }} /><Bar w="55%" h={6} /></div>
                </div>
              ))}
            </Sketch>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* ============================ APPROACH 3 — COMMAND CENTER ============================ */
function HomeCommand() {
  const rows = [
    ["Monthly recurring revenue", "ORG_WIDE", "$1.24M", "$1.30M", "up", "+12.4%", "up"],
    ["Net revenue retention", "ORG_WIDE", "112%", "110%", "up", "+3.1%", "up"],
    ["Gross margin", "PER_UNIT", "68.2%", "70%", "flat", "−0.2%", "down"],
    ["Active accounts", "ORG_WIDE", "8,420", "9,000", "up", "+5.0%", "up"],
    ["Churn rate", "ORG_WIDE", "2.3%", "2.0%", "down", "+0.3%", "down"],
    ["Pipeline coverage", "PER_UNIT", "3.4x", "3.0x", "up", "+0.4x", "up"],
    ["Support CSAT", "PER_USER", "4.6", "4.7", "flat", "±0", "flat"],
    ["Lead conversion", "PER_UNIT", "31%", "28%", "up", "+2.0%", "up"],
  ];
  const acc = useCtx(WFContext).accentOn;
  return (
    <Frame>
      <Sidebar mode="rail" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Header crumb="Dashboard" compact />
        <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 312px", minHeight: 0 }}>
          {/* main scorecard */}
          <div style={{ padding: "14px 16px", overflow: "hidden", position: "relative", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
              <div style={{ font: "700 17px/1 'Kalam', cursive", color: ink }}>KPI scorecard</div>
              <Pill>142 KPIs</Pill>
              <div style={{ flex: 1 }} />
              <Sketch r={0.6} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px" }}><Glyph name="filter" size={12} color={ink2} /><Bar w={36} h={6} /></Sketch>
              <Sketch r={0.6} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 8px" }}><Bar w={30} h={6} /><Glyph name="chevron" size={12} color={ink2} /></Sketch>
              <Btn sm accent>＋ KPI</Btn>
            </div>
            {/* table */}
            <Sketch style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr 0.7fr 0.7fr 1fr 0.7fr 0.5fr", gap: 8, padding: "7px 12px", background: "#f3f2ee", borderBottom: `1.5px solid ${ink}`, font: "700 10px/1 'Kalam', cursive", textTransform: "uppercase", letterSpacing: ".4px", color: ink2 }}>
                <span>KPI</span><span>Scope</span><span>Current</span><span>Target</span><span>Trend</span><span>Δ</span><span></span>
              </div>
              {rows.map(([n, sc, cur, tgt, t, dl, dd], i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.8fr 0.7fr 0.7fr 1fr 0.7fr 0.5fr", gap: 8, padding: "8px 12px", alignItems: "center", borderTop: i ? `1px solid ${muted2}` : "none", fontVariantNumeric: "tabular-nums" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <Avatar size={19} />
                    <span style={{ font: "600 12px/1.1 'Kalam', cursive", color: ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}</span>
                  </div>
                  <Pill style={{ fontSize: 9, padding: "1px 6px" }}>{sc}</Pill>
                  <span style={{ font: "700 12.5px/1 'Kalam', cursive" }}>{cur}</span>
                  <span style={{ font: "500 12px/1 'Kalam', cursive", color: ink2 }}>{tgt}</span>
                  <Spark w={92} h={20} trend={t} />
                  <Delta dir={dd}>{dl}</Delta>
                  <Glyph name="chevron" size={13} color={muted} style={{ transform: "rotate(-90deg)" }} />
                </div>
              ))}
            </Sketch>
          </div>

          {/* right AI / activity panel */}
          <div style={{ borderLeft: `1.5px solid ${ink}`, background: "#f7f6f2", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ display: "flex", gap: 4, padding: "10px 12px 0" }}>
              {["Ask AI", "Insights", "Activity"].map((t, i) => (
                <div key={i} style={{ font: `${i===0?700:500} 12px/1 'Kalam', cursive`, padding: "6px 10px", borderRadius: "8px 8px 0 0",
                  color: i === 0 ? (acc ? accent : ink) : ink2,
                  background: i === 0 ? paper : "transparent",
                  border: i === 0 ? `1.25px solid ${ink}` : "1.25px solid transparent",
                  borderBottom: i === 0 ? `1.25px solid ${paper}` : "none", position: "relative", top: 1 }}>{t}</div>
              ))}
            </div>
            <div style={{ borderTop: `1.5px solid ${ink}`, flex: 1, padding: 13, display: "flex", flexDirection: "column", gap: 11, overflow: "hidden" }}>
              <div style={{ font: "13px/1.3 'Caveat', cursive", color: ink2 }}>Grounded in your visible data. Respects your permissions.</div>
              {/* AI insight cards */}
              {[["target","MRR will hit $1.3M target ~6 days early"],["bell","Churn anomaly detected in Enterprise"]].map(([ic, tx], i) => (
                <Sketch key={i} style={{ padding: 11, display: "flex", gap: 9, borderLeft: `3px solid ${acc ? accent : ink}` }}>
                  <Glyph name={ic} size={16} color={ink} />
                  <div style={{ flex: 1 }}>
                    <div style={{ font: "600 12px/1.3 'Kalam', cursive", color: ink, marginBottom: 6 }}>{tx}</div>
                    <Bar w="70%" h={6} />
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                      <Pill style={{ fontSize: 9 }}>confidence · high</Pill>
                      <span style={{ font: "11px 'JetBrains Mono', monospace", color: muted }}>gemini-1.5 · $0.004</span>
                    </div>
                  </div>
                </Sketch>
              ))}
              <div style={{ flex: 1 }} />
              {/* ask box */}
              <Sketch r={0.7} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", boxShadow: "inset 1px 1px 0 rgba(51,49,46,0.06)" }}>
                <Glyph name="sparkles" size={15} color={acc ? accent : ink2} />
                <span style={{ font: "13px 'Caveat', cursive", color: ink2, flex: 1 }}>Ask anything about your KPIs…</span>
                <Btn sm accent>↑</Btn>
              </Sketch>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

Object.assign(window, { HomeClassic, HomeFeed, HomeCommand });
