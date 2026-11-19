/**
 * Flow walk (dashboards): every widget added went to the left edge of a new
 * row, so a dashboard built by adding widgets was one tall column of cards
 * with the rest of the board empty. A new widget now takes the first free
 * place, left to right and top to bottom.
 */
import { describe, expect, test } from 'vitest';

import { nextWidgetPosition } from './widget-placement';

const at = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe('nextWidgetPosition', () => {
  test('the first widget goes in the top left corner', () => {
    expect(nextWidgetPosition([], { w: 3, h: 2 })).toEqual(at(0, 0, 3, 2));
  });

  test('the next ones go beside it until the row is full, then below', () => {
    const one = [at(0, 0, 3, 2)];
    expect(nextWidgetPosition(one, { w: 3, h: 2 })).toEqual(at(3, 0, 3, 2));
    const four = [at(0, 0, 3, 2), at(3, 0, 3, 2), at(6, 0, 3, 2), at(9, 0, 3, 2)];
    expect(nextWidgetPosition(four, { w: 3, h: 2 })).toEqual(at(0, 2, 3, 2));
  });

  test('a wide widget that does not fit beside the others goes below them', () => {
    expect(nextWidgetPosition([at(0, 0, 3, 2), at(3, 0, 6, 4)], { w: 6, h: 4 })).toEqual(at(0, 4, 6, 4));
    // …but takes a gap it does fit in.
    expect(nextWidgetPosition([at(0, 0, 6, 4)], { w: 6, h: 4 })).toEqual(at(6, 0, 6, 4));
  });

  test('a widget saved smaller than the minimum is counted at the size it is shown', () => {
    // Stored 1×1 at the left edge, shown 2×2: the new one must not land on top of it.
    expect(nextWidgetPosition([at(0, 0, 1, 1)], { w: 3, h: 2 })).toEqual(at(2, 0, 3, 2));
  });

  test('a widget wider than the board is still given a place', () => {
    expect(nextWidgetPosition([], { w: 20, h: 2 })).toEqual(at(0, 0, 12, 2));
  });
});
