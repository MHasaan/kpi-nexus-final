import type { Decorator, Preview } from '@storybook/react-vite';

import './preview.css';

/** Applies the toolbar's theme the way next-themes does in the app: a `.dark` class on <html>. */
const withTheme: Decorator = (Story, context) => {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', context.globals.theme === 'dark');
  }
  return (
    <div className="bg-surface-bg p-6 text-content">
      <Story />
    </div>
  );
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: { title: 'Theme', icon: 'mirror', items: ['light', 'dark'], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'light' },
  decorators: [withTheme],
  parameters: { layout: 'fullscreen', controls: { expanded: true } },
};

export default preview;
