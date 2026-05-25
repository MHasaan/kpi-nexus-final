import type { Config } from 'tailwindcss';
import uiPreset from '@kpi-nexus/ui/tailwind-preset';

const config: Config = {
  presets: [uiPreset as Config],
  content: [
    './src/**/*.{ts,tsx,js,jsx,md,mdx}',
    './node_modules/@kpi-nexus/ui/dist/**/*.{js,mjs}',
  ],
};

export default config;
