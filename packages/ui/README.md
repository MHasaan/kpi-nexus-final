# @kpi-nexus/ui

KPI Nexus design system: tokens (`tokens.css`), the Tailwind preset, `cn()`, and the UI primitives in `src/components/`.

```bash
pnpm --filter @kpi-nexus/ui storybook        # http://localhost:6006
pnpm --filter @kpi-nexus/ui storybook:build  # static build in storybook-static/
```

Every exported component needs a story (`src/components/*.stories.tsx`, as the story's `component` or one of its `subcomponents`); `stories.spec.tsx` fails otherwise and renders every story. The web app imports components from `@kpi-nexus/ui` (or its `@/components/ui` re-export).
