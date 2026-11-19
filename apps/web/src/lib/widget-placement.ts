/**
 * Where a newly added widget goes on a dashboard.
 *
 * Every new widget used to be put at the left edge of a row of its own, so a
 * dashboard built by adding widgets was one tall column of cards with the
 * rest of the board empty. A new widget takes the first free place, scanning
 * left to right and top to bottom.
 */

export interface GridBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The board is twelve cells wide; a widget is never shown smaller than two by two. */
const COLS = 12;
const MIN = 2;

const overlaps = (a: GridBox, b: GridBox): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export function nextWidgetPosition(existing: readonly GridBox[], size: { w: number; h: number }): GridBox {
  const w = Math.min(Math.max(size.w, MIN), COLS);
  const h = Math.max(size.h, MIN);
  // The others as they are shown: one saved too small still takes the minimum.
  const taken = existing.map((b) => ({ x: b.x, y: b.y, w: Math.max(b.w, MIN), h: Math.max(b.h, MIN) }));
  const bottom = taken.reduce((lowest, b) => Math.max(lowest, b.y + b.h), 0);
  for (let y = 0; y <= bottom; y += 1) {
    for (let x = 0; x + w <= COLS; x += 1) {
      const place = { x, y, w, h };
      if (!taken.some((b) => overlaps(place, b))) return place;
    }
  }
  return { x: 0, y: bottom, w, h };
}
