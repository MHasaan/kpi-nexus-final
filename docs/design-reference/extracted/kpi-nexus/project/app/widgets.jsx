/* global React, Icon */
/* widgets.jsx — shared composites layered on the kit primitives.
   Loaded after lib.jsx + views.jsx (so PageHead/Delta exist), before the new view files.
   Exports: Tabs, SubNav, Seg, Progress, Avatar, Pill, KV, Field, Select, Toggle, EmptyState, SeverityChip */

const { useState: useStateW } = React;

function Tabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--c-border)', margin: '4px 0 18px', overflowX: 'auto' }}>
      {tabs.map((t) => (
        <button key={t} onClick={() => onChange && onChange(t)}
          style={{ height: 38, padding: '0 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            fontFamily: 'var(--font-sans)', color: value === t ? 'var(--c-strong)' : 'var(--c-muted)',
            borderBottom: value === t ? '2px solid hsl(var(--accent-primary))' : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap' }}>{t}</button>
      ))}
    </div>
  );
}

// pill-style sub navigation (route children)
function SubNav({ items, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 7, marginBottom: 16, flexWrap: 'wrap' }}>
      {items.map((t) => (
        <button key={t} onClick={() => onChange && onChange(t)}
          style={{ height: 30, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
            border: '1px solid ' + (value === t ? 'hsl(var(--accent-primary) / 0.4)' : 'var(--c-border)'),
            background: value === t ? 'var(--c-accent-bg)' : 'var(--c-surface-bg)',
            color: value === t ? 'hsl(var(--accent-primary))' : 'var(--c-default)' }}>{t}</button>
      ))}
    </div>
  );
}

// segmented control (inset well)
function Seg({ options, value, onChange, mono }) {
  return (
    <div style={{ display: 'inline-flex', padding: 3, borderRadius: 9, background: 'var(--c-surface-1)', boxShadow: 'var(--shadow-inset)', gap: 2 }}>
      {options.map((s) => (
        <button key={s} onClick={() => onChange && onChange(s)}
          style={{ height: 28, padding: '0 11px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', letterSpacing: mono ? '0.02em' : 0,
            background: value === s ? 'var(--c-surface-bg)' : 'transparent', color: value === s ? 'var(--c-strong)' : 'var(--c-muted)',
            boxShadow: value === s ? 'var(--shadow-xs)' : 'none' }}>{s}</button>
      ))}
    </div>
  );
}

function Progress({ pct, color, height = 7 }) {
  const c = color || 'hsl(var(--accent-primary))';
  return (
    <div style={{ height, borderRadius: 999, background: 'var(--c-surface-2)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: c, borderRadius: 999, transition: 'width var(--dur-slow) var(--ease-out)' }} />
    </div>
  );
}

const AV_COLORS = ['hsl(var(--chart-5))', 'hsl(var(--chart-1))', 'hsl(var(--chart-3))', 'hsl(var(--chart-7))', 'hsl(var(--chart-2))', 'hsl(var(--chart-10))'];
function Avatar({ name = '', size = 26, idx }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const color = AV_COLORS[(idx ?? name.length) % AV_COLORS.length];
  return (
    <div style={{ width: size, height: size, borderRadius: 999, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 600, flexShrink: 0 }}>{initials}</div>
  );
}

function Pill({ children, tone = 'neutral', mono, style }) {
  const tones = {
    neutral: { bg: 'var(--c-surface-2)', color: 'var(--c-default)' },
    accent: { bg: 'var(--c-accent-bg)', color: 'hsl(var(--accent-primary))' },
    success: { bg: 'var(--c-success-bg)', color: 'var(--c-success)' },
    warning: { bg: 'var(--c-warning-bg)', color: 'var(--c-warning)' },
    critical: { bg: 'var(--c-critical-bg)', color: 'var(--c-critical)' },
    info: { bg: 'var(--c-info-bg)', color: 'var(--c-info)' },
  }[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 8px', borderRadius: 6, background: tones.bg, color: tones.color,
      fontSize: 10.5, fontWeight: 600, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', letterSpacing: mono ? '0.02em' : 0, ...style }}>{children}</span>
  );
}

function KV({ k, v, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: '1px solid var(--c-divider)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--c-muted)' }}>{k}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-strong)', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );
}

function Field({ label, value, placeholder, mono, w, hint }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: w || '100%' }}>
      {label && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-default)' }}>{label}</span>}
      <div style={{ height: 36, display: 'flex', alignItems: 'center', padding: '0 11px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface-bg)' }}>
        <span style={{ fontSize: 13, color: value ? 'var(--c-strong)' : 'var(--c-muted)', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value || placeholder}</span>
      </div>
      {hint && <span style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>{hint}</span>}
    </label>
  );
}
function Select({ label, value, w }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, width: w || '100%' }}>
      {label && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-default)' }}>{label}</span>}
      <div style={{ height: 36, display: 'flex', alignItems: 'center', gap: 8, padding: '0 11px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface-bg)' }}>
        <span style={{ fontSize: 13, color: 'var(--c-strong)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
        <Icon name="chevron-down" size={14} style={{ color: 'var(--c-muted)' }} />
      </div>
    </label>
  );
}

function Toggle({ on }) {
  return (
    <span style={{ width: 36, height: 20, borderRadius: 999, background: on ? 'hsl(var(--accent-primary))' : 'var(--c-surface-pressed)', position: 'relative', display: 'inline-block', flexShrink: 0, transition: 'background var(--dur-fast)' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: 999, background: '#fff', boxShadow: 'var(--shadow-xs)', transition: 'left var(--dur-fast) var(--ease-out)' }} />
    </span>
  );
}

function EmptyState({ icon = 'inbox', title, sub, cta }) {
  return (
    <div style={{ padding: '56px 24px', textAlign: 'center' }}>
      <div className="kn-aura kn-aura-soft" style={{ display: 'inline-flex', width: 50, height: 50, borderRadius: 14, background: 'var(--gradient-brand-soft)', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--accent-primary))', marginBottom: 14 }}>
        <Icon name={icon} size={24} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--c-strong)' }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 5, maxWidth: 360, marginInline: 'auto', lineHeight: 1.5 }}>{sub}</div>
      {cta && <div style={{ marginTop: 16 }}>{cta}</div>}
    </div>
  );
}

const SEV_META = {
  HIGH: { tone: 'critical', icon: 'circle-alert' },
  MEDIUM: { tone: 'warning', icon: 'triangle-alert' },
  LOW: { tone: 'neutral', icon: 'info' },
};
function SeverityChip({ level }) {
  const m = SEV_META[level] || SEV_META.LOW;
  return <Pill tone={m.tone}><Icon name={m.icon} size={11} strokeWidth={2.5} />{level}</Pill>;
}

Object.assign(window, { Tabs, SubNav, Seg, Progress, Avatar, Pill, KV, Field, Select, Toggle, EmptyState, SeverityChip });
