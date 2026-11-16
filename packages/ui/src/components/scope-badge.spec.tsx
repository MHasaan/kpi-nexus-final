import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { ScopeBadge, scopeLabel } from './scope-badge.js';

describe('ScopeBadge (X-03)', () => {
  test('shows words, not the enum, and keeps the enum as data for tests and styling', () => {
    const html = renderToStaticMarkup(<ScopeBadge scope="PER_UNIT" />);
    expect(html).toContain('>Per unit<');
    expect(html).not.toContain('>PER_UNIT<');
    expect(html).toContain('data-scope="PER_UNIT"');
  });

  test('every scope has a label', () => {
    expect(scopeLabel('ORG_WIDE')).toBe('Organisation-wide');
    expect(scopeLabel('PER_UNIT')).toBe('Per unit');
    expect(scopeLabel('PER_USER')).toBe('Per user');
  });
});
