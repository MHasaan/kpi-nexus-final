import type { Config } from 'tailwindcss';

/**
 * Tailwind preset for KPI Nexus. Wires CSS variables from `tokens.css` into
 * Tailwind's theme so utilities like `bg-surface-1`, `text-content-strong`,
 * `border-border-strong`, `text-status-critical`, `bg-chart-3` work app-wide.
 *
 * Apps extend this preset and add their own `content` globs.
 */
const preset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          bg: 'hsl(var(--surface-bg) / <alpha-value>)',
          1: 'hsl(var(--surface-1) / <alpha-value>)',
          2: 'hsl(var(--surface-2) / <alpha-value>)',
          hover: 'hsl(var(--surface-hover) / <alpha-value>)',
          pressed: 'hsl(var(--surface-pressed) / <alpha-value>)',
        },
        content: {
          strong: 'hsl(var(--content-strong) / <alpha-value>)',
          DEFAULT: 'hsl(var(--content-default) / <alpha-value>)',
          muted: 'hsl(var(--content-muted) / <alpha-value>)',
          disabled: 'hsl(var(--content-disabled) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'hsl(var(--border-default) / <alpha-value>)',
          strong: 'hsl(var(--border-strong) / <alpha-value>)',
          divider: 'hsl(var(--border-divider) / <alpha-value>)',
        },
        accent: {
          primary: 'hsl(var(--accent-primary) / <alpha-value>)',
          secondary: 'hsl(var(--accent-secondary) / <alpha-value>)',
        },
        status: {
          success: 'hsl(var(--status-success) / <alpha-value>)',
          warning: 'hsl(var(--status-warning) / <alpha-value>)',
          critical: 'hsl(var(--status-critical) / <alpha-value>)',
          info: 'hsl(var(--status-info) / <alpha-value>)',
          neutral: 'hsl(var(--status-neutral) / <alpha-value>)',
        },
        chart: {
          1: 'hsl(var(--chart-1) / <alpha-value>)',
          2: 'hsl(var(--chart-2) / <alpha-value>)',
          3: 'hsl(var(--chart-3) / <alpha-value>)',
          4: 'hsl(var(--chart-4) / <alpha-value>)',
          5: 'hsl(var(--chart-5) / <alpha-value>)',
          6: 'hsl(var(--chart-6) / <alpha-value>)',
          7: 'hsl(var(--chart-7) / <alpha-value>)',
          8: 'hsl(var(--chart-8) / <alpha-value>)',
          9: 'hsl(var(--chart-9) / <alpha-value>)',
          10: 'hsl(var(--chart-10) / <alpha-value>)',
          11: 'hsl(var(--chart-11) / <alpha-value>)',
          12: 'hsl(var(--chart-12) / <alpha-value>)',
        },
        ring: 'hsl(var(--ring) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
};

export default preset;
