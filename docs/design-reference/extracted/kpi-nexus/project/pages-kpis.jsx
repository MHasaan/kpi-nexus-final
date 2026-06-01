/* pages-kpis.jsx — 03 KPIs. Exports: KpiList, KpiDetail, KpiCategories, KpiImport,
   KpiTree, KpiScorecard, KpiTemplates, KpiArchive */

function SubNav({ items, active }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
      {items.map((t, i) => (
        <span key={i} style={{ font: `${t === active ? 700 : 500} 12px/1 'Kalam', cursive`, color: t === active ? ink : ink2,
          padding: "5px 10px", borderRadius: 999, border: `1.25px solid ${t === active ? ink : muted}`, background: t === active ? muted2 : "transparent" }}>{t}</span>
      ))}
    </div>
  );
}
const KPI_SUBNAV = ["Catalog", "Categories", "Templates", "Tree", "Scorecard", "Import", "Archive"];

function BigChart({ h = 150, band, markers }) {
  const acc = useCtxAccent();
  const w = 560;
  const line = "M0 120 L60 108 L120 112 L180 84 L240 92 L300 64 L360 70 L420 44 L480 52 L540 30 L560 26";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: "block" }}>
      {[40, 80, 120].map(y => <line key={y} x1="0" y1={y} x2={w} y2={y} stroke={muted2} strokeWidth="1" />)}
      {band && <path d="M0 100 L120 96 L240 74 L360 52 L480 38 L560 22 L560 50 L480 70 L360 94 L240 104 L120 120 L0 124 Z" fill={acc} opacity="0.12" />}
      <path d={line} fill="none" stroke={acc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="0" y1="60" x2={w} y2="60" stroke={ink} strokeWidth="1.5" strokeDasharray="5 4" />
      {markers && [180, 360].map((x, i) => <circle key={i} cx={x} cy={i ? 70 : 84} r="5" fill="none" stroke={noteColor} strokeWidth="2" />)}
    </svg>
  );
}

function KpiList() {
  const rows = [
    ["Monthly recurring revenue", "ORG_WIDE", "$1.24M", "$1.30M", "up", "+12.4%", "On track"],
    ["Net revenue retention", "ORG_WIDE", "112%", "110%", "up", "+3.1%", "On track"],
    ["Gross margin", "PER_UNIT", "68.2%", "70%", "flat", "−0.2%", "At risk"],
    ["Active accounts", "ORG_WIDE", "8,420", "9,000", "up", "+5.0%", "On track"],
    ["Churn rate", "ORG_WIDE", "2.3%", "2.0%", "down", "+0.3%", "At risk"],
    ["Support CSAT", "PER_USER", "4.6", "4.7", "flat", "±0", "On track"],
    ["Lead conversion", "PER_UNIT", "31%", "28%", "up", "+2.0%", "On track"],
  ];
  const scope = (s) => <Pill style={{ fontSize: 9, padding: "1px 6px" }}>{s}</Pill>;
  const status = (s) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "600 12px/1 'Kalam',cursive", color: s === "At risk" ? "#b4502f" : "#2f7d4f" }}>
      <Glyph name={s === "At risk" ? "bell" : "check"} size={12} />{s}</span>
  );
  return (
    <AppShell active="KPIs" crumb="KPIs">
      <PageHead title="KPIs" badge={<Pill>142</Pill>} sub="Browse every KPI you can see · create · quick-record"
        actions={<><Btn sm><Glyph name="filter" size={12} /> Filter</Btn><Btn accent sm>＋ Create KPI</Btn></>} />
      <SubNav items={KPI_SUBNAV} active="Catalog" />
      <Toolbar left={<><Seg items={["All scopes", "ORG_WIDE", "PER_UNIT", "PER_USER"]} active={0} /><Select value="Category: All" w={150} /></>}
        right={<><Select value="Sort: Updated" w={140} /><Seg items={["≣", "▦"]} active={0} /></>} />
      <Table
        cols={[{ label: "KPI", w: "2fr" }, { label: "Scope", w: "0.8fr" }, { label: "Current", w: "0.8fr" }, { label: "Target", w: "0.8fr" }, { label: "Trend", w: "1fr" }, { label: "Δ", w: "0.8fr" }, { label: "Status", w: "1fr" }]}
        rows={rows.map(([n, sc, cur, tgt, t, dl, st]) => [
          <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Glyph name="target" size={13} color={ink2} /><b style={{ fontWeight: 600 }}>{n}</b></span>,
          scope(sc), <b style={{ fontWeight: 700 }}>{cur}</b>, <span style={{ color: ink2 }}>{tgt}</span>,
          <Spark w={88} h={20} trend={t} />, <Delta dir={t === "down" ? "down" : "up"}>{dl}</Delta>, status(st),
        ])} />
    </AppShell>
  );
}

const KPI_TABS = ["Overview", "Data", "Formula", "Cascade", "Targets", "Thresholds", "Benchmarks", "Lineage", "Audit"];
function KpiDetail() {
  return (
    <AppShell active="KPIs" crumb={["KPIs", "Monthly recurring revenue"]} pad={0}>
      {/* sticky header */}
      <div style={{ padding: "16px 20px 0", borderBottom: `1.5px solid ${ink}`, background: paper }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ font: "700 20px/1.1 'Kalam', cursive", color: ink }}>Monthly recurring revenue</div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, font: "600 12px/1 'Kalam',cursive", color: "#2f7d4f" }}><Glyph name="check" size={12} />On track</span>
            </div>
            <div style={{ font: "12px 'JetBrains Mono', monospace", color: ink2, marginTop: 5 }}>v3 · ORG_WIDE · CURRENCY · higher is better</div>
            <div style={{ font: "14px/1.3 'Caveat', cursive", color: ink2, marginTop: 3 }}>Total committed monthly recurring revenue across all active accounts.</div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 8 }}><Btn sm>💬 Comments</Btn><Btn sm>Edit</Btn><Btn accent sm>Record value</Btn></div>
        </div>
        <div style={{ marginTop: 14 }}><Tabs items={KPI_TABS} active={0} /></div>
      </div>
      {/* overview body */}
      <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Sketch style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 12 }}>
              <div><div style={{ font: "13px 'Caveat',cursive", color: ink2 }}>Current</div><div style={{ font: "700 30px/1 'Kalam',cursive", fontVariantNumeric: "tabular-nums" }}>$1.24M</div></div>
              <div><div style={{ font: "13px 'Caveat',cursive", color: ink2 }}>Target</div><div style={{ font: "600 20px/1 'Kalam',cursive", color: ink2 }}>$1.30M</div></div>
              <Delta dir="up">+12.4% vs last period</Delta>
              <div style={{ flex: 1 }} /><Seg items={["3M", "6M", "1Y", "All"]} active={1} />
            </div>
            <BigChart band />
          </Sketch>
          <div style={{ display: "flex", gap: 12 }}>
            <MiniCard title="Threshold status" icon="bell"><KV k="Warning band" v="< $1.10M" /><KV k="Critical band" v="< $0.95M" /><div style={{ marginTop: 6 }}><span style={{ font: "600 12px 'Kalam',cursive", color: "#2f7d4f" }}>✓ Above all bands</span></div></MiniCard>
            <MiniCard title="Targets" icon="target"><KV k="This quarter" v="$1.30M" /><KV k="Effective" v="Apr 1 – Jun 30" /><div style={{ marginTop: 6 }}><Pill>change → approval-gated</Pill></div></MiniCard>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MiniCard title="Details">
            <KV k="Owner" v="Sara K." /><KV k="Scope" v="ORG_WIDE" /><KV k="Type" v="CURRENCY" /><KV k="Frequency" v="Monthly" /><KV k="Aggregation" v="Last value" />
          </MiniCard>
          <MiniCard title="Trust" icon="activity">
            <div style={{ font: "13px/1.4 'Caveat',cursive", color: ink2 }}>Last updated by Sara · 2h ago. Linked to 3 dashboards. Feeds 2 cascades.</div>
          </MiniCard>
          <MiniCard title="Analytics">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {["Anomalies", "Forecast", "What-if"].map((t, i) => <Btn key={i} sm full><Glyph name="sparkles" size={12} /> {t} →</Btn>)}
            </div>
          </MiniCard>
        </div>
      </div>
    </AppShell>
  );
}

function KpiCategories() {
  const cats = [["Financial", "#0b84c6", "12"], ["Customer", "#7a5b12", "9"], ["Internal process", "#2f7d4f", "7"], ["Learning & growth", "#7a5ae0", "5"]];
  return (
    <AppShell active="KPIs" crumb={["KPIs", "Categories"]}>
      <PageHead title="Categories" sub="Group KPIs · the colour becomes the KPI accent in lists & charts" />
      <SubNav items={KPI_SUBNAV} active="Categories" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
        <Table cols={[{ label: "Category", w: "2fr" }, { label: "In use", w: "0.7fr", align: "right" }, { label: "", w: "0.6fr", align: "right" }]}
          rows={cats.map(([n, c, ct]) => [
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 12, height: 12, borderRadius: 4, background: c, border: `1.25px solid ${ink}` }} /><b style={{ fontWeight: 600 }}>{n}</b></span>,
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{ct} KPIs</span>,
            <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}><Glyph name="gear" size={14} color={ink2} /><Glyph name="target" size={14} color={muted} /></span>,
          ])} />
        <MiniCard title="New category">
          <Field label="Name" ph="60%" />
          <div style={{ marginTop: 9 }}><span style={{ font: "600 11.5px 'Kalam',cursive", color: ink2 }}>Colour</span>
            <div style={{ display: "flex", gap: 7, marginTop: 6 }}>{["#0b84c6", "#2f7d4f", "#b4502f", "#7a5ae0", "#7a5b12"].map((c, i) => <div key={i} style={{ width: 24, height: 24, borderRadius: 6, background: c, border: `${i === 0 ? 2.5 : 1.25}px solid ${ink}` }} />)}</div>
          </div>
          <div style={{ marginTop: 12 }}><Btn accent sm full>＋ Add category</Btn></div>
        </MiniCard>
      </div>
    </AppShell>
  );
}

function KpiImport() {
  return (
    <AppShell active="KPIs" crumb={["KPIs", "Import"]}>
      <PageHead title="Bulk import" badge={<Pill>CSV / JSON</Pill>} sub="Validate with a dry-run, then commit. Two phases keep imports safe."
        actions={<Btn sm>Load sample</Btn>} />
      <SubNav items={KPI_SUBNAV} active="Import" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Textarea label="Paste KPI definitions" h={210} lines={9} />
          <div style={{ display: "flex", gap: 8 }}><Btn>Run dry-run</Btn><Btn accent>Commit import</Btn><span style={{ font: "13px 'Caveat',cursive", color: ink2, alignSelf: "center" }}>Commit enabled after a clean dry-run</span></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <Sketch style={{ flex: 1, padding: 12, textAlign: "center" }}><div style={{ font: "700 24px/1 'Kalam',cursive", color: "#2f7d4f" }}>18</div><div style={{ font: "12px 'Caveat',cursive", color: ink2 }}>valid</div></Sketch>
            <Sketch style={{ flex: 1, padding: 12, textAlign: "center" }}><div style={{ font: "700 24px/1 'Kalam',cursive", color: "#b4502f" }}>2</div><div style={{ font: "12px 'Caveat',cursive", color: ink2 }}>errors</div></Sketch>
          </div>
          <MiniCard title="Errors">
            {[["line 4", "unknown type 'RATIO'"], ["line 9", "duplicate name"]].map(([l, m], i) => (
              <div key={i} style={{ padding: "6px 0", borderTop: i ? `1px dashed ${muted2}` : "none" }}>
                <span style={{ font: "11px 'JetBrains Mono',monospace", color: noteColor }}>{l}</span>
                <div style={{ font: "13px 'Caveat',cursive", color: ink2 }}>{m}</div>
              </div>
            ))}
          </MiniCard>
        </div>
      </div>
    </AppShell>
  );
}

function TreeRow({ depth, name, value, contrib, open, leaf }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", paddingLeft: depth * 24, borderTop: `1px dashed ${muted2}` }}>
      <Glyph name="chevron" size={13} color={leaf ? "transparent" : ink2} style={{ transform: open ? "none" : "rotate(-90deg)" }} />
      <Glyph name="target" size={13} color={ink2} />
      <b style={{ fontWeight: 600, font: "13px 'Kalam',cursive" }}>{name}</b>
      <div style={{ flex: 1 }} />
      <span style={{ font: "700 12.5px 'Kalam',cursive", fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span style={{ font: "12px 'Caveat',cursive", color: ink2, width: 90, textAlign: "right" }}>{contrib}</span>
    </div>
  );
}
function KpiTree() {
  return (
    <AppShell active="KPIs" crumb={["KPIs", "Tree"]}>
      <PageHead title="KPI hierarchy" sub="Parent → child cascade rollups across all KPIs" />
      <SubNav items={KPI_SUBNAV} active="Tree" />
      <Sketch style={{ padding: "4px 14px 10px" }}>
        <TreeRow depth={0} name="Company revenue" value="$4.10M" contrib="rollup" open />
        <TreeRow depth={1} name="Monthly recurring revenue" value="$1.24M" contrib="30% of parent" open />
        <TreeRow depth={2} name="New MRR" value="$0.34M" contrib="27%" leaf />
        <TreeRow depth={2} name="Expansion MRR" value="$0.90M" contrib="73%" leaf />
        <TreeRow depth={1} name="Services revenue" value="$2.86M" contrib="70% of parent" leaf />
        <TreeRow depth={0} name="Customer health" value="—" contrib="rollup" open />
        <TreeRow depth={1} name="Net revenue retention" value="112%" contrib="weighted" leaf />
      </Sketch>
    </AppShell>
  );
}

function KpiScorecard() {
  const quads = [["Financial", ["MRR · $1.24M ▲", "Gross margin · 68% ▼", "CAC · $4.1k ▲"]],
    ["Customer", ["NPS · 47 ▲", "CSAT · 4.6 ◦", "Churn · 2.3% ▼"]],
    ["Internal process", ["Cycle time · 18d ▲", "Defect rate · 0.8% ▲", "Uptime · 99.9% ◦"]],
    ["Learning & growth", ["Training hrs · 12 ▲", "eNPS · 38 ▲", "Retention · 94% ◦"]]];
  return (
    <AppShell active="KPIs" crumb={["KPIs", "Scorecard"]}>
      <PageHead title="Balanced scorecard" sub="KPIs arranged in the four strategy-map quadrants" />
      <SubNav items={KPI_SUBNAV} active="Scorecard" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 12, height: 400 }}>
        {quads.map(([t, items], i) => (
          <Sketch key={i} style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ font: "700 14px/1 'Kalam',cursive", color: ink, borderBottom: `1.5px dashed ${muted}`, paddingBottom: 8 }}>{t}</div>
            {items.map((it, j) => (
              <div key={j} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: useCtxAccent(), flex: "none" }} />
                <span style={{ font: "13px 'Kalam',cursive", color: ink, fontVariantNumeric: "tabular-nums" }}>{it}</span>
              </div>
            ))}
          </Sketch>
        ))}
      </div>
    </AppShell>
  );
}

function KpiTemplates() {
  const tmpls = [["SaaS MRR", "sum(new + expansion − churn)"], ["NPS", "%promoters − %detractors"], ["Gross margin", "(rev − cogs) / rev"], ["CAC", "spend / new customers"], ["Burn multiple", "net burn / net new ARR"], ["Quick ratio", "(new+exp) / (churn+contr)"]];
  return (
    <AppShell active="KPIs" crumb={["KPIs", "Templates"]}>
      <PageHead title="KPI templates" sub="Curated definitions you can instantiate in one click"
        actions={<Sketch r={0.6} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", width: 200 }}><Glyph name="search" size={13} color={ink2} /><Bar w="50%" h={7} /></Sketch>} />
      <SubNav items={KPI_SUBNAV} active="Templates" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {tmpls.map(([n, f], i) => (
          <Sketch key={i} style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}><Glyph name="target" size={14} color={ink2} /><div style={{ font: "700 14px/1.1 'Kalam',cursive" }}>{n}</div></div>
            <Bar w="85%" h={7} />
            <Sketch r={0.5} style={{ padding: "6px 8px", background: "#f3f2ee" }}><span style={{ font: "11px 'JetBrains Mono',monospace", color: ink2 }}>{f}</span></Sketch>
            <Btn sm accent={i === 0}>Apply template</Btn>
          </Sketch>
        ))}
      </div>
    </AppShell>
  );
}

function KpiArchive() {
  const rows = [["Trial signups", "May 12", "23 days"], ["Beta feedback score", "May 4", "15 days"], ["Q1 pipeline", "Apr 28", "9 days"]];
  return (
    <AppShell active="KPIs" crumb={["KPIs", "Archive"]}>
      <PageHead title="Archive" sub="Soft-deleted KPIs · 30-day window before permanent deletion" />
      <SubNav items={KPI_SUBNAV} active="Archive" />
      <Banner kind="warning">Archived KPIs are restorable until the countdown ends. Purge is permanent and type-to-confirm.</Banner>
      <div style={{ height: 12 }} />
      <Table cols={[{ label: "KPI", w: "2fr" }, { label: "Deleted", w: "1fr" }, { label: "Until purge", w: "1fr" }, { label: "", w: "1.3fr", align: "right" }]}
        rows={rows.map(([n, d, c]) => [
          <span style={{ color: ink2 }}>{n}</span>, <span style={{ color: ink2 }}>{d}</span>,
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#b4502f" }}><Glyph name="bell" size={12} />{c}</span>,
          <span style={{ display: "inline-flex", gap: 7, justifyContent: "flex-end" }}><Btn sm>Restore</Btn><Btn sm>Purge now</Btn></span>,
        ])} />
    </AppShell>
  );
}

Object.assign(window, { KpiList, KpiDetail, KpiCategories, KpiImport, KpiTree, KpiScorecard, KpiTemplates, KpiArchive });
