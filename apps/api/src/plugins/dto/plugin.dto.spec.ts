import { describe, expect, it } from 'vitest';

import { InstallPluginDtoSchema } from './plugin.dto.js';

const base = { name: 'Widget', type: 'WIDGET', version: '1.0.0' };

describe('InstallPluginDtoSchema entryUrl (BE-023)', () => {
  it('rejects non-http(s) schemes such as javascript: and data:', () => {
    for (const entryUrl of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'file:///etc/passwd', 'ftp://x.test/a.js']) {
      expect(InstallPluginDtoSchema.safeParse({ ...base, entryUrl }).success).toBe(false);
    }
  });

  it('accepts https and http URLs', () => {
    for (const entryUrl of ['https://cdn.example.com/widget.js', 'http://localhost:5173/plugin.js']) {
      expect(InstallPluginDtoSchema.safeParse({ ...base, entryUrl }).success).toBe(true);
    }
  });
});
