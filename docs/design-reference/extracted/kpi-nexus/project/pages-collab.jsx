/* pages-collab.jsx — 08 OKRs, Tasks, Approvals, Workflows, Activity, Mentions, Comments.
   Exports: TasksBoard, OkrsGrid, OkrDetail, ApprovalsPage, WorkflowsPage, ActivityFeed, MentionsInbox, CommentsDemo */

function Prio({ p }) {
  const c = p === "High" ? "#b4502f" : p === "Med" ? "#7a5b12" : "#555049";
  return <span style={{ font: "600 10px/1 'Kalam',cursive", color: c, border: `1.25px solid ${c}`, borderRadius: 999, padding: "1px 7px" }}>{p}</span>;
}
function TaskCard({ title, prio, kpi, due, drag }) {
  return (
    <Sketch style={{ padding: 10, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ font: "600 12.5px/1.25 'Kalam',cursive", color: ink }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Prio p={prio} />{kpi && <Pill style={{ fontSize: 9 }}>↗ {kpi}</Pill>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, font: "11px 'Caveat',cursive", color: ink2 }}>
        <Avatar size={18} /><span>{due}</span>
      </div>
    </Sketch>
  );
}
function TasksBoard() {
  const cols = [
    ["To do", 3, [["Schedule Enterprise QBRs", "High", "Churn rate", "Jun 3"], ["Draft growth brief", "Med", "Lead conv.", "Jun 5"], ["Review Q2 targets", "Low", null, "Jun 7"]]],
    ["In progress", 2, [["Add MRR threshold band", "High", "MRR", "today"], ["Connect Slack channel", "Med", null, "Jun 2"]]],
    ["Blocked", 1, [["Reconcile billing export", "High", "MRR", "overdue"]]],
    ["Done", 2, [["Enable MFA org-wide", "Med", null, "May 28"], ["Publish board pack", "Low", null, "May 24"]]],
    ["Cancelled", 0, []],
  ];
  return (
    <AppShell active="Tasks" crumb="Tasks" pad={16}>
      <PageHead title="Tasks" sub="Drag across the lifecycle · optimistic moves · quick-add per column"
        actions={<><Btn sm><Glyph name="filter" size={12} /> Filter</Btn></>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, height: 430 }}>
        {cols.map(([t, ct, cards], ci) => (
          <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 8, background: "#f3f2ee", border: `1.5px solid ${ci === 1 ? useCtxAccent() : muted}`, borderRadius: 10, padding: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ font: "700 12px/1 'Kalam',cursive", color: ink }}>{t}</span>
              <Pill style={{ fontSize: 9 }}>{ct}</Pill>
            </div>
            <Sketch r={0.6} style={{ padding: "5px 8px", borderStyle: "dashed", display: "flex", alignItems: "center", gap: 6 }}><Glyph name="plus" size={12} color={ink2} /><span style={{ font: "12px 'Caveat',cursive", color: ink2 }}>quick add…</span></Sketch>
            {cards.map((c, i) => <TaskCard key={i} title={c[0]} prio={c[1]} kpi={c[2]} due={c[3]} />)}
            {ci === 1 && <Sketch r={0.6} style={{ flex: 1, borderStyle: "dashed", borderColor: useCtxAccent(), background: useCtxAccentBg(), minHeight: 36 }} />}
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function StatusBadge({ s }) {
  const map = { ACTIVE: "#0b84c6", AT_RISK: "#b4502f", ACHIEVED: "#2f7d4f", DRAFT: "#555049", MISSED: "#b4502f" };
  return <Pill style={{ fontSize: 9, color: map[s], borderColor: map[s] }}>{s}</Pill>;
}
function Progress({ pct, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 999, background: muted2, border: `1.25px solid ${ink}`, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color || useCtxAccent() }} />
      </div>
      <span style={{ font: "700 12px/1 'Kalam',cursive", fontVariantNumeric: "tabular-nums", width: 34, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}
function OkrsGrid() {
  const okrs = [["Win the mid-market", "Sara K.", 72, "ACTIVE"], ["World-class support", "Priya N.", 48, "AT_RISK"], ["Durable revenue growth", "Marcus L.", 91, "ACHIEVED"], ["Ship the platform", "Dana W.", 30, "ACTIVE"], ["Healthy unit economics", "Sara K.", 64, "ACTIVE"], ["Team & culture", "Lee R.", 12, "DRAFT"]];
  return (
    <AppShell active="OKRs" crumb="OKRs">
      <PageHead title="Objectives" sub="Goals framing your KPIs · progress rolls up from key results"
        actions={<Btn accent sm>＋ New objective</Btn>} />
      <Toolbar left={<><Seg items={["All", "Active", "At risk", "Achieved"]} active={0} /><Select value="Period: Q2" w={130} /></>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {okrs.map(([n, o, p, s], i) => (
          <Sketch key={i} style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <Glyph name="flag" size={16} color={ink2} style={{ marginTop: 1 }} />
              <div style={{ font: "700 14px/1.25 'Kalam',cursive", flex: 1 }}>{n}</div>
              <StatusBadge s={s} />
            </div>
            <Progress pct={p} color={s === "AT_RISK" ? "#b4502f" : s === "ACHIEVED" ? "#2f7d4f" : undefined} />
            <div style={{ display: "flex", alignItems: "center", gap: 7, font: "12px 'Caveat',cursive", color: ink2 }}><Avatar size={18} />{o} · Q2 2026</div>
          </Sketch>
        ))}
      </div>
    </AppShell>
  );
}

function OkrDetail() {
  const krs = [["Add 40 mid-market logos", "12", "40", 30], ["Mid-market ARR to $2M", "$1.3M", "$2M", 65], ["Win rate ≥ 35%", "31%", "35%", 76]];
  return (
    <AppShell active="OKRs" crumb={["OKRs", "Win the mid-market"]}>
      <PageHead title="Win the mid-market" badge={<StatusBadge s="ACTIVE" />} sub="Sara K. · Q2 2026"
        actions={<><Btn sm><Glyph name="target" size={12} /> Sync from KPIs</Btn><Btn accent sm>＋ Add KR</Btn></>} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MiniCard title="Key results">
            {krs.map(([n, base, tgt, p], i) => (
              <div key={i} style={{ padding: "11px 0", borderTop: i ? `1px dashed ${muted2}` : "none", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ font: "600 13px 'Kalam',cursive", flex: 1 }}>{n}</div>
                  <span style={{ font: "12px 'Caveat',cursive", color: ink2 }}>{base} → {tgt}</span>
                  <Sketch r={0.5} style={{ padding: "3px 8px" }}><span style={{ font: "12px 'JetBrains Mono',monospace", color: ink }}>{base}</span></Sketch>
                </div>
                <Progress pct={p} />
              </div>
            ))}
          </MiniCard>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MiniCard title="Overall progress" accentTop>
            <div style={{ font: "700 34px/1 'Kalam',cursive", textAlign: "center", margin: "6px 0", fontVariantNumeric: "tabular-nums" }}>57%</div>
            <Progress pct={57} />
            <div style={{ font: "13px 'Caveat',cursive", color: ink2, marginTop: 8, textAlign: "center" }}>weighted across 3 key results</div>
          </MiniCard>
          <MiniCard title="Aligned objectives">
            {["Durable revenue growth", "Healthy unit economics"].map((t, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 0" }}><Glyph name="flag" size={13} color={ink2} /><span style={{ font: "12.5px 'Kalam',cursive" }}>{t}</span></div>)}
          </MiniCard>
        </div>
      </div>
    </AppShell>
  );
}

function DiffPreview() {
  return (
    <Sketch r={0.6} style={{ padding: 10, background: "#f3f2ee" }}>
      <div style={{ font: "11px/1.6 'JetBrains Mono',monospace" }}>
        <div style={{ color: "#b4502f" }}>- target: $1.30M</div>
        <div style={{ color: "#2f7d4f" }}>+ target: $1.45M</div>
      </div>
    </Sketch>
  );
}
function ApprovalsPage() {
  return (
    <AppShell active="Approvals" crumb="Approvals">
      <PageHead title="Approvals" badge={<Pill>2 pending</Pill>} sub="Govern which changes need sign-off · decide pending requests" />
      <SectionLabel>Workflow configuration</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
        {[["KPI definition", true, "Admin"], ["KPI target", true, "Finance lead"], ["Role permissions", false, "—"]].map(([t, on, role], i) => (
          <MiniCard key={i} title={t}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 2 }}>
              <span style={{ width: 34, height: 18, borderRadius: 999, background: on ? useCtxAccent() : muted, position: "relative" }}><span style={{ position: "absolute", [on ? "right" : "left"]: 2, top: 2, width: 14, height: 14, borderRadius: 999, background: "#fff" }} /></span>
              <span style={{ font: "13px 'Kalam',cursive", color: ink2 }}>{on ? "Active" : "Off"}</span>
            </div>
            <div style={{ marginTop: 10 }}><Select label="Approver role" value={role} /></div>
          </MiniCard>
        ))}
      </div>
      <SectionLabel>Pending requests</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[["Change MRR target", "Marcus L. · 1h ago"], ["Promote 'Editor' to manage roles", "Dana W. · 3h ago"]].map(([t, who], i) => (
          <Sketch key={i} style={{ padding: 13, display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ font: "700 13.5px 'Kalam',cursive", marginBottom: 3 }}>{t}</div>
              <div style={{ font: "13px 'Caveat',cursive", color: ink2 }}>Requested by {who} · you are an approver</div>
            </div>
            <div style={{ width: 200 }}><DiffPreview /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><Btn sm>Reject</Btn><Btn accent sm>Approve</Btn></div>
          </Sketch>
        ))}
      </div>
    </AppShell>
  );
}

function WorkflowsPage() {
  return (
    <AppShell active="Approvals" crumb={["Automation", "Workflows"]}>
      <PageHead title="Automations" sub="When a KPI changes and a rule matches, run an action" />
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16 }}>
        <MiniCard title="New automation">
          <Field label="Name" ph="55%" />
          <div style={{ marginTop: 12, font: "600 11.5px 'Kalam',cursive", color: ink2 }}>Trigger → condition → action</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}><Select value="MRR" w="50%" /><Select value="&gt;" w="20%" /><Field value="100000" w="30%" /></div>
          <div style={{ marginTop: 8 }}><Field label="Then create task" value="Celebrate 🎉" /></div>
          <div style={{ marginTop: 12 }}><Btn accent sm full>Create automation</Btn></div>
        </MiniCard>
        <div>
          <SectionLabel>Active automations</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["When MRR > $100k, create task 'Celebrate'", "ran 2d ago"], ["When Churn > 3%, create task 'Save play'", "ran 12m ago"], ["When CSAT < 4.5, create task 'Review backlog'", "never run"]].map(([s, last], i) => (
              <Sketch key={i} style={{ padding: 12, display: "flex", alignItems: "center", gap: 10 }}>
                <Glyph name="activity" size={15} color={useCtxAccent()} />
                <div style={{ flex: 1, font: "13px 'Kalam',cursive", color: ink }}>{s}</div>
                <span style={{ font: "12px 'Caveat',cursive", color: ink2 }}>{last}</span>
                <span style={{ width: 30, height: 16, borderRadius: 999, background: useCtxAccent(), position: "relative" }}><span style={{ position: "absolute", right: 2, top: 2, width: 12, height: 12, borderRadius: 999, background: "#fff" }} /></span>
              </Sketch>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ActivityFeed() {
  const days = [["Today", [["Sara K.", "recorded a value on", "MRR", "2h ago"], ["Marcus L.", "requested approval for", "KPI target", "3h ago"], ["System", "fired alert on", "Churn rate", "4h ago"]]],
    ["Yesterday", [["Priya N.", "created", "Task · Review backlog", "—"], ["Dana W.", "updated", "Role · Editor", "—"], ["Sara K.", "captured snapshot of", "Revenue overview", "—"]]]];
  return (
    <AppShell active="Activity" crumb="Activity">
      <PageHead title="Activity" sub="Audit-backed timeline of everything in your org"
        actions={<Select value="All entities" w={150} />} />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {days.map(([d, rows], di) => (
          <div key={di}>
            <SectionLabel>{d}</SectionLabel>
            <Sketch style={{ padding: "2px 14px" }}>
              {rows.map(([who, verb, ent, t], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? `1px dashed ${muted2}` : "none" }}>
                  <Avatar size={24} />
                  <div style={{ flex: 1, font: "13px 'Kalam',cursive", color: ink }}><b style={{ fontWeight: 700 }}>{who}</b> <span style={{ color: ink2 }}>{verb}</span> <b style={{ fontWeight: 600 }}>{ent}</b></div>
                  <span style={{ font: "12px 'Caveat',cursive", color: ink2 }}>{t}</span>
                </div>
              ))}
            </Sketch>
          </div>
        ))}
        <div style={{ textAlign: "center" }}><Btn sm>Load more</Btn></div>
      </div>
    </AppShell>
  );
}

function MentionsInbox() {
  const rows = [["Marcus L.", "mentioned you on Churn rate: \"@sara can you confirm the threshold?\"", "12m ago", true], ["Priya N.", "mentioned you on Task · Save play: \"@sara owns the QBRs\"", "2h ago", true], ["Dana W.", "mentioned you on Revenue overview: \"@sara great board\"", "1d ago", false]];
  return (
    <AppShell active={null} crumb={["You", "Mentions"]}>
      <PageHead title="Mentions" badge={<Pill accentOn>2 unread</Pill>} sub="Comments where you were @mentioned"
        actions={<><span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "12px 'Kalam',cursive", color: ink2 }}><span style={{ width: 30, height: 16, borderRadius: 999, background: useCtxAccent(), position: "relative" }}><span style={{ position: "absolute", right: 2, top: 2, width: 12, height: 12, borderRadius: 999, background: "#fff" }} /></span>Unread only</span><Btn sm>Mark all read</Btn></>} />
      <Sketch style={{ padding: "2px 0" }}>
        {rows.map(([who, body, t, unread], i) => (
          <div key={i} style={{ display: "flex", gap: 11, padding: "12px 14px", borderTop: i ? `1px dashed ${muted2}` : "none", borderLeft: unread ? `3px solid ${useCtxAccent()}` : "3px solid transparent", background: unread ? useCtxAccentBg() : "transparent" }}>
            <Avatar size={26} />
            <div style={{ flex: 1 }}><div style={{ font: `${unread ? 600 : 400} 13px/1.35 'Kalam',cursive`, color: ink }}><b style={{ fontWeight: 700 }}>{who}</b> {body}</div><div style={{ font: "12px 'Caveat',cursive", color: ink2, marginTop: 3 }}>{t}</div></div>
            {unread && <Btn sm>Mark read</Btn>}
          </div>
        ))}
      </Sketch>
    </AppShell>
  );
}

// Comments drawer shown as an overlay on a dimmed KPI page
function CommentsDemo() {
  return (
    <div style={{ position: "relative", height: "100%", overflow: "hidden" }}>
      <div style={{ filter: "saturate(0.6)", height: "100%" }}><KpiDetail /></div>
      <div style={{ position: "absolute", inset: 0, background: "rgba(40,38,34,0.28)" }} />
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 360, background: paper, borderLeft: `1.5px solid ${ink}`, boxShadow: "-4px 0 18px rgba(40,38,34,0.18)", display: "flex", flexDirection: "column", font: "'Kalam',cursive" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 15px", borderBottom: `1.5px solid ${ink}` }}>
          <span style={{ fontSize: 15 }}>💬</span><div style={{ font: "700 14px 'Kalam',cursive", flex: 1 }}>Comments</div><Glyph name="plus" size={16} color={ink2} style={{ transform: "rotate(45deg)" }} />
        </div>
        <div style={{ flex: 1, overflow: "hidden", padding: 15, display: "flex", flexDirection: "column", gap: 14 }}>
          {[["Marcus L.", "2h ago", "Threshold looks aggressive — should we soften the warning band?"], ["Sara K.", "1h ago", "Good call. @marcus I'll set warning at $1.10M."], ["Marcus L.", "58m ago", "👍 works for me"]].map(([who, t, body], i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <Avatar size={26} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "baseline" }}><b style={{ fontWeight: 700, font: "13px 'Kalam',cursive" }}>{who}</b><span style={{ font: "11px 'Caveat',cursive", color: ink2 }}>{t}</span></div>
                <div style={{ font: "13px/1.4 'Kalam',cursive", color: ink, marginTop: 3 }}>{body.split("@marcus").map((p, j) => j === 0 ? p : <React.Fragment key={j}><span style={{ color: useCtxAccent(), fontWeight: 600 }}>@marcus</span>{p}</React.Fragment>)}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: 14, borderTop: `1.5px solid ${ink}` }}>
          <Sketch r={0.6} style={{ padding: 10, boxShadow: "inset 1px 1px 0 rgba(51,49,46,0.05)" }}><Lines n={2} last="50%" /></Sketch>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}><span style={{ font: "12px 'Caveat',cursive", color: ink2, flex: 1 }}>@ mention to notify · markdown ok</span><Btn accent sm>Comment</Btn></div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TasksBoard, OkrsGrid, OkrDetail, ApprovalsPage, WorkflowsPage, ActivityFeed, MentionsInbox, CommentsDemo });
