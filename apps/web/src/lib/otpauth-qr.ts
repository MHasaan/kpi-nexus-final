import QRCode from 'qrcode';

/**
 * The QR code an authenticator app scans to take a two-step sign-in secret, as
 * an image address that holds its own data. It is drawn here, in the browser:
 * the secret is never sent to a QR service.
 *
 * Null for anything that is not an `otpauth://` address — nothing else belongs
 * in this code.
 */
export async function otpauthQrDataUrl(otpauthUrl: string): Promise<string | null> {
  if (!otpauthUrl.startsWith('otpauth://')) return null;
  const svg = await QRCode.toString(otpauthUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
