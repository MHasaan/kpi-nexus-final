import { describe, expect, it } from 'vitest';

import { brandColorProblem, brandTokens, contrastRatio, hexToHsl } from './branding.js';

describe('hexToHsl', () => {
  it('turns a hex colour into hue, saturation and lightness', () => {
    expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 100, l: 50 });
    expect(hexToHsl('#2563eb')).toEqual({ h: 221, s: 83, l: 53 });
    expect(hexToHsl('#808080')).toEqual({ h: 0, s: 0, l: 50 });
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });
});

describe('brandColorProblem', () => {
  it('accepts a colour white text can be read on', () => {
    expect(brandColorProblem('#2563eb')).toBeNull();
    expect(brandColorProblem('#7c3aed')).toBeNull();
  });

  it('refuses a colour too light for white text — buttons would be unreadable', () => {
    expect(brandColorProblem('#fde047')).toContain('too light');
    expect(brandColorProblem('#ffffff')).toContain('too light');
  });

  it('refuses something that is not a hex colour', () => {
    expect(brandColorProblem('blue')).toContain('#RRGGBB');
  });
});

describe('brandTokens', () => {
  it('gives the accent for light pages and a lighter one for dark pages', () => {
    expect(brandTokens('#2563eb')).toEqual({ light: '221 83% 53%', dark: '221 83% 60%' });
    // A dark brand colour is lifted on dark pages so it stays visible.
    expect(brandTokens('#1e3a8a')).toEqual({ light: '224 64% 33%', dark: '224 64% 60%' });
  });
});
