/**
 * A session's browser as a person would say it: "Chrome on Linux".
 *
 * The sessions list had only the raw user-agent string to show (and, before
 * that, nothing: every row read "Unknown device"). Order matters below —
 * Edge and Opera also call themselves Chrome, and Chrome calls itself Safari.
 */

const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'Mac'],
  [/CrOS/, 'ChromeOS'],
  [/Linux|X11/, 'Linux'],
];

export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = (userAgent ?? '').trim();
  if (!ua) return 'Unknown device';
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  if (browser) return browser;
  // Not a browser: a program names itself first, as in "curl/8.5.0".
  const program = /^([A-Za-z][\w.-]*)/.exec(ua)?.[1];
  return program && program !== 'Mozilla' ? program : (system ?? 'Unknown device');
}
