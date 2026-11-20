/**
 * The app's own accent colours, as hex. They are what an organisation sees
 * until it chooses brand colours of its own, so the Branding page shows them
 * for a colour that is not chosen (it used to show black).
 *
 * The source is `packages/ui/src/tokens.css` (`--accent-primary`,
 * `--accent-secondary`, light theme); `app-colours.spec.ts` fails if these
 * drift from it.
 */
export const APP_PRIMARY_HEX = '#0284c5';
export const APP_SECONDARY_HEX = '#0da2e7';

/** "200 98% 39%" (a token's hue, saturation and lightness) as "#0284c5". */
export function hslTripletToHex(triplet: string): string | null {
  const match = /^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(triplet);
  if (!match) return null;
  const hue = Number(match[1]) % 360;
  const saturation = Number(match[2]) / 100;
  const lightness = Number(match[3]) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const floor = lightness - chroma / 2;
  const sector = Math.floor(hue / 60);
  const [r, g, b] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ][sector] ?? [0, 0, 0];
  const part = (value: number | undefined): string =>
    Math.round(((value ?? 0) + floor) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}
