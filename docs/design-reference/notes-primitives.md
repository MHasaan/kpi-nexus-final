# Primitives — Shared UI Kit (notes)

Built the reusable component library translating `app/lib.jsx` + the PageHead/Delta/StatTile
from `app/views.jsx` into typed Tailwind + design-token components. All token CLASS names used
exist in `packages/ui/tailwind.preset.ts` (verified against the live preset, NOT invented).

All components: presentational, reusable, TS strict (no `any` without comment), `cn()` from
`@/lib/cn`, `forwardRef` where DOM refs help, 8px grid, `tabular-nums` for numbers, uppercase
eyebrow labels (reuse `.kn-eyebrow` from globals.css). Server-component-safe except where
`'use client'` is noted. Match design's mapping (STATUS_META/SCOPE_META) from lib.jsx.

## Token classes actually used (from preset)

- Surfaces: `bg-surface-bg` (cards/inputs), `bg-surface-1`/`bg-surface-2`, `hover:bg-surface-hover`.
- Text: `text-content-strong`, `text-content` (DEFAULT), `text-content-muted`.
- Borders: `border-border`, `border-border-strong`, `border-border-divider`.
- Accent: `bg-accent-primary`, `text-accent-primary`, `bg-accent-bg`, `bg-gradient-brand-soft`.
- Status: `text-status-success`, `text-status-warning`, `text-status-critical` (NOT "error"),
  `text-status-info`, `text-status-neutral` + matching `bg-status-*-bg`.
- Charts: `text-chart-7`/`text-chart-10` (scope pills), `hsl(var(--chart-N))` in SVG.
- Focus ring: `ring-ring` (token), radii `rounded-md/lg/xl/2xl/full`, shadows `shadow-xs/sm/md/inset`.
- CSS-var-driven charts use `hsl(var(--accent-primary))`, `hsl(var(--status-critical))`,
  `var(--c-surface-bg)` so they are theme-aware (light+dark via next-themes `.dark`).

## Helper

| File | Export | Notes |
|---|---|---|
| `apps/web/src/lib/cn.ts` | `cn(...inputs: ClassValue[]): string` | `twMerge(clsx(inputs))`. NOTE: `cn.spec.ts` imports `cn` from `@kpi-nexus/ui` (already exists in `packages/ui/src/index.ts`), not from this local file — both are identical impls. This local `@/lib/cn` is what the primitives import. |

## UI components — `apps/web/src/components/ui/`

| File | Export(s) | Props / variants |
|---|---|---|
| `button.tsx` | `Button` (forwardRef) | `variant`: primary(accent+shadow+hover brightness) \| secondary(surface-bg+border-strong) \| ghost(transparent+hover surface-hover) \| danger(status-critical); `size`: sm(h-8) \| md(h-10) \| lg(h-12); `isLoading` (spinner + disabled + aria-busy), `leftIcon`, `rightIcon`. Focus `ring-ring`. |
| `card.tsx` | `Card` (forwardRef, `as` prop), `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` | Card = `bg-surface-bg border border-border rounded-xl shadow-sm`. Header `px-4 py-3.5 border-b border-border-divider`; Title `text-sm font-semibold`; Content `p-4`; Footer `border-t`. |
| `badge.tsx` | `Badge` (forwardRef) | `tone`: neutral \| info \| success \| warning \| error(→status-critical). rounded-full px-2.5 py-0.5 text-xs. Exports `BadgeTone`. |
| `status-badge.tsx` | `StatusBadge` | `status`: on-track(check/success) \| at-risk(triangle-alert/warning) \| off-track(octagon-x/critical) \| no-data(circle-dashed/neutral). lucide icon + label, never colour-only. Builds on `Badge`. Exports `KpiStatus`. |
| `scope-badge.tsx` | `ScopeBadge` | `scope`: ORG_WIDE(accent) \| PER_UNIT(chart-10) \| PER_USER(chart-7/pink). `font-mono` pill, descriptive aria-label. Exports `KpiScope`. |
| `delta.tsx` | `Delta` | `value` (number\|null), optional `pct`. ▲ green(status-success) >0 / ▼ red(status-critical) <0 / "—" muted if 0 or null. tabular-nums, font-semibold, directional aria-label. |
| `metric.tsx` | `Metric` | `value`, `unit?`, `label?` (eyebrow via `.kn-eyebrow`), `size`: sm \| md \| lg. Big tabular value, tracking-tight. |
| `stat-tile.tsx` | `StatTile` | `label` (eyebrow) + `value`/`unit` + `delta`/`deltaPct` (Delta) + `trend` (fluid Sparkline). `kn-card-hover`. Mirrors views.jsx StatTile. |
| `page-header.tsx` | `PageHeader` | `title`, `subtitle?`, `eyebrow?`, `actions?`. title `text-2xl font-bold tracking-tight`, responsive flex. |
| `input.tsx` | `Input` (forwardRef), `inputBase` | h-9, `bg-surface-bg border-border`, focus `ring-ring`, rounded-md, aria-invalid → status-critical. |
| `select.tsx` | `Select` (forwardRef) | Native select + custom lucide ChevronDown. Matches input styling. |
| `textarea.tsx` | `Textarea` (forwardRef) | rows default 4, same styling family as Input. |
| `label.tsx` | `Label` (forwardRef) | `required?` adds a status-critical `*` marker. |
| `table.tsx` | `Table`, `TableHeader` (`sticky?`), `TableBody` (`zebra?`), `TableRow`, `TableHead`, `TableCell` (all forwardRef) | Header `bg-surface-1` uppercase muted; rows `border-border-divider hover:bg-surface-hover`. Horizontal-scroll wrapper. |
| `tabs.tsx` (`'use client'`) | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Controlled (`value` + `onValueChange`). Underline active = `border-accent-primary text-content-strong`. role=tablist/tab/tabpanel. |
| `avatar.tsx` (`'use client'`) | `Avatar` | `src?`, `name`, `size`: sm \| md \| lg. `bg-accent-bg text-accent-primary` initials fallback on error/absence. |
| `empty-state.tsx` | `EmptyState` | `icon?` (LucideIcon in `bg-gradient-brand-soft` aura tile), `title`, `description?`, `action?`. Centered. Mirrors StubView aura. |
| `skeleton.tsx` | `Skeleton` | `animate-pulse bg-surface-2 rounded-md`. Spreads div attrs for sizing. |
| `segmented.tsx` (`'use client'`) | `Segmented<T extends string>` | `options`, `value`, `onChange`. Track `bg-surface-1 shadow-inset`; active = `bg-surface-bg shadow-xs`. role=radiogroup/radio. Mirrors KpisView scope filter. |
| `index.ts` | barrel | Re-exports every component + its public types. |

## Charts — `apps/web/src/components/charts/`

SVG math ported from `lib.jsx`. Theme-aware via `hsl(var(--…))` / `var(--c-…)`. Each chart
`role="img"` + descriptive `aria-label`.

| File | Export(s) | Notes |
|---|---|---|
| `sparkline.tsx` | `Sparkline` | `data`, `width`/`height`, `stroke`, `fluid` (scales to container via viewBox + non-scaling stroke). |
| `line-chart.tsx` | `LineChart` | `series: LineSeries[]` (each `data`, `color?`, `dashed?`). `forecast: ForecastBand` (yhat + lower/upper confidence band → shaded polygon `accent-primary/0.12` + dashed yhat line — matches forecast-full.png). `anomalies: Anomaly[]` (status-critical markers w/ `<title>`). Exports `LineSeries`, `ForecastBand`, `Anomaly`. |
| `bar-chart.tsx` | `BarChart` | `data: BarDatum[]` (`label`, `value`, `color?`). Per-bar `<title>`. Exports `BarDatum`. |
| `index.ts` | barrel | Re-exports charts + types. |

## Verification

- `npx tsc --noEmit`: **EXIT 0** (full run, PowerShell). Grep-filtered run for new files: zero errors.
- No stale/invented token classes remain in `components/ui/*` or `components/charts/*`
  (grepped for content-1/2/3, surface-3, status-error, surface-0, shadow-card, ring-accent-primary — none).
- `cn.spec.ts` continues to pass (imports `cn` from `@kpi-nexus/ui`, untouched).

## Downstream usage

- Barrels: `import { Button, Card, StatTile, StatusBadge, ScopeBadge } from '@/components/ui';`
  and `import { LineChart, BarChart, Sparkline } from '@/components/charts';`.
- Permission gating stays in `components/auth/{permission-guard,require-permission}.tsx` — these
  primitives are presentational only and impose no permission logic.
- `bg-gradient-brand` / `bg-gradient-brand-soft` ARE defined in the preset — safe to use.
