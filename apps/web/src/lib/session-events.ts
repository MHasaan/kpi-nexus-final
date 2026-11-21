/**
 * Events one part of the web app raises for the others, in the same tab (a `storage` event reaches only
 * other tabs). No imports here, so every module may listen without a cycle.
 */

/** A new session began: tokens from signing in or accepting an invitation were stored (F-011). */
export const SESSION_CHANGED_EVENT = 'kpi-nexus:session-changed';

/** The server's answer about what this person may see was written to the browser's copy (F-050). */
export const ACCESS_PROFILE_EVENT = 'kpi-nexus:access-profile';

/** Raise an event in this tab, where there is a window to raise it on. */
export function announce(name: string): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new Event(name));
}
