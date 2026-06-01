/* pages-ai.jsx — 07 AI layer. Exports: InsightsPage, RecommendationsPage, AskPage */

function ProvMeta({ children }) {
  return <span style={{ font: "11px 'JetBrains Mono',monospace", color: muted }}>{children}</span>;
}

function InsightsPage() {
  const cards = [
    ["MRR growth is decelerating — churn is the driver", "Net new MRR fell for 2 periods while gross adds held steady; the gap maps to a 0.4pt rise in Enterprise churn.", ["MRR", "Churn rate"], "high"],
    ["Support load is leading CSAT down", "Ticket volume up 18% w/w with resolution time climbing; CSAT dips track the backlog by ~3 days.", ["CSAT", "Ticket resolution"], "medium"],
    ["Pipeline coverage is healthy for Q3", "Coverage at 3.4x vs 3.0x target; win-rate stable — Q3 target looks reachable without added spend.", ["Pipeline", "Win rate"], "high"],
  ];
  return (
    <AppShell active="AI" crumb={["AI", "Insights"]}>
      <PageHead title="Insights" badge={<Pill accentOn>AI</Pill>} sub="Narrative briefings about your KPI performance"
        actions={<Btn accent sm><Glyph name="sparkles" size={13} /> Generate</Btn>} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cards.map(([t, body, kpis, conf], i) => (
          <Sketch key={i} style={{ padding: 14, display: "flex", gap: 12, borderLeft: `3px solid ${useCtxAccent()}` }}>
            <Glyph name="sparkles" size={18} color={useCtxAccent()} style={{ marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ font: "700 14.5px/1.3 'Kalam',cursive", color: ink, marginBottom: 6 }}>{t}</div>
              <div style={{ font: "15px/1.35 'Caveat',cursive", color: ink2, marginBottom: 9 }}>{body}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                {kpis.map((k, j) => <Pill key={j} style={{ fontSize: 10 }}>↗ {k}</Pill>)}
                <Pill style={{ fontSize: 10 }}>confidence · {conf}</Pill>
                <div style={{ flex: 1 }} />
                <ProvMeta>gemini-1.5 · $0.004</ProvMeta>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "none" }}><Btn sm>Keep</Btn><Btn sm>Dismiss</Btn></div>
          </Sketch>
        ))}
      </div>
    </AppShell>
  );
}

function RecommendationsPage() {
  const cards = [
    ["Reduce Enterprise churn with a save-play", "Churn concentrated in 6 at-risk accounts (~$92k ARR). A targeted QBR + discount play historically recovers ~60%.", "Churn alert", "Create task: schedule QBRs", "open"],
    ["Reallocate $8k from paid social to lifecycle", "Lifecycle email shows 3.2x the conversion of paid social this month; shifting spend lifts blended CAC.", "Lead conversion", "Create task: brief growth", "open"],
    ["Add a threshold band to MRR", "MRR has no critical band; a $0.95M floor would have caught last quarter's dip 9 days earlier.", "MRR", "Open KPI → Thresholds", "accepted"],
  ];
  return (
    <AppShell active="AI" crumb={["AI", "Recommendations"]}>
      <PageHead title="Recommendations" badge={<Pill accentOn>AI</Pill>} sub="Actionable next steps — accept to spin up a task" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {cards.map(([t, body, link, action, status], i) => (
          <Sketch key={i} style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Glyph name="sparkles" size={15} color={useCtxAccent()} />
              <div style={{ font: "700 14px/1.25 'Kalam',cursive", color: ink, flex: 1 }}>{t}</div>
              {status === "accepted" && <Pill style={{ fontSize: 9 }}>✓ accepted</Pill>}
            </div>
            <div style={{ font: "14px/1.35 'Caveat',cursive", color: ink2 }}>{body}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Pill style={{ fontSize: 9 }}>↗ {link}</Pill><ProvMeta>conf · high</ProvMeta></div>
            <div style={{ borderTop: `1px dashed ${muted2}`, paddingTop: 9, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ font: "13px 'Caveat',cursive", color: ink2, flex: 1 }}>→ {action}</span>
              {status === "open" ? <><Btn sm>Dismiss</Btn><Btn accent sm>Accept</Btn></> : <Btn sm>View task</Btn>}
            </div>
          </Sketch>
        ))}
      </div>
    </AppShell>
  );
}

function Bubble({ role, children, sources, follow }) {
  const me = role === "user";
  const acc = useCtxAccent();
  return (
    <div style={{ display: "flex", justifyContent: me ? "flex-end" : "flex-start" }}>
      <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", gap: 8 }}>
        <Sketch r={0.7} style={{ padding: "10px 13px", background: me ? accentBg : paper, borderColor: me ? acc : ink }}>
          <div style={{ font: "14px/1.4 'Kalam',cursive", color: ink }}>{children}</div>
        </Sketch>
        {sources && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ font: "12px 'Caveat',cursive", color: ink2 }}>sources:</span>
            {sources.map((s, i) => <Pill key={i} style={{ fontSize: 9 }}>↗ {s}</Pill>)}
            <ProvMeta>gemini-1.5 · $0.006</ProvMeta>
          </div>
        )}
        {follow && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{follow.map((f, i) => <span key={i} style={{ font: "12px 'Kalam',cursive", color: ink2, border: `1.25px solid ${muted}`, borderRadius: 999, padding: "3px 9px" }}>{f}</span>)}</div>}
      </div>
    </div>
  );
}
function AskPage() {
  return (
    <AppShell active="AI" crumb={["AI", "Ask"]} pad={0}>
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 20px", borderBottom: `1.5px solid ${ink}`, background: paper, display: "flex", alignItems: "center", gap: 9 }}>
          <Glyph name="msg" size={17} color={ink} />
          <div style={{ font: "700 16px/1 'Kalam',cursive" }}>Ask</div>
          <Pill accentOn>NLQ</Pill>
          <div style={{ flex: 1 }} />
          <span style={{ font: "13px 'Caveat',cursive", color: ink2 }}>Grounded in your visible data · respects your permissions</span>
        </div>
        <div style={{ flex: 1, overflow: "hidden", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Bubble role="user">How is MRR tracking against target this quarter?</Bubble>
          <Bubble role="assistant" sources={["MRR", "Targets"]} follow={["Break down by segment", "Compare to last quarter", "What's driving it?"]}>
            MRR is $1.24M, about 5% below the $1.30M quarterly target but trending up — on the current slope it reaches target ~6 days early.
          </Bubble>
          <Bubble role="user">What's the biggest risk to hitting it?</Bubble>
          <Bubble role="assistant" sources={["Churn rate", "Enterprise segment"]}>
            Enterprise churn — it rose 0.4pt and accounts for most of the gap. Six accounts (~$92k ARR) carry the risk.
          </Bubble>
        </div>
        <div style={{ padding: "12px 20px 16px", borderTop: `1.5px solid ${ink}`, background: paper }}>
          <Sketch r={0.7} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", boxShadow: "inset 1px 1px 0 rgba(51,49,46,0.05)" }}>
            <Glyph name="sparkles" size={16} color={useCtxAccent()} />
            <span style={{ font: "14px 'Caveat',cursive", color: ink2, flex: 1 }}>Ask anything about your KPIs…</span>
            <Btn accent sm>Send ↑</Btn>
          </Sketch>
        </div>
      </div>
    </AppShell>
  );
}

Object.assign(window, { InsightsPage, RecommendationsPage, AskPage });
