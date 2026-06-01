/* wireframe-kit.jsx — low-fi sketch primitives for KPI Nexus wireframes.
   Exports to window: WFContext, ink, muted, paper, accent, noteColor,
   Sketch, Bar, Lines, Pill, Btn, Glyph, Spark, Delta, Avatar, Note, Kbd, NavItem, Tile */

const { createContext, useContext } = React;

// --- palette (b&w + one accent) ---
const ink     = "#33312e";   // pencil ink
const ink2    = "#6b6862";   // lighter ink
const muted    = "#cfccc4";  // placeholder fill
const muted2   = "#e4e1d9";  // faint fill
const paper    = "#fbfbf9";  // artboard paper
const accent   = "#0b84c6";  // sky → only on primary actions
const accentBg = "#e2f1fb";
const noteColor = "#c2502f";  // pencil-red annotations

const WFContext = createContext({ showNotes: true, accentOn: true, density: "comfortable" });

// hand-drawn-ish irregular radius
const rr = (s = 1) => `${10*s}px ${7*s}px ${9*s}px ${8*s}px / ${8*s}px ${9*s}px ${7*s}px ${10*s}px`;

function Sketch({ children, style = {}, r = 1, fill = paper, b = ink, bw = 1.5, hover, ...rest }) {
  return (
    <div
      {...rest}
      style={{
        border: `${bw}px solid ${b}`,
        borderRadius: rr(r),
        background: fill,
        boxShadow: `1.5px 2px 0 rgba(51,49,46,0.07)`,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// placeholder text line
function Bar({ w = "100%", h = 9, dark = false, style = {} }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: dark ? ink2 : muted,
      ...style,
    }} />
  );
}

// a stack of placeholder lines
function Lines({ n = 3, last = "60%", gap = 7, h = 8, dark = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: n }).map((_, i) => (
        <Bar key={i} h={h} dark={dark} w={i === n - 1 ? last : "100%"} />
      ))}
    </div>
  );
}

function Pill({ children, accentOn, style = {} }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      border: `1.25px solid ${accentOn ? accent : ink}`,
      color: accentOn ? accent : ink2,
      background: accentOn ? accentBg : "transparent",
      borderRadius: 999, padding: "2px 9px",
      font: "600 11px/1 'Kalam', cursive", letterSpacing: ".2px",
      ...style,
    }}>{children}</span>
  );
}

function Btn({ children, accent: isAccent, full, sm, style = {} }) {
  const ctx = useContext(WFContext);
  const on = isAccent && ctx.accentOn;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
      border: `1.5px solid ${on ? accent : ink}`,
      background: on ? accent : (isAccent ? muted2 : paper),
      color: on ? "#fff" : ink,
      borderRadius: rr(0.7),
      padding: sm ? "4px 10px" : "6px 13px",
      width: full ? "100%" : "auto",
      font: `700 ${sm ? 11.5 : 13}px/1 'Kalam', cursive`,
      boxShadow: `1.5px 2px 0 rgba(51,49,46,0.08)`,
      whiteSpace: "nowrap",
      ...style,
    }}>{children}</span>
  );
}

// --- simplified lucide-ish glyphs, stroke = currentColor ---
const PATHS = {
  home:      "M3 11l9-8 9 8M5 10v10h14V10",
  target:    "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0",
  chart:     "M4 20V10M10 20V4M16 20v-7M20 20H3",
  bell:      "M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 21a2 2 0 0 0 4 0",
  sparkles:  "M12 3l1.8 4.7L18 9.5l-4.2 1.8L12 16l-1.8-4.7L6 9.5l4.2-1.8L12 3M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2",
  flag:      "M5 21V4M5 4h11l-2 4 2 4H5",
  check:     "M4 6h10M4 12h10M4 18h6M16 16l2 2 4-4",
  doc:       "M7 3h7l5 5v13H7zM14 3v5h5",
  users:     "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21a7 7 0 0 1 14 0M17 7a3 3 0 0 1 0 6M19 21a6 6 0 0 0-3-5",
  plug:      "M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5",
  gear:      "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
  activity:  "M3 12h4l3 8 4-16 3 8h4",
  search:    "M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-5-5",
  plus:      "M12 5v14M5 12h14",
  grid:      "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  chevron:   "M6 9l6 6 6-6",
  arrowUp:   "M7 17L17 7M9 7h8v8",
  filter:    "M3 5h18l-7 8v6l-4-2v-4z",
  git:       "M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6M18 6a9 9 0 0 1-9 9",
  msg:       "M4 5h16v11H8l-4 4z",
  calendar:  "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
};
function Glyph({ name, size = 18, color = "currentColor", sw = 2, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ flex: "none", ...style }}>
      <path d={PATHS[name] || PATHS.grid} />
    </svg>
  );
}

// jagged hand-drawn sparkline
function Spark({ w = 90, h = 30, trend = "up", color }) {
  const ctx = useContext(WFContext);
  const c = color || (ctx.accentOn ? accent : ink2);
  const pts = trend === "down"
    ? [4,8,14,11,22,16,30,13,40,20,52,18,64,24,76,22,86,26]
    : trend === "flat"
    ? [4,18,14,15,22,19,30,16,40,18,52,15,64,19,76,16,86,17]
    : [4,24,14,20,22,23,30,16,40,18,52,12,64,15,76,9,86,6];
  const d = pts.reduce((a, v, i) => a + (i % 2 ? `${(v/30)*h} ` : `${i ? "L" : "M"}${(v/90)*w} `), "");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <path d={d} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Delta({ dir = "up", children }) {
  const good = dir === "up";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 2,
      font: "700 12px/1 'Kalam', cursive",
      color: good ? "#2f7d4f" : "#b4502f",
    }}>
      <span style={{ fontSize: 11 }}>{good ? "▲" : "▼"}</span>{children}
    </span>
  );
}

function Avatar({ size = 26, label }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      border: `1.5px solid ${ink}`, background: muted2,
      display: "flex", alignItems: "center", justifyContent: "center",
      font: `700 ${size*0.4}px 'Kalam', cursive`, color: ink2, flex: "none",
    }}>{label || ""}</div>
  );
}

function Kbd({ children }) {
  return (
    <span style={{
      border: `1.25px solid ${ink2}`, borderRadius: 4, padding: "1px 5px",
      font: "700 10px/1.3 'JetBrains Mono', monospace", color: ink2, background: paper,
    }}>{children}</span>
  );
}

// margin annotation — only renders when notes are on
function Note({ children, style = {}, arrow }) {
  const ctx = useContext(WFContext);
  if (!ctx.showNotes) return null;
  return (
    <div style={{
      font: "400 14px/1.25 'Caveat', cursive", color: noteColor,
      display: "flex", alignItems: "flex-start", gap: 4, ...style,
    }}>
      {arrow === "left" && <span style={{ fontSize: 18, lineHeight: 1 }}>↜</span>}
      <span>{children}</span>
      {arrow === "right" && <span style={{ fontSize: 18, lineHeight: 1 }}>↝</span>}
    </div>
  );
}

function NavItem({ name, label, active, collapsed, accentActive }) {
  const ctx = useContext(WFContext);
  const on = active;
  const useAccent = on && accentActive && ctx.accentOn;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: collapsed ? "8px" : "7px 10px",
      justifyContent: collapsed ? "center" : "flex-start",
      borderRadius: rr(0.6),
      background: on ? (useAccent ? accentBg : muted2) : "transparent",
      border: on ? `1.25px solid ${useAccent ? accent : ink}` : "1.25px solid transparent",
      color: useAccent ? accent : (on ? ink : ink2),
    }}>
      <Glyph name={name} size={collapsed ? 19 : 17} sw={on ? 2.2 : 1.8} />
      {!collapsed && <span style={{ font: `${on ? 700 : 500} 13px/1 'Kalam', cursive`, whiteSpace: "nowrap" }}>{label}</span>}
    </div>
  );
}

function Tile({ label, value, dir, delta, trend, accentTop }) {
  const ctx = useContext(WFContext);
  return (
    <Sketch style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8,
      borderTop: accentTop && ctx.accentOn ? `3px solid ${accent}` : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Bar w="50%" h={8} />
        {delta && <Delta dir={dir}>{delta}</Delta>}
      </div>
      <div style={{ font: "700 24px/1 'Kalam', cursive", color: ink, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <Spark w={120} h={26} trend={trend} />
    </Sketch>
  );
}

Object.assign(window, {
  WFContext, ink, ink2, muted, muted2, paper, accent, accentBg, noteColor, rr,
  Sketch, Bar, Lines, Pill, Btn, Glyph, Spark, Delta, Avatar, Kbd, Note, NavItem, Tile,
});
