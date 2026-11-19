import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { APP_PRIMARY_HEX, APP_SECONDARY_HEX, hslTripletToHex } from './app-colours';

describe('hslTripletToHex', () => {
  test('turns a token into the hex a colour picker writes', () => {
    expect(hslTripletToHex('0 0% 0%')).toBe('#000000');
    expect(hslTripletToHex('0 0% 100%')).toBe('#ffffff');
    expect(hslTripletToHex('0 100% 50%')).toBe('#ff0000');
    expect(hslTripletToHex('120 100% 50%')).toBe('#00ff00');
    expect(hslTripletToHex('240 100% 50%')).toBe('#0000ff');
    expect(hslTripletToHex('200 98% 39%')).toBe('#0284c5');
  });

  test('is null for anything that is not a token', () => {
    expect(hslTripletToHex('#0284c5')).toBeNull();
    expect(hslTripletToHex('')).toBeNull();
  });
});

describe("the app's own colours", () => {
  test('are the accent colours in the design tokens', () => {
    const tokens = readFileSync(new URL('../../../../packages/ui/src/tokens.css', import.meta.url), 'utf8');
    // The first declaration of each is the light theme's.
    const token = (name: string): string => new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens)![1]!;
    expect(hslTripletToHex(token('accent-primary'))).toBe(APP_PRIMARY_HEX);
    expect(hslTripletToHex(token('accent-secondary'))).toBe(APP_SECONDARY_HEX);
  });
});
