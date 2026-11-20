/**
 * Settings pages that are built but on hold, and so hidden (UI-014). Neither feature is switched on in
 * this version, and each page saved what an administrator typed and then said it was not in use yet.
 *
 * - Single sign-on waits for ADR-002: the provider the spec names, WorkOS, charges for every company that
 *   connects, against the rule that hosting must stay free (plan 6.8).
 * - The custom domain waits for ADR-003: each company's own address needs its own HTTPS certificate,
 *   which the free hosting does not provide by itself (plan 6.9).
 *
 * Owner decision 2026-11-20: hide both and do them later (TODOS.md). To bring one back, take it out of
 * this list: Settings lists it again and its page stops sending visitors back.
 */
const ON_HOLD: ReadonlySet<string> = new Set(['/settings/sso', '/settings/custom-domain']);

/** Whether a settings page is hidden for now. */
export function isOnHold(href: string): boolean {
  return ON_HOLD.has(href);
}
