/// <reference types="vite/client" />
/**
 * The Storybook catalogue stays complete: every component the package exports
 * is documented by a story file (as its `component` or one of its
 * `subcomponents`), and every story renders without throwing.
 */
import { composeStories } from '@storybook/react-vite';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import * as ui from '../index.js';

type StoryModule = Parameters<typeof composeStories>[0];
const modules = import.meta.glob<StoryModule>('./*.stories.tsx', { eager: true });

const isComponent = (v: unknown): boolean =>
  typeof v === 'function' || (typeof v === 'object' && v !== null && '$$typeof' in v);
const exported = Object.entries(ui)
  .filter(([name, v]) => /^[A-Z]/.test(name) && isComponent(v))
  .map(([name]) => name)
  .sort();

describe('Storybook catalogue', () => {
  it('the package exports its components', () => {
    expect(exported).toEqual(expect.arrayContaining(['Button', 'Card', 'StatTile', 'Tabs']));
  });

  it('every exported component has a story', () => {
    const documented = new Set<unknown>();
    for (const mod of Object.values(modules)) {
      const meta = mod.default as { component?: unknown; subcomponents?: Record<string, unknown> };
      documented.add(meta.component);
      for (const sub of Object.values(meta.subcomponents ?? {})) documented.add(sub);
    }
    const missing = exported.filter((name) => !documented.has((ui as Record<string, unknown>)[name]));
    expect(missing).toEqual([]);
  });

  for (const [file, mod] of Object.entries(modules)) {
    describe(file, () => {
      for (const [name, Story] of Object.entries(composeStories(mod) as Record<string, ComponentType>)) {
        it(`${name} renders`, () => {
          expect(renderToStaticMarkup(<Story />).length).toBeGreaterThan(0);
        });
      }
    });
  }
});
