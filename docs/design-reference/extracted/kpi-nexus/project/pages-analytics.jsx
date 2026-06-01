/* pages-analytics.jsx — 04 KPI analytics. Exports: AnomaliesPage, ForecastPage, WhatIfPage, EmbedPage */

function AnalyticsTabs({ active }) {
  const items = ["Overview", "Anomalies", "Forecast", "What-if", "Embed"];
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: `1.5px solid ${ink}`, marginBottom: 16 }}>
      {items.map((t, i) => {
        const on = t === active;
        return <div key={i} style={{ font: `${on ? 700 : 500} 13px/1 'Kalam',cursive`, color: on ? ink : ink2, padding: "8px 12px",
          borderBottom: on ? `2.5px solid ${useCtxAccent()}` : "2.5px solid transparent", position: "relative", top: 1.5 }}>{t}</div>;
      })}
    </div>
  );
}

function AnomChart() {
  const acc = useCtxAccent(); const w = 600, h = 170;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: "block" }}>
      {[42, 84, 126].map(y => <line key={y} x1="0" y1={y} x2={w} y2={y} stroke={muted2} strokeWidth="1" />)}
      <path d="M0 110 L75 96 L150 104 L225 60 L300 88 L375 40 L450 130 L525 64 L600 56" fill="none" stroke={acc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {[[225, 60], [450, 130]].map(([x, y], i) => (
        <g key={i}><rect x={x - 6} y={y - 6} width="12" height="12" fill={paper} stroke={noteColor} strokeWidth="2.5" transform={`rotate(45 ${x} ${y})`} /></g>
      ))}
    </svg>
  );
}
function AnomaliesPage() {
  return (
    <AppShell active="KPIs" crumb={["KPIs", "MRR", "Anomalies"]} pad={0}>
      <div style={{ padding: "16px 20px 0" }}><AnalyticsTabs active="Anomalies" /></div>
      <div style={{ padding: "0 20px 20px", display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Toolbar left={<><Select label={null} value="Method: z-score" w={150} /><Field label={null} value="Threshold 3.0σ" w={130} /><Btn accent sm>Detect</Btn></>}
            right={<span style={{ display: "inline-flex", alignItems: "center", gap: 7, font: "12px 'Kalam',cursive", color: ink2 }}><span style={{ width: 30, height: 16, borderRadius: 999, background: muted, border: `1.25px solid ${ink}` }} /> Persist</span>} />
          <MiniCard title="Trend with anomaly markers"><AnomChart /></MiniCard>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MiniCard title="Flagged points" icon="bell">
            {[["Mar 14", "−2.8σ", "high"], ["May 02", "+3.4σ", "high"]].map(([d, dv, c], i) => (
              <div key={i} style={{ padding: "8px 0", borderTop: i ? `1px dashed ${muted2}` : "none", display: "flex", justifyContent: "space-between" }}>
                <div><div style={{ font: "600 12.5px 'Kalam',cursive" }}>{d}</div><div style={{ font: "12px 'Caveat',cursive", color: ink2 }}>outside expected range</div></div>
                <div style={{ textAlign: "right" }}><div style={{ font: "12px 'JetBrains Mono',monospace", color: noteColor }}>{dv}</div><Pill style={{ fontSize: 9 }}>conf · {c}</Pill></div>
              </div>
            ))}
          </MiniCard>
          <Banner kind="info">Markers use shape + colour, never colour alone. Tooltip shows value, expected range & deviation.</Banner>
        </div>
      </div>
    </AppShell>
  );
}

function ForecastChart() {
  const acc = useCtxAccent(); const w = 600, h = 170;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: "block" }}>
      {[42, 84, 126].map(y => <line key={y} x1="0" y1={y} x2={w} y2={y} stroke={muted2} strokeWidth="1" />)}
      <path d="M330 50 L450 30 L600 8 L600 70 L450 84 L330 78 Z" fill={acc} opacity="0.10" />
      <path d="M330 60 L450 48 L600 30 L600 50 L450 66 L330 70 Z" fill={acc} opacity="0.16" />
      <path d="M0 120 L80 108 L160 112 L240 84 L330 64" fill="none" stroke={acc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M330 64 L450 50 L600 32" fill="none" stroke={acc} strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" />
      <line x1="330" y1="6" x2="330" y2={h - 6} stroke={ink} strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="336" y="18" style={{ font: "11px 'Caveat', cursive", fill: ink2 }}>today</text>
    </svg>
  );
}
function ForecastPage() {
  return (
    <AppShell active="KPIs" crumb={["KPIs", "MRR", "Forecast"]} pad={0}>
      <div style={{ padding: "16px 20px 0" }}><AnalyticsTabs active="Forecast" /></div>
      <div style={{ padding: "0 20px 20px", display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Toolbar left={<><Select label={null} value="Model: auto" w={140} /><Field label={null} value="Horizon: 6 periods" w={150} /><Btn accent sm>Run forecast</Btn></>} />
          <MiniCard title="Historical · forecast · confidence bands"><ForecastChart /></MiniCard>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <MiniCard title="Fit metrics" icon="activity"><KV k="RMSE" v="0.042" mono /><KV k="MAPE" v="3.1%" mono /><div style={{ font: "13px/1.3 'Caveat',cursive", color: ink2, marginTop: 6 }}>Lower is better — how closely the model tracks history.</div></MiniCard>
          <MiniCard title="Legend">
            <div style={{ display: "flex", flexDirection: "column", gap: 6, font: "12px 'Kalam',cursive", color: ink2 }}>
              <span>— actual (solid)</span><span>– – forecast (dashed)</span><span>▒ 80% / 95% bands</span>
            </div>
          </MiniCard>
        </div>
      </div>
    </AppShell>
  );
}

function WhatIfPage() {
  const acc = useCtxAccent();
  return (
    <AppShell active="KPIs" crumb={["KPIs", "MRR", "What-if"]} pad={0}>
      <div style={{ padding: "16px 20px 0" }}><AnalyticsTabs active="What-if" /></div>
      <div style={{ padding: "0 20px 20px", display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, overflow: "hidden" }}>
        <MiniCard title="Driver">
          <Select label="Mechanic" value="Expansion rate" />
          <div style={{ marginTop: 10 }}><span style={{ font: "600 11.5px 'Kalam',cursive", color: ink2 }}>Lift %</span>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 8 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 999, background: muted2, border: `1.25px solid ${ink}`, position: "relative" }}>
                <div style={{ width: "58%", height: "100%", background: acc, borderRadius: 999 }} />
                <div style={{ position: "absolute", left: "58%", top: -5, width: 16, height: 16, borderRadius: 999, background: paper, border: `2px solid ${ink}` }} />
              </div>
              <span style={{ font: "700 13px 'Kalam',cursive", fontVariantNumeric: "tabular-nums" }}>+12%</span>
            </div>
          </div>
          <div style={{ marginTop: 14 }}><Btn accent sm full>Run simulation</Btn></div>
          <div style={{ font: "13px/1.3 'Caveat',cursive", color: ink2, marginTop: 10 }}>Assumes a linear relationship between driver & KPI.</div>
        </MiniCard>
        <MiniCard title="Projected impact">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 30, padding: "10px 6px", height: 180 }}>
            {[["Before", 110, "$1.24M", muted], ["After", 170, "$1.39M", acc]].map(([l, hgt, v, c], i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div style={{ font: "700 16px 'Kalam',cursive", fontVariantNumeric: "tabular-nums" }}>{v}</div>
                <div style={{ width: 64, height: hgt, background: c, border: `1.5px solid ${ink}`, borderRadius: "6px 6px 0 0" }} />
                <div style={{ font: "12px 'Caveat',cursive", color: ink2 }}>{l}</div>
              </div>
            ))}
            <div style={{ alignSelf: "center" }}><Delta dir="up">+$0.15M · +12.1%</Delta></div>
          </div>
        </MiniCard>
      </div>
    </AppShell>
  );
}

function EmbedPage() {
  return (
    <AppShell active="KPIs" crumb={["KPIs", "MRR", "Embed"]} pad={0}>
      <div style={{ padding: "16px 20px 0" }}><AnalyticsTabs active="Embed" /></div>
      <div style={{ padding: "0 20px 20px", display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Toolbar left={<Btn accent sm>Generate embed token</Btn>} right={<span style={{ font: "12px 'Caveat',cursive", color: ink2 }}>regenerate · revoke</span>} />
          <MiniCard title="Signed token">
            <Sketch r={0.5} style={{ padding: "8px 10px", background: "#f3f2ee", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ font: "11px 'JetBrains Mono',monospace", color: ink2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>eyJhbGciOi···signed-HMAC···Qx9</span>
              <Btn sm>Copy</Btn>
            </Sketch>
          </MiniCard>
          <MiniCard title="iframe snippet">
            <Sketch r={0.5} style={{ padding: "10px", background: "#f3f2ee" }}>
              <span style={{ font: "11px/1.5 'JetBrains Mono',monospace", color: ink2 }}>{'<iframe src="…/embed/kpi/[token]"'}<br />{'  width="360" height="180" />'}</span>
            </Sketch>
            <div style={{ marginTop: 8 }}><Btn sm>Copy iframe</Btn></div>
          </MiniCard>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SectionLabel>Live preview</SectionLabel>
          <Sketch style={{ padding: 13 }}>
            <div style={{ font: "600 12px 'Kalam',cursive", color: ink2 }}>Monthly recurring revenue</div>
            <div style={{ font: "700 24px/1 'Kalam',cursive", margin: "6px 0", fontVariantNumeric: "tabular-nums" }}>$1.24M</div>
            <Spark w={200} h={36} trend="up" />
          </Sketch>
          <Banner kind="info">Read-only · signed · respects KPI scope. Renders the chrome-less /embed/kpi/[token].</Banner>
        </div>
      </div>
    </AppShell>
  );
}

Object.assign(window, { AnomaliesPage, ForecastPage, WhatIfPage, EmbedPage });
