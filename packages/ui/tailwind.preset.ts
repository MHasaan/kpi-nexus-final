import type { Config } from 'tailwindcss';

/**
 * Tailwind preset for KPI Nexus. Wires CSS variables from `tokens.css` into
 * Tailwind's theme so utilities like `bg-surface-1`, `text-content-strong`,
 * `border-border-strong`, `text-status-critical`, `bg-status-success-bg`,
 * `bg-accent-bg`, `rounded-xl`, and `shadow-md` work app-wide.
 *
 * Apps extend this preset and add their own `content` globs.
 *
 * Color utilities use the raw HSL channels with `<alpha-value>` so opacity
 * modifiers (e.g. `bg-accent-primary/10`) work. The `*-bg` tints are finished
 * colors (fixed alpha) for status/accent surfaces.
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
          DEFAULT: 'hsl(var(--accent-primary) / <alpha-value>)',
          primary: 'hsl(var(--accent-primary) / <alpha-value>)',
          secondary: 'hsl(var(--accent-secondary) / <alpha-value>)',
          bg: 'hsl(var(--accent-primary) / 0.12)',
        },
        status: {
          success: {
            DEFAULT: 'hsl(var(--status-success) / <alpha-value>)',
            bg: 'hsl(var(--status-success) / 0.12)',
          },
          warning: {
            DEFAULT: 'hsl(var(--status-warning) / <alpha-value>)',
            bg: 'hsl(var(--status-warning) / 0.14)',
          },
          critical: {
            DEFAULT: 'hsl(var(--status-critical) / <alpha-value>)',
            bg: 'hsl(var(--status-critical) / 0.12)',
          },
          info: {
            DEFAULT: 'hsl(var(--status-info) / <alpha-value>)',
            bg: 'hsl(var(--status-info) / 0.12)',
          },
          neutral: {
            DEFAULT: 'hsl(var(--status-neutral) / <alpha-value>)',
            bg: 'hsl(var(--status-neutral) / 0.12)',
          },
          /* Aliases — directional sense for deltas/trends. `positive` also
             back-fills pre-existing `text-status-positive` usages. */
          positive: {
            DEFAULT: 'hsl(var(--status-success) / <alpha-value>)',
            bg: 'hsl(var(--status-success) / 0.12)',
          },
          negative: {
            DEFAULT: 'hsl(var(--status-critical) / <alpha-value>)',
            bg: 'hsl(var(--status-critical) / 0.12)',
          },
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
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        pop: 'var(--shadow-pop)',
        inset: 'var(--shadow-inset)',
      },
      ringColor: {
        DEFAULT: 'hsl(var(--ring) / <alpha-value>)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
      },
      transitionDuration: {
        fast: '120ms',
        base: '180ms',
        slow: '240ms',
      },
      backgroundImage: {
        'gradient-brand': 'var(--gradient-brand)',
        'gradient-brand-soft': 'var(--gradient-brand-soft)',
      },
    },
  },
};

export default preset;
