/**
 * Small checks a form makes before it sends anything, each answering with a
 * sentence or null. They save a round trip and say what to type — the API
 * still checks everything itself.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CRON_FIELD = /^[\d*/,\-A-Za-z?#L]+$/;

/** A schedule typed by hand: five fields (minute hour day month weekday). */
export function cronProblem(text: string): string | null {
  const fields = text.trim().split(/\s+/).filter(Boolean);
  if (fields.length === 0) return 'Type a schedule, or choose one of the presets.';
  if (fields.length !== 5) return `A schedule has five parts — minute, hour, day, month, weekday — for example "0 8 * * 1" (Mondays at 08:00). This one has ${fields.length}.`;
  const bad = fields.find((f) => !CRON_FIELD.test(f));
  return bad ? `"${bad}" is not a valid part of a schedule.` : null;
}

/** How many periods ahead to forecast: a whole number from 1 to 365. */
export function horizonProblem(text: string): string | null {
  const n = Number(text);
  if (text.trim() === '' || !Number.isInteger(n)) return 'Enter how many periods ahead to forecast, as a whole number.';
  if (n < 1 || n > 365) return 'The forecast can look between 1 and 365 periods ahead.';
  return null;
}

/** Who a report is sent to: at least one address, each one valid. */
export function recipientsProblem(recipients: readonly string[]): string | null {
  const typed = recipients.map((r) => r.trim()).filter(Boolean);
  if (typed.length === 0) return 'Add at least one email address to send the report to.';
  const bad = typed.find((r) => !EMAIL.test(r));
  return bad ? `"${bad}" is not an email address.` : null;
}
