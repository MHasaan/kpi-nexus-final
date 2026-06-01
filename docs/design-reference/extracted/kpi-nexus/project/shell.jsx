/* shell.jsx — shared app-shell + composites for the full KPI Nexus wireframe set.
   Depends on wireframe-kit.jsx (Sketch, Bar, Lines, Pill, Btn, Glyph, Spark, Delta, Avatar, Kbd, NavItem, Tile, WFContext, colors).
   Exports to window: AppShell, PageHead, Toolbar, Seg, Tabs, Table, EmptyState, Field, Select,
   Textarea, Banner, KV, StepRail, AuthCard, SectionLabel, MiniCard */

const SH_NAV = [
  { group: null, items: [["home", "Home"]] },
  { group: "Measure", items: [["target", "KPIs"], ["chart", "Dashboards"], ["bell", "Alerts"]] },
  { group: "Intelligence", items: [["sparkles", "AI"], ["flag", "OKRs"], ["check", "Tasks"], ["git", "Approvals"]] },
  { group: "Org", items: [["doc", "Reports"], ["users", "People & Org"], ["plug", "Integrations"], ["activity", "Activity"]] },
];

function ShOrgSwitch({ collapsed }) {
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

function ShSidebar({ active, rail }) {
  const collapsed = !!rail;
  const W = collapsed ? 64 : 230;
  return (
    <div style={{ width: W, flex: "none", borderRight: `1.5px solid ${ink}`, background: "#f7f6f2",
      display: "flex", flexDirection: "column", padding: collapsed ? "12px 8px" : 12, gap: 10 }}>
      <ShOrgSwitch collapsed={collapsed} />
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 2, flex: 1, overflow: "hidden" }}>
        {SH_NAV.map((grp, gi) => (
          <div key={gi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {!collapsed && grp.group && (
              <div style={{ font: "700 9.5px/1 'Kalam', cursive", letterSpacing: ".8px", textTransform: "uppercase", color: ink2, padding: "2px 10px 3px" }}>{grp.group}</div>
            )}
            {grp.items.map(([n, l], i) => (
              <NavItem key={i} name={n} label={l} active={l === active} collapsed={collapsed} accentActive />
            ))}
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1.5px dashed ${muted}`, paddingTop: 10, display: "flex", alignItems: "center", gap: 9, justifyContent: collapsed ? "center" : "flex-start" }}>
        <Avatar size={26} label="SK" />
        {!collapsed && <div style={{ flex: 1 }}><Bar w="60%" h={8} dark /><div style={{ height: 4 }} /><Bar w="80%" h={6} /></div>}
        {!collapsed && <NavItem name="gear" label="" active={active === "Settings"} collapsed accentActive />}
      </div>
    </div>
  );
}

function ShHeader({ crumb }) {
  const parts = Array.isArray(crumb) ? crumb : ["Acme Inc", crumb];
  return (
    <div style={{ height: 52, flex: "none", borderBottom: `1.5px solid ${ink}`, background: paper,
      display: "flex", alignItems: "center", gap: 12, padding: "0 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, font: "700 13px/1 'Kalam', cursive", color: ink }}>
        {parts.map((p, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: muted }}>/</span>}
            <span style={{ color: i < parts.length - 1 ? ink2 : ink, fontWeight: i < parts.length - 1 ? 500 : 700 }}>{p}</span>
          </React.Fragment>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <Sketch r={0.6} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", minWidth: 190, background: "#f3f2ee", boxShadow: "inset 1px 1px 0 rgba(51,49,46,0.06)" }}>
        <Glyph name="search" size={14} color={ink2} /><Bar w="50%" h={7} /><div style={{ flex: 1 }} /><Kbd>⌘K</Kbd>
      </Sketch>
      <div style={{ position: "relative" }}>
        <Glyph name="bell" size={18} color={ink} />
        <span style={{ position: "absolute", top: -4, right: -5, width: 13, height: 13, borderRadius: 999, background: noteColor, color: "#fff", font: "700 8px/13px 'Kalam',cursive", textAlign: "center" }}>3</span>
      </div>
      <Glyph name="msg" size={18} color={ink} />
      <Avatar size={28} label="SK" />
    </div>
  );
}

// full page frame: sidebar + header + scroll-clipped content
function AppShell({ active, crumb, rail, children, pad = 20, bg = paper }) {
  return (
    <div style={{ display: "flex", height: "100%", background: paper, font: "13px 'Kalam', cursive", color: ink }}>
      <ShSidebar active={active} rail={rail} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <ShHeader crumb={crumb} />
        <div style={{ flex: 1, overflow: "hidden", padding: pad, background: bg, minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}

function PageHead({ title, badge, sub, actions, sub2 }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ font: "700 21px/1.1 'Kalam', cursive", color: ink, whiteSpace: "nowrap" }}>{title}</div>
          {badge}
        </div>
        {sub && <div style={{ font: "15px/1.3 'Caveat', cursive", color: ink2, marginTop: 3 }}>{sub}</div>}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "none" }}>{actions}</div>
    </div>
  );
}

function SectionLabel({ children, style = {} }) {
  return <div style={{ font: "700 11px/1 'Kalam', cursive", letterSpacing: ".6px", textTransform: "uppercase", color: ink2, marginBottom: 10, ...style }}>{children}</div>;
}

// underline tab bar
function Tabs({ items, active }) {
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: `1.5px solid ${ink}`, marginBottom: 16 }}>
      {items.map((t, i) => {
        const on = (active ?? 0) === i || active === t;
        return (
          <div key={i} style={{ font: `${on ? 700 : 500} 13px/1 'Kalam', cursive`, color: on ? ink : ink2,
            padding: "8px 12px", borderBottom: on ? `2.5px solid ${useCtxAccent()}` : "2.5px solid transparent", position: "relative", top: 1.5, whiteSpace: "nowrap" }}>{t}</div>
        );
      })}
    </div>
  );
}
function useCtxAccent() { const c = React.useContext(WFContext); return c.accentOn ? accent : ink; }

// segmented control
function Seg({ items, active = 0 }) {
  return (
    <Sketch r={0.6} style={{ display: "inline-flex", padding: 3, gap: 2, background: "#f3f2ee", boxShadow: "inset 1px 1px 0 rgba(51,49,46,0.06)" }}>
      {items.map((t, i) => (
        <span key={i} style={{ font: `${i === active ? 700 : 500} 12px/1 'Kalam', cursive`, color: i === active ? ink : ink2,
          padding: "5px 11px", borderRadius: 6, background: i === active ? paper : "transparent", border: i === active ? `1.25px solid ${ink}` : "1.25px solid transparent", whiteSpace: "nowrap" }}>{t}</span>
      ))}
    </Sketch>
  );
}

function Toolbar({ left, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>{left}</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{right}</div>
    </div>
  );
}

// generic sketch data table. cols:[{label,w,align}], rows:[[cell,...]]
function Table({ cols, rows, dense }) {
  const tmpl = cols.map(c => c.w || "1fr").join(" ");
  return (
    <Sketch style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: tmpl, gap: 8, padding: dense ? "7px 12px" : "9px 13px", background: "#f3f2ee", borderBottom: `1.5px solid ${ink}`,
        font: "700 10px/1 'Kalam', cursive", textTransform: "uppercase", letterSpacing: ".4px", color: ink2 }}>
        {cols.map((c, i) => <span key={i} style={{ textAlign: c.align || "left" }}>{c.label}</span>)}
      </div>
      {rows.map((r, ri) => (
        <div key={ri} style={{ display: "grid", gridTemplateColumns: tmpl, gap: 8, padding: dense ? "7px 12px" : "10px 13px", alignItems: "center",
          borderTop: ri ? `1px solid ${muted2}` : "none", fontVariantNumeric: "tabular-nums" }}>
          {r.map((cell, ci) => (
            <div key={ci} style={{ textAlign: cols[ci].align || "left", minWidth: 0, font: "13px/1.2 'Kalam', cursive", color: ink,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: cols[ci].wrap ? "normal" : "nowrap" }}>{cell}</div>
          ))}
        </div>
      ))}
    </Sketch>
  );
}

function EmptyState({ icon = "target", title, sub, cta }) {
  return (
    <Sketch style={{ padding: "44px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10, borderStyle: "dashed" }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, border: `1.5px solid ${ink}`, background: muted2, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Glyph name={icon} size={24} color={ink2} />
      </div>
      <div style={{ font: "700 16px/1.2 'Kalam', cursive", color: ink }}>{title}</div>
      <div style={{ font: "15px/1.3 'Caveat', cursive", color: ink2, maxWidth: 320 }}>{sub}</div>
      {cta && <div style={{ marginTop: 4 }}>{cta}</div>}
    </Sketch>
  );
}

function Field({ label, w = "100%", hint, value, mono, ph }) {
  return (
    <div style={{ width: w, display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <span style={{ font: "600 11.5px/1 'Kalam', cursive", color: ink2 }}>{label}</span>}
      <Sketch r={0.6} style={{ height: 34, display: "flex", alignItems: "center", padding: "0 10px", boxShadow: "inset 1px 1px 0 rgba(51,49,46,0.05)" }}>
        {value ? <span style={{ font: `${mono ? "12px 'JetBrains Mono', monospace" : "13px 'Kalam', cursive"}`, color: ink }}>{value}</span> : <Bar w={ph || "55%"} h={7} />}
      </Sketch>
      {hint && <span style={{ font: "13px/1.2 'Caveat', cursive", color: ink2 }}>{hint}</span>}
    </div>
  );
}
function Select({ label, w = "100%", value }) {
  return (
    <div style={{ width: w, display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <span style={{ font: "600 11.5px/1 'Kalam', cursive", color: ink2 }}>{label}</span>}
      <Sketch r={0.6} style={{ height: 34, display: "flex", alignItems: "center", padding: "0 10px", gap: 8 }}>
        {value ? <span style={{ font: "13px 'Kalam', cursive", color: ink }}>{value}</span> : <Bar w="45%" h={7} />}
        <div style={{ flex: 1 }} /><Glyph name="chevron" size={13} color={ink2} />
      </Sketch>
    </div>
  );
}
function Textarea({ label, h = 90, lines = 4 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && <span style={{ font: "600 11.5px/1 'Kalam', cursive", color: ink2 }}>{label}</span>}
      <Sketch r={0.6} style={{ height: h, padding: 11, boxShadow: "inset 1px 1px 0 rgba(51,49,46,0.05)" }}><Lines n={lines} last="40%" /></Sketch>
    </div>
  );
}

function Banner({ kind = "info", children }) {
  const map = { info: ["#0b84c6", "#e2f1fb", "sparkles"], warning: ["#7a5b12", "#f8efd6", "bell"], critical: ["#b4502f", "#f7e2da", "bell"], success: ["#2f7d4f", "#dff0e4", "check"] };
  const [c, bg, ic] = map[kind];
  return (
    <Sketch style={{ padding: "10px 13px", display: "flex", alignItems: "center", gap: 10, background: bg, borderColor: c, borderLeft: `4px solid ${c}` }}>
      <Glyph name={ic} size={16} color={c} />
      <div style={{ font: "600 13px/1.3 'Kalam', cursive", color: ink, flex: 1 }}>{children}</div>
    </Sketch>
  );
}

function KV({ k, v, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: `1px dashed ${muted2}` }}>
      <span style={{ font: "600 12px/1.2 'Kalam', cursive", color: ink2 }}>{k}</span>
      <span style={{ font: mono ? "12px 'JetBrains Mono', monospace" : "600 12.5px 'Kalam', cursive", color: ink, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}

function StepRail({ steps, active = 0 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {steps.map((s, i) => {
        const on = i === active, done = i < active, acc = useCtxAccent();
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
            background: on ? (useCtxAccentBg()) : "transparent", border: on ? `1.25px solid ${acc}` : "1.25px solid transparent" }}>
            <div style={{ width: 22, height: 22, borderRadius: 999, flex: "none", border: `1.5px solid ${done || on ? acc : ink}`, background: done ? acc : paper,
              display: "flex", alignItems: "center", justifyContent: "center", font: "700 11px 'Kalam',cursive", color: done ? "#fff" : (on ? acc : ink2) }}>
              {done ? "✓" : i + 1}
            </div>
            <span style={{ font: `${on ? 700 : 500} 13px/1.1 'Kalam', cursive`, color: on ? ink : ink2 }}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}
function useCtxAccentBg() { const c = React.useContext(WFContext); return c.accentOn ? accentBg : muted2; }

// centered auth card (no shell)
function AuthCard({ title, sub, children, footer, w = 380 }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#efece4", font: "'Kalam', cursive", padding: 24 }}>
      <div style={{ width: w, display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, justifyContent: "center" }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: useCtxAccent(), display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Glyph name="activity" size={16} color="#fff" />
          </div>
          <span style={{ font: "800 17px/1 'Kalam', cursive", color: ink }}>KPI Nexus</span>
        </div>
        <Sketch style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ font: "700 18px/1.1 'Kalam', cursive", color: ink }}>{title}</div>
            {sub && <div style={{ font: "15px/1.3 'Caveat', cursive", color: ink2, marginTop: 3 }}>{sub}</div>}
          </div>
          {children}
        </Sketch>
        {footer && <div style={{ textAlign: "center", font: "14px/1.3 'Caveat', cursive", color: ink2 }}>{footer}</div>}
      </div>
    </div>
  );
}

function MiniCard({ icon, title, children, foot, accentTop }) {
  const acc = useCtxAccent();
  return (
    <Sketch style={{ padding: 13, display: "flex", flexDirection: "column", gap: 9, borderTop: accentTop ? `3px solid ${acc}` : undefined }}>
      {(icon || title) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon && <Glyph name={icon} size={15} color={ink2} />}
          <div style={{ font: "700 13px/1 'Kalam', cursive", color: ink }}>{title}</div>
        </div>
      )}
      {children}
      {foot}
    </Sketch>
  );
}

Object.assign(window, {
  SH_NAV, AppShell, PageHead, Toolbar, Seg, Tabs, Table, EmptyState, Field, Select, Textarea,
  Banner, KV, StepRail, AuthCard, SectionLabel, MiniCard, useCtxAccent, useCtxAccentBg,
});
