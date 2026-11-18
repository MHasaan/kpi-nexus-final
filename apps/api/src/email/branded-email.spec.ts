/**
 * Plan 6.3: invitation and alert emails carry the organisation's logo and
 * colour. They used to be bare paragraphs with nothing to say whose they were.
 */
import { describe, expect, test } from 'vitest';

import { DEFAULT_EMAIL_COLOR, brandedHtml, emailBrandOf } from './branded-email.js';

const BODY = '<p>Hello</p>';

describe('emailBrandOf — what an email may take from an organisation', () => {
  test('takes the name, an https logo and a usable colour', () => {
    expect(emailBrandOf({ name: 'Helios', logoUrl: 'https://cdn.example.test/logo.png', primaryColor: '#7c3aed' })).toEqual({
      name: 'Helios',
      logoUrl: 'https://cdn.example.test/logo.png',
      color: '#7c3aed',
    });
  });

  test('a logo that is not an https address is left out', () => {
    for (const logoUrl of ['http://cdn.example.test/logo.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '/logo.png', 'not a url']) {
      expect(emailBrandOf({ name: 'Helios', logoUrl, primaryColor: null }).logoUrl).toBeNull();
    }
  });

  test('a colour that is missing, malformed, or too light to read falls back to the default', () => {
    for (const primaryColor of [null, 'purple', '#fff', '#ffff00', 'red;background:url(x)']) {
      expect(emailBrandOf({ name: 'Helios', logoUrl: null, primaryColor }).color).toBe(DEFAULT_EMAIL_COLOR);
    }
  });

  test('no organisation at all still gives something to print', () => {
    expect(emailBrandOf(null)).toEqual({ name: 'KPI Nexus', logoUrl: null, color: DEFAULT_EMAIL_COLOR });
  });
});

describe('brandedHtml — the body, with the organisation around it', () => {
  test('keeps the body as given and names the organisation', () => {
    const html = brandedHtml({ name: 'Helios', logoUrl: null, color: '#7c3aed' }, BODY);
    expect(html).toContain(BODY);
    expect(html).toContain('Helios');
    expect(html).toContain('#7c3aed');
    expect(html).toContain('KPI Nexus');
  });

  test('with a logo it shows the logo, with the name as its text', () => {
    const html = brandedHtml({ name: 'Helios', logoUrl: 'https://cdn.example.test/logo.png', color: '#7c3aed' }, BODY);
    expect(html).toContain('<img src="https://cdn.example.test/logo.png"');
    expect(html).toContain('alt="Helios"');
  });

  test('a name is written as text, never as markup', () => {
    const html = brandedHtml({ name: '<script>alert(1)</script> & Co', logoUrl: 'https://cdn.example.test/a.png?x="y"', color: '#7c3aed' }, BODY);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co');
    expect(html).toContain('a.png?x=&quot;y&quot;');
  });
});
