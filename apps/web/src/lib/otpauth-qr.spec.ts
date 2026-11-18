import { describe, expect, test } from 'vitest';

import { otpauthQrDataUrl } from './otpauth-qr';

const URL_A = 'otpauth://totp/KPI%20Nexus:ada%40example.test?secret=JBSWY3DPEHPK3PXP&issuer=KPI%20Nexus';
const URL_B = 'otpauth://totp/KPI%20Nexus:ada%40example.test?secret=GEZDGNBVGY3TQOJQ&issuer=KPI%20Nexus';

describe('otpauthQrDataUrl — the QR code an authenticator app scans', () => {
  test('an otpauth address becomes an SVG image, made here and not fetched', async () => {
    const url = await otpauthQrDataUrl(URL_A);
    expect(url).toMatch(/^data:image\/svg\+xml;utf8,/);
    expect(decodeURIComponent(url!.split(',')[1]!)).toContain('<svg');
  });

  test('a different secret gives a different code', async () => {
    expect(await otpauthQrDataUrl(URL_A)).not.toBe(await otpauthQrDataUrl(URL_B));
  });

  test('anything that is not an otpauth address gives no code', async () => {
    expect(await otpauthQrDataUrl('https://example.test/?secret=JBSWY3DPEHPK3PXP')).toBeNull();
    expect(await otpauthQrDataUrl('')).toBeNull();
  });
});
