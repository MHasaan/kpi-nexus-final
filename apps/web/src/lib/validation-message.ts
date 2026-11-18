import { humanize } from './labels';

interface Issue {
  path: Array<string | number>;
  message: string;
}

/** Messages the API uses when it has nothing more to say than "the body was wrong". */
const GENERIC = /^invalid (request )?(body|query|params|period|input)\b/i;

function isIssue(value: unknown): value is Issue {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { path?: unknown; message?: unknown };
  return Array.isArray(v.path) && typeof v.message === 'string';
}

/** `['levels', 0, 'delayMinutes']` → "Levels, item 1, delay minutes". */
function fieldName(path: Array<string | number>): string {
  const parts = path.map((part) => (typeof part === 'number' ? `item ${part + 1}` : humanize(part).toLowerCase()));
  const joined = parts.join(', ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/**
 * What to show for a refused request (QA-L10). The API answers a body that fails
 * its checks with "Invalid request body" and a list of issues, each naming a
 * field; a form that showed only the first part told people nothing. When the
 * message is that generic one and issues came with it, this names the fields.
 * A message the API wrote for people is left as it is.
 */
export function validationMessage(message: string, code: string | undefined, details: unknown): string {
  if (code !== 'VALIDATION_ERROR' || !GENERIC.test(message)) return message;
  const raw = (details as { issues?: unknown } | null | undefined)?.issues;
  if (!Array.isArray(raw)) return message;
  const issues = raw.filter(isIssue);
  if (issues.length === 0) return message;
  const said = issues.slice(0, 3).map((i) => (i.path.length > 0 ? `${fieldName(i.path)}: ${i.message}` : i.message));
  const more = issues.length - said.length;
  return more > 0 ? `${said.join('; ')}; and ${more} more.` : said.join('; ');
}
