import type { Config } from 'tailwindcss';

import preset from './tailwind.preset.js';

/** Storybook only: the app builds its own Tailwind config on top of the same preset. */
const config: Config = {
  presets: [preset as Config],
  content: ['./src/**/*.tsx', './.storybook/**/*.tsx'],
};

export default config;
