import { describe, expect, test } from 'vitest';

import { BAND_PRESETS, bandMeaning } from './band-status.js';

describe('bandMeaning — what a threshold band counts as, from its name', () => {
  test.each([
    ['On track', 'ON_TRACK'],
    ['Healthy', 'ON_TRACK'],
    ['Green', 'ON_TRACK'],
    ['At risk', 'AT_RISK'],
    ['Warning', 'AT_RISK'],
    ['Amber', 'AT_RISK'],
    ['Watch', 'AT_RISK'],
    ['Off track', 'OFF_TRACK'],
    ['Critical', 'OFF_TRACK'],
    ['Red', 'OFF_TRACK'],
    ['Behind', 'OFF_TRACK'],
    ['Failing', 'OFF_TRACK'],
  ] as const)('%s → %s', (name, meaning) => {
    expect(bandMeaning(name)).toBe(meaning);
  });

  test('each preset offered by the form means what it says', () => {
    expect(BAND_PRESETS.map((p) => p.meaning)).toEqual(['ON_TRACK', 'AT_RISK', 'OFF_TRACK']);
    for (const preset of BAND_PRESETS) {
      expect(bandMeaning(preset.name)).toBe(preset.meaning);
      expect(preset.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
