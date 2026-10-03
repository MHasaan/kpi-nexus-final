/**
 * Absolute URL of a page on the web app, for links sent by email.
 *
 * Reads WEB_APP_URL (preferred), then NEXT_PUBLIC_WEB_URL, else the local dev
 * server. Trailing slashes are trimmed so `webAppUrl('/x')` never yields `//x`.
 */
export function webAppUrl(path: string, env: Record<string, string | undefined> = process.env): string {
  const base = (env.WEB_APP_URL || env.NEXT_PUBLIC_WEB_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
