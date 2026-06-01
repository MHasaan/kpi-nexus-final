/* global React, Icon, Button, NAV */
const { useState: useStateS, useEffect: useEffectS, useRef: useRefS } = React;

/* ----------------------------- Sidebar ----------------------------------- */
function Sidebar({ view, setView, collapsed }) {
  return (
    <aside
      style={{
        width: collapsed ? 64 : 256, flexShrink: 0, height: '100%',
        background: 'var(--c-surface-1)', borderRight: '1px solid var(--c-border)',
        display: 'flex', flexDirection: 'column', transition: 'width var(--dur-base) var(--ease-out)',
      }}
    >
      {/* Brand / org switcher */}
      <div style={{ height: 56, display: 'flex', alignItems: 'center', gap: 9, padding: collapsed ? '0 0 0 16px' : '0 14px', flexShrink: 0 }}>
        <div className="kn-aura kn-aura-soft kn-sheen" style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'var(--shadow-sm)' }}>
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
            <path d="M7 24 L15 18 L21 21 L26 9" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="7" cy="24" r="2.4" fill="#fff" /><circle cx="15" cy="18" r="2.4" fill="#fff" /><circle cx="21" cy="21" r="2.4" fill="#fff" /><circle cx="26" cy="9" r="3" fill="#fff" />
          </svg>
        </div>
        {!collapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, overflow: 'hidden' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-strong)', letterSpacing: '-0.01em' }}>KPI Nexus</span>
            <span style={{ fontSize: 11, color: 'var(--c-muted)', whiteSpace: 'nowrap' }}>Northwind Inc.</span>
          </div>
        )}
        {!collapsed && <Icon name="chevrons-up-down" size={14} style={{ color: 'var(--c-muted)', marginLeft: 'auto' }} />}
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
        {NAV.map((sec, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            {!collapsed && sec.group && (
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--c-muted)', padding: '6px 10px 4px' }}>{sec.group}</div>
            )}
            {sec.items.map((it) => {
              const active = view === it.id;
              return (
                <button
                  key={it.id}
                  onClick={() => setView(it.id)}
                  title={it.label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', height: 34,
                    padding: collapsed ? '0' : '0 10px', justifyContent: collapsed ? 'center' : 'flex-start',
                    marginBottom: 2, borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: active ? 'var(--c-accent-bg)' : 'transparent',
                    color: active ? 'hsl(var(--accent-primary))' : 'var(--c-default)',
                    fontSize: 13, fontWeight: active ? 600 : 500, fontFamily: 'var(--font-sans)',
                    transition: 'background var(--dur-fast)',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--c-surface-hover)'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Icon name={it.icon} size={17} strokeWidth={active ? 2.3 : 2} />
                  {!collapsed && <span>{it.label}</span>}
                  {!collapsed && it.badge && (
                    <span style={{ marginLeft: 'auto', background: 'hsl(var(--status-critical))', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>{it.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* user menu */}
      <div style={{ borderTop: '1px solid var(--c-border)', padding: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: collapsed ? 0 : '4px 6px', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: 'hsl(var(--chart-5))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>AM</div>
          {!collapsed && (
            <div style={{ lineHeight: 1.2, overflow: 'hidden' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-strong)', whiteSpace: 'nowrap' }}>Alex Morgan</div>
              <div style={{ fontSize: 11, color: 'var(--c-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>alex@northwind.io</div>
            </div>
          )}
          {!collapsed && <Icon name="ellipsis-vertical" size={15} style={{ color: 'var(--c-muted)', marginLeft: 'auto' }} />}
        </div>
      </div>
    </aside>
  );
}

/* ----------------------------- Header ------------------------------------ */
function Header({ title, crumbs, theme, toggleTheme, onSearch, onToggleSidebar }) {
  return (
    <header
      style={{
        height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 18px', borderBottom: '1px solid var(--c-border)',
        background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)',
        position: 'sticky', top: 0, zIndex: 20,
      }}
    >
      <button onClick={onToggleSidebar} className="kn-iconbtn" style={iconBtn}>
        <Icon name="panel-left" size={18} />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        {crumbs && crumbs.map((c, i) => (
          <React.Fragment key={i}>
            <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>{c}</span>
            <Icon name="chevron-right" size={13} style={{ color: 'var(--c-disabled)' }} />
          </React.Fragment>
        ))}
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-strong)', whiteSpace: 'nowrap' }}>{title}</span>
      </div>

      <button
        onClick={onSearch}
        style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 9, height: 34, width: 260,
          padding: '0 10px 0 12px', borderRadius: 8, border: '1px solid var(--c-border)',
          background: 'var(--c-surface-1)', boxShadow: 'var(--shadow-inset)', cursor: 'pointer',
          color: 'var(--c-muted)', fontSize: 13, fontFamily: 'var(--font-sans)',
        }}
      >
        <Icon name="search" size={15} />
        <span>Search…</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--c-surface-bg)', border: '1px solid var(--c-border)', borderRadius: 4, padding: '1px 5px' }}>⌘K</span>
      </button>

      <button className="kn-iconbtn" style={iconBtn} title="Notifications">
        <Icon name="bell" size={18} />
        <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 999, background: 'hsl(var(--status-critical))', border: '1.5px solid var(--c-surface-bg)' }} />
      </button>
      <button className="kn-iconbtn" style={iconBtn} title="Mentions"><Icon name="at-sign" size={18} /></button>
      <button onClick={toggleTheme} className="kn-iconbtn" style={iconBtn} title="Toggle theme">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
      </button>
    </header>
  );
}
const iconBtn = {
  position: 'relative', width: 34, height: 34, borderRadius: 8, border: 'none', background: 'transparent',
  color: 'var(--c-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  transition: 'background var(--dur-fast), color var(--dur-fast)',
};

/* -------------------------- Command palette ------------------------------ */
function CommandPalette({ open, onClose, setView }) {
  const [q, setQ] = useStateS('');
  const inputRef = useRefS(null);
  useEffectS(() => { if (open && inputRef.current) inputRef.current.focus(); if (open) setQ(''); }, [open]);
  if (!open) return null;
  const groups = [
    { h: 'KPIs', items: KPIS.slice(0, 4).map((k) => ({ icon: 'target', label: k.name, sub: k.value, go: 'kpis' })) },
    { h: 'Navigate', items: [
      { icon: 'layout-dashboard', label: 'Go to Dashboard', go: 'dashboard' },
      { icon: 'bar-chart-3', label: 'Go to Dashboards', go: 'dashboards' },
      { icon: 'message-square', label: 'Ask a question', go: 'ask' },
    ] },
  ];
  const ql = q.toLowerCase();
  const filtered = groups.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(ql)) })).filter((g) => g.items.length);
  return (
    <div onClick={onClose} className="kn-fade" style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'hsl(240 10% 10% / 0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', animation: 'knFadeIn var(--dur-base) var(--ease-out) both' }}>
      <div onClick={(e) => e.stopPropagation()} className="kn-pop" style={{ width: 560, maxWidth: '92vw', borderRadius: 14, overflow: 'hidden', background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', border: '1px solid var(--c-border)', boxShadow: 'var(--shadow-pop)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', borderBottom: '1px solid var(--c-divider)' }}>
          <Icon name="search" size={18} style={{ color: 'var(--c-muted)' }} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search KPIs, dashboards, people…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--c-strong)', fontFamily: 'var(--font-sans)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--c-muted)', border: '1px solid var(--c-border)', borderRadius: 4, padding: '1px 6px' }}>ESC</span>
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: 7 }}>
          {filtered.length === 0 && <div style={{ padding: '28px 14px', textAlign: 'center', color: 'var(--c-muted)', fontSize: 13 }}>No results for “{q}”</div>}
          {filtered.map((g, gi) => (
            <div key={gi}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-muted)', padding: '8px 10px 4px' }}>{g.h}</div>
              {g.items.map((it, ii) => (
                <button key={ii} onClick={() => { setView(it.go); onClose(); }} className="kn-cmd-item"
                  style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', height: 38, padding: '0 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--c-default)', fontSize: 13.5, fontFamily: 'var(--font-sans)', textAlign: 'left' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--c-accent-bg)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Icon name={it.icon} size={16} style={{ color: 'var(--c-muted)' }} />
                  <span style={{ color: 'var(--c-strong)' }}>{it.label}</span>
                  {it.sub && <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--c-muted)' }}>{it.sub}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar, Header, CommandPalette });
