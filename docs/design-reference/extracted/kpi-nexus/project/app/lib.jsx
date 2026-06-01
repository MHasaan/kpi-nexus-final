/* global React */
const { useState, useEffect, useRef, createContext, useContext } = React;

/* ============================================================================
   Icon — renders Lucide icons from the UMD global (window.lucide), as inline
   SVG via innerHTML so there is no React/DOM reconciliation conflict.
   ============================================================================ */
function Icon({ name, size = 18, strokeWidth = 2, style, className }) {
  const pascal = name.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join('');
  const lib = window.lucide || {};
  const node = (lib.icons && lib.icons[pascal]) || lib[pascal];
  let inner = '';
  if (node) {
    // Lucide UMD icon node shape: ["svg", {attrs}, [ [tag, attrs], ... ]]
    const children = Array.isArray(node) && Array.isArray(node[2]) ? node[2] : Array.isArray(node) ? node : node.icon || [];
    inner = children
      .map(([tag, attrs]) => {
        const a = Object.entries(attrs || {})
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ');
        return `<${tag} ${a}></${tag}>`;
      })
      .join('');
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/* ============================================================================
   Primitives
   ============================================================================ */
function Button({ children, variant = 'primary', size = 'md', icon, iconRight, full, ...rest }) {
  const sizes = {
    sm: { height: 28, padding: '0 10px', fontSize: 12, gap: 6 },
    md: { height: 36, padding: '0 14px', fontSize: 13, gap: 7 },
    lg: { height: 44, padding: '0 20px', fontSize: 14, gap: 8 },
  }[size];
  const variants = {
    primary: { background: 'hsl(var(--accent-primary))', color: 'var(--c-on-accent)', border: '1px solid transparent', boxShadow: 'var(--shadow-sm)' },
    secondary: { background: 'var(--c-surface-bg)', color: 'var(--c-strong)', border: '1px solid var(--c-border-strong)' },
    ghost: { background: 'transparent', color: 'var(--c-default)', border: '1px solid transparent' },
    danger: { background: 'hsl(var(--status-critical))', color: '#fff', border: '1px solid transparent' },
  }[variant];
  return (
    <button
      {...rest}
      className={'kn-btn kn-btn-' + variant}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: sizes.gap,
        height: sizes.height, padding: sizes.padding, fontSize: sizes.fontSize, fontWeight: 600,
        fontFamily: 'var(--font-sans)', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
        width: full ? '100%' : 'auto', whiteSpace: 'nowrap', lineHeight: 1,
        transition: 'background var(--dur-fast) var(--ease-out), filter var(--dur-fast)', ...variants,
      }}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 14 : 16} />}
    </button>
  );
}

const STATUS_META = {
  'on-track': { label: 'On track', color: 'var(--c-success)', bg: 'var(--c-success-bg)', icon: 'check' },
  'at-risk': { label: 'At risk', color: 'var(--c-warning)', bg: 'var(--c-warning-bg)', icon: 'triangle-alert' },
  'off-track': { label: 'Off track', color: 'var(--c-critical)', bg: 'var(--c-critical-bg)', icon: 'circle-alert' },
  'no-data': { label: 'No data', color: 'var(--c-muted)', bg: 'var(--c-surface-2)', icon: 'minus' },
};
const SCOPE_META = {
  ORG_WIDE: { color: 'hsl(var(--accent-primary))', bg: 'var(--c-accent-bg)' },
  PER_UNIT: { color: 'hsl(var(--chart-10))', bg: 'hsl(var(--chart-10) / 0.14)' },
  PER_USER: { color: 'hsl(326 60% 48%)', bg: 'hsl(var(--chart-7) / 0.18)' },
};

function StatusBadge({ status, size = 'md' }) {
  const m = STATUS_META[status] || STATUS_META['no-data'];
  const h = size === 'sm' ? 20 : 24;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: h, padding: '0 9px', borderRadius: 999, background: m.bg, color: m.color, fontSize: size === 'sm' ? 10.5 : 11.5, fontWeight: 600 }}>
      <Icon name={m.icon} size={size === 'sm' ? 11 : 12} strokeWidth={2.5} />
      {m.label}
    </span>
  );
}
function ScopeBadge({ scope }) {
  const m = SCOPE_META[scope] || SCOPE_META.ORG_WIDE;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 7px', borderRadius: 5, background: m.bg, color: m.color, fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>
      {scope}
    </span>
  );
}

function Card({ children, style, hover, ...rest }) {
  return (
    <div
      {...rest}
      className={'kn-card' + (hover ? ' kn-card-hover' : '')}
      style={{ background: 'var(--c-surface-bg)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-sm)', ...style }}
    >
      {children}
    </div>
  );
}

/* ============================================================================
   Charts (SVG data-viz — not icons)
   ============================================================================ */
function Sparkline({ data, color = 'hsl(var(--accent-primary))', w = 120, h = 36, fill = true, fluid = false }) {
  const min = Math.min(...data), max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * w, h - 3 - ((d - min) / rng) * (h - 6)]);
  const line = pts.map((p) => p.join(',')).join(' ');
  const area = `${line} ${w},${h} 0,${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={fluid ? '100%' : w} height={h} preserveAspectRatio="none" style={{ display: 'block', width: fluid ? '100%' : undefined }}>
      {fill && <polyline points={area} fill={color} opacity="0.08" stroke="none" />}
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function LineChart({ series, w = 640, h = 240, showBand }) {
  const pad = { l: 38, r: 14, t: 14, b: 26 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const all = series.flatMap((s) => s.data).filter((v) => v != null && !Number.isNaN(v));
  const min = Math.min(...all, showBand ? Math.min(...showBand.lo) : Infinity);
  const max = Math.max(...all, showBand ? Math.max(...showBand.hi) : -Infinity);
  const rng = max - min || 1;
  const n = series[0].data.length;
  const x = (i) => pad.l + (i / (n - 1)) * iw;
  const y = (v) => pad.t + ih - ((v - min) / rng) * ih;
  const yticks = 4;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block', fontFamily: 'var(--font-mono)' }}>
      {Array.from({ length: yticks + 1 }, (_, i) => {
        const v = min + (rng * i) / yticks;
        const yy = y(v);
        return (
          <g key={i}>
            <line x1={pad.l} x2={w - pad.r} y1={yy} y2={yy} stroke="var(--c-divider)" strokeWidth="1" />
            <text x={pad.l - 7} y={yy + 3} textAnchor="end" fontSize="9" fill="var(--c-muted)">{Math.round(v)}</text>
          </g>
        );
      })}
      {showBand && (
        <polygon
          points={[...showBand.hi.map((v, i) => `${x(i)},${y(v)}`), ...showBand.lo.map((v, i) => `${x(i)},${y(v)}`).reverse()].join(' ')}
          fill="hsl(var(--accent-primary) / 0.12)" stroke="none"
        />
      )}
      {series.map((s, si) => {
        const pts = s.data.map((v, i) => [i, v]).filter(([, v]) => v != null && !Number.isNaN(v));
        if (!pts.length) return null;
        const line = pts.map(([i, v]) => `${x(i)},${y(v)}`).join(' ');
        const fi = pts[0][0], li = pts[pts.length - 1][0];
        return (
          <g key={si}>
            {s.fill && <polygon points={`${line} ${x(li)},${pad.t + ih} ${x(fi)},${pad.t + ih}`} fill={s.color} opacity="0.07" />}
            <polyline points={line} fill="none" stroke={s.color} strokeWidth={s.dashed ? 2 : 2.4} strokeDasharray={s.dashed ? '5 4' : 'none'} strokeLinejoin="round" strokeLinecap="round" />
            {s.markers && s.data.map((v, i) => s.markers.includes(i) && v != null ? <circle key={i} cx={x(i)} cy={y(v)} r="4" fill="hsl(var(--status-critical))" stroke="var(--c-surface-bg)" strokeWidth="1.5" /> : null)}
          </g>
        );
      })}
    </svg>
  );
}

function BarChart({ data, color = 'hsl(var(--accent-primary))', w = 640, h = 200 }) {
  const pad = { l: 34, r: 12, t: 12, b: 24 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const max = Math.max(...data.map((d) => d.v)) || 1;
  const bw = (iw / data.length) * 0.62;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block', fontFamily: 'var(--font-mono)' }}>
      {[0, 0.5, 1].map((t, i) => {
        const yy = pad.t + ih - t * ih;
        return <line key={i} x1={pad.l} x2={w - pad.r} y1={yy} y2={yy} stroke="var(--c-divider)" />;
      })}
      {data.map((d, i) => {
        const bh = (d.v / max) * ih;
        const cx = pad.l + (iw / data.length) * (i + 0.5);
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={pad.t + ih - bh} width={bw} height={bh} rx="3" fill={d.color || color} />
            <text x={cx} y={h - 8} textAnchor="middle" fontSize="9" fill="var(--c-muted)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ============================================================================
   Sample data
   ============================================================================ */
const sp = (a) => a;
const KPIS = [
  { id: 'mrr', name: 'Monthly recurring revenue', cat: 'Financial', scope: 'ORG_WIDE', type: 'Currency', value: '$284,910', delta: 12.4, up: true, status: 'on-track', target: '$300,000', spark: sp([210, 218, 222, 235, 240, 258, 262, 271, 285]), owner: 'Sara Chen' },
  { id: 'nrr', name: 'Net revenue retention', cat: 'Financial', scope: 'ORG_WIDE', type: 'Percentage', value: '111%', delta: 1.2, up: true, status: 'on-track', target: '110%', spark: sp([104, 106, 105, 108, 107, 109, 110, 110, 111]), owner: 'Sara Chen' },
  { id: 'churn', name: 'Logo churn rate', cat: 'Customer', scope: 'ORG_WIDE', type: 'Percentage', value: '3.8%', delta: 0.6, up: true, status: 'at-risk', target: '3.0%', spark: sp([2.9, 3.0, 3.1, 3.0, 3.3, 3.4, 3.5, 3.7, 3.8]), owner: 'Marcus Lee' },
  { id: 'active', name: 'Weekly active users', cat: 'Customer', scope: 'PER_UNIT', type: 'Number', value: '48,210', delta: 8.1, up: true, status: 'on-track', target: '50,000', spark: sp([39, 40, 41, 42, 43, 44, 46, 47, 48]), owner: 'Priya N.' },
  { id: 'nps', name: 'Net promoter score', cat: 'Customer', scope: 'ORG_WIDE', type: 'Number', value: '52', delta: 4, up: true, status: 'on-track', target: '50', spark: sp([44, 45, 46, 47, 48, 49, 50, 51, 52]), owner: 'Priya N.' },
  { id: 'cac', name: 'Customer acquisition cost', cat: 'Financial', scope: 'PER_UNIT', type: 'Currency', value: '$1,240', delta: 9.0, up: false, status: 'off-track', target: '$1,000', spark: sp([980, 1010, 1050, 1080, 1110, 1150, 1180, 1210, 1240]), owner: 'Marcus Lee' },
  { id: 'cycle', name: 'Sales cycle length', cat: 'Internal Process', scope: 'PER_UNIT', type: 'Number', value: '34 days', delta: 5.2, up: false, status: 'at-risk', target: '30 days', spark: sp([30, 31, 30, 32, 31, 33, 32, 34, 34]), owner: 'Devon R.' },
  { id: 'onb', name: 'Onboarding completion', cat: 'Learning & Growth', scope: 'PER_USER', type: 'Percentage', value: '—', delta: 0, up: true, status: 'no-data', target: '90%', spark: sp([0, 0, 0, 0, 0, 0, 0, 0, 0]), owner: 'You' },
];

const ACTIVITY = [
  { icon: 'pencil', who: 'Sara Chen', what: 'updated target on', obj: 'Monthly recurring revenue', t: '12m ago' },
  { icon: 'plus', who: 'Devon R.', what: 'created KPI', obj: 'Pipeline coverage ratio', t: '1h ago' },
  { icon: 'triangle-alert', who: 'Alert', what: 'fired on', obj: 'Logo churn rate', t: '2h ago' },
  { icon: 'check', who: 'Marcus Lee', what: 'approved target change for', obj: 'Customer acquisition cost', t: '3h ago' },
  { icon: 'message-square', who: 'Priya N.', what: 'commented on', obj: 'Net promoter score', t: '5h ago' },
];

const NAV = [
  { group: null, items: [{ id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' }] },
  { group: 'Analyze', items: [
    { id: 'kpis', label: 'KPIs', icon: 'target' },
    { id: 'dashboards', label: 'Dashboards', icon: 'bar-chart-3' },
    { id: 'alerts', label: 'Alerts', icon: 'bell', badge: 3 },
  ] },
  { group: 'Intelligence', items: [
    { id: 'insights', label: 'Insights', icon: 'sparkles' },
    { id: 'ask', label: 'Ask', icon: 'message-square' },
  ] },
  { group: 'Execute', items: [
    { id: 'okrs', label: 'OKRs', icon: 'flag' },
    { id: 'tasks', label: 'Tasks', icon: 'check-square' },
    { id: 'approvals', label: 'Approvals', icon: 'git-pull-request' },
    { id: 'reports', label: 'Reports', icon: 'file-text' },
  ] },
  { group: 'Organize', items: [
    { id: 'people', label: 'People & org', icon: 'users' },
    { id: 'integrations', label: 'Integrations', icon: 'plug' },
    { id: 'activity', label: 'Activity', icon: 'activity' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ] },
];

Object.assign(window, {
  Icon, Button, StatusBadge, ScopeBadge, Card, Sparkline, LineChart, BarChart,
  STATUS_META, SCOPE_META, KPIS, ACTIVITY, NAV,
  useState, useEffect, useRef,
});
