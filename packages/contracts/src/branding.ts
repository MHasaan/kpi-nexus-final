/**
 * An organisation's brand colour, turned into the design tokens the app is
 * drawn with. The accent carries white text (buttons, badges), so a colour
 * white cannot be read on is refused rather than applied.
 */

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The least contrast against white a brand colour may have (WCAG's threshold for large text and controls). */
export const MIN_BRAND_CONTRAST = 3;

/** How light the accent is on dark pages, at least — a dark brand colour is lifted so it stays visible. */
const DARK_MIN_LIGHTNESS = 60;

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** Hue (0–359), saturation and lightness (0–100) of a `#RRGGBB` colour, rounded. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#RRGGBB` colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Why a colour cannot be the brand colour, or null when it can. */
export function brandColorProblem(color: string): string | null {
  if (!HEX.test(color)) return 'The colour must be written as #RRGGBB, for example #2563eb.';
  if (contrastRatio(color, '#ffffff') < MIN_BRAND_CONTRAST) {
    return 'That colour is too light: white text on buttons could not be read. Choose a darker one.';
  }
  return null;
}

/** The accent token for light and for dark pages, as the `H S% L%` triplets the stylesheet uses. */
export function brandTokens(color: string): { light: string; dark: string } {
  const { h, s, l } = hexToHsl(color);
  return { light: `${h} ${s}% ${l}%`, dark: `${h} ${s}% ${Math.max(l, DARK_MIN_LIGHTNESS)}%` };
}
