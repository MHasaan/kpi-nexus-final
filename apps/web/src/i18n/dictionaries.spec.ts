/**
 * Manual QA (2026-11-20, F-065): the language picker offered Spanish and French, which translate nothing, so
 * the product looked localised when it is not. Only languages with translations are offered; a language the
 * app knows but has not translated stays out of the picker until it is ready.
 */
import { describe, expect, it } from 'vitest';

import { LOCALES, OFFERED_LOCALES, translationCoverage } from './dictionaries';

describe('languages offered to a person', () => {
  it('English is offered, and every offered language is one the app knows', () => {
    expect(OFFERED_LOCALES).toContain('en-US');
    for (const l of OFFERED_LOCALES) expect(LOCALES).toContain(l);
  });

  it('a language with no translations of its own is not offered', () => {
    for (const l of LOCALES) {
      if (translationCoverage(l) === 0) expect(OFFERED_LOCALES).not.toContain(l);
    }
    expect(OFFERED_LOCALES).not.toContain('es');
    expect(OFFERED_LOCALES).not.toContain('fr');
  });
});
