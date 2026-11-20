import { meRequest } from './api-client';
import type { AccessProfile } from '@kpi-nexus/contracts';

/**
 * What the server says this person may do, asked for at most once in a short
 * while however many parts of a page want it.
 *
 * Permissions are kept in the browser so a page can draw at once. That copy was
 * never checked again: when an administrator changed someone's role, their menu
 * and buttons stayed as they were until they signed out. Each page load now
 * shows the kept copy first and then asks the server; `meRequest` writes the
 * answer back to the kept copy, and the hooks that asked take it up.
 *
 * The server answers from the role in the session token, which is renewed every
 * 15 minutes: a changed role reaches the screen once the token has been renewed,
 * not before.
 *
 * Resolves to null when the server could not be asked: the kept copy stands.
 */
export interface FreshSession {
  permissions: string[];
  accessProfile: AccessProfile | null;
}

/** Long enough that one page's many guards share one request; short enough that the next page asks again. */
export const REFRESH_WINDOW_MS = 15_000;

let last: { at: number; answer: Promise<FreshSession | null> } | null = null;

export function freshSession(now: number = Date.now()): Promise<FreshSession | null> {
  if (!last || now - last.at > REFRESH_WINDOW_MS) {
    last = {
      at: now,
      answer: meRequest().then(
        ({ user, accessProfile }) => ({ permissions: user.permissions ?? [], accessProfile: accessProfile ?? null }),
        () => null,
      ),
    };
  }
  return last.answer;
}

/** Whether two lists of permission keys name the same permissions. */
export function samePermissions(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key) => b.includes(key));
}

/** For tests: forget the last answer. */
export function resetFreshSession(): void {
  last = null;
}
