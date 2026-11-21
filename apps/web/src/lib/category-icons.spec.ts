import { describe, expect, test } from 'vitest';

import { CATEGORY_ICONS, categoryIcon } from './category-icons';

describe('categoryIcon', () => {
  test('draws a name on the list', () => {
    expect(categoryIcon('Truck')).not.toBeNull();
  });

  test('draws nothing for no name, or a name typed before the list existed', () => {
    expect(categoryIcon(null)).toBeNull();
    expect(categoryIcon('')).toBeNull();
    expect(categoryIcon('rocket')).toBeNull();
  });

  test('every icon on offer has its own name and words', () => {
    expect(new Set(CATEGORY_ICONS.map((i) => i.name)).size).toBe(CATEGORY_ICONS.length);
    expect(CATEGORY_ICONS.every((i) => i.label.trim().length > 0)).toBe(true);
  });
});
