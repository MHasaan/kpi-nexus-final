/**
 * A report's schedule in words.
 *
 * The list worded four known schedules, the report's own page printed the
 * stored five-part schedule ("0 8 * * *"), and nothing said whose clock the
 * time is on. A schedule is read on the organisation's clock (the API runs it
 * in the organisation's time zone), so callers add that zone after the words.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WHOLE = /^\d+$/;

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

const list = (words: string[]): string => (words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/** 0–7, where both 0 and 7 are Sunday. */
const day = (text: string): string | null => {
  if (!WHOLE.test(text)) return null;
  const n = Number(text);
  return n >= 0 && n <= 7 ? (DAYS[n % 7] ?? null) : null;
};

/**
 * "Every day at 08:00", "Every Monday at 09:00", "Monday to Friday at 09:00",
 * "On the 1st of every month at 09:00". A schedule this cannot word — every
 * 15 minutes, one month of the year — is "Custom schedule (…)" with the
 * schedule itself, which is still exact.
 */
export function scheduleInWords(cron: string): string {
  const custom = `Custom schedule (${cron.trim()})`;
  const [minute, hour, dayOfMonth, month, weekday, ...rest] = cron.trim().split(/\s+/);
  if (!minute || !hour || !dayOfMonth || !month || !weekday || rest.length > 0) return custom;
  if (!WHOLE.test(minute) || !WHOLE.test(hour) || month !== '*') return custom;
  const m = Number(minute);
  const h = Number(hour);
  if (m > 59 || h > 23) return custom;
  const at = `at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  if (dayOfMonth === '*' && weekday === '*') return `Every day ${at}`;

  if (dayOfMonth === '*') {
    const range = /^(\d)-(\d)$/.exec(weekday);
    if (range) {
      const from = day(range[1]!);
      const to = day(range[2]!);
      return from && to && Number(range[1]) < Number(range[2]) ? `${from} to ${to} ${at}` : custom;
    }
    const days = weekday.split(',').map(day);
    return days.every((d): d is string => d !== null) ? `Every ${list(days)} ${at}` : custom;
  }

  if (weekday === '*' && WHOLE.test(dayOfMonth)) {
    const d = Number(dayOfMonth);
    return d >= 1 && d <= 31 ? `On the ${ordinal(d)} of every month ${at}` : custom;
  }
  return custom;
}
