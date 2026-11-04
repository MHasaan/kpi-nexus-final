/**
 * Sign-in redirects (FE-009). A signed-out user who opens a protected page is
 * sent to `/login?next=<that page>` — not to "/unauthorized", which offers no
 * way to sign in — and is returned there after signing in.
 */

const AUTH_PAGES = ['/login', '/unauthorized'];

/** `/login?next=…` for the page the user tried to open. */
export function loginRedirectPath(pathname: string, search: string): string {
  if (AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return '/login';
  return `/login?next=${encodeURIComponent(`${pathname}${search}`)}`;
}

/**
 * The `next` target if it is a same-origin, in-app path; otherwise null.
 * Rejects absolute / protocol-relative URLs (`//host`, `/\host`) and auth pages,
 * so `next` can never become an open redirect or a login loop.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/')) return null;
  if (next.startsWith('//') || next.startsWith('/\\')) return null;
  const path = next.split(/[?#]/)[0] ?? '';
  if (AUTH_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return next;
}

/** Browser-side: where the current page should send a signed-out user. */
export function currentLoginRedirect(): string {
  if (typeof window === 'undefined') return '/login';
  return loginRedirectPath(window.location.pathname, window.location.search);
}
