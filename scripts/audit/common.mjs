import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const REDACTED = '<redacted>';
const SENSITIVE_KEYS = new Set([
  'token', 'secret', 'signingsecret', 'clientsecret', 'apikey', 'key', 'plaintext',
  'password', 'passwordhash', 'adminpassword', 'currentpassword', 'newpassword',
  'accesstoken', 'refreshtoken', 'invitetoken', 'resettoken', 'sharetoken', 'embedtoken',
  'hashedkey', 'authorization', 'signature', 'sig', 'xamzsignature', 'xamzcredential',
  'xamzsecuritytoken', 'cookie', 'setcookie', 'txtchallengevalue',
]);
const sensitiveKey = (key) => SENSITIVE_KEYS.has(key.replace(/[-_]/g, '').toLowerCase());

function redactString(text) {
  if (/^\s*[\[{]/.test(text)) {
    try {
      return JSON.stringify(JSON.parse(text), sanitizeField);
    } catch {
      // Errors and console messages can contain incomplete or mixed-format JSON.
    }
  }

  return text
    .replace(/("(?:[^"\\]|\\.)*")(\s*:\s*)"(?:[^"\\]|\\.)*"/g, (match, key, separator) =>
      sensitiveKey(key.slice(1, -1)) ? `${key}${separator}"${REDACTED}"` : match)
    .replace(/([?&](?:amp;)?)([a-z0-9_.%-]+)=([^&#\s"'<>;,]+)/gi, (match, prefix, key) => {
      let decoded;
      try {
        decoded = decodeURIComponent(key);
      } catch {
        return match;
      }
      return sensitiveKey(decoded) ? `${prefix}${key}=${REDACTED}` : match;
    })
    .replace(/(\/(?:share|(?:public\/)?embed\/kpi|public\/dashboards)\/)(?!:)[^/?#\s"'<>;,]+/gi, `$1${REDACTED}`)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s"'<>@]+@/gi, `$1${REDACTED}@`)
    .replace(/(\bBearer\s+)[^\s"'<>;,]+/gi, `$1${REDACTED}`)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED);
}

function sanitizeField(key, value) {
  if (sensitiveKey(key) && value != null) return REDACTED;
  return typeof value === 'string' ? redactString(value) : value;
}

export function redactAuditText(text) {
  return redactString(String(text));
}

export function auditExcerpt(text, length) {
  return redactAuditText(text).slice(0, length);
}

export function auditOutputDir(repoRoot) {
  return process.env.AUDIT_OUTPUT_DIR
    ? resolve(process.env.AUDIT_OUTPUT_DIR)
    : join(repoRoot, 'docs', 'audit');
}

export function auditJson(value) {
  return `${JSON.stringify(value, sanitizeField, 2)}\n`;
}

export async function writeAuditJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, auditJson(value));
}

export function failAudit(error) {
  console.error(auditExcerpt(error instanceof Error ? error.message : error, 400));
  process.exitCode = 1;
}

const mailHeader = (part, name) =>
  Object.entries(part.Headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1]?.[0] ?? '';

function htmlParts(part) {
  if (!part) return [];
  if (/^text\/html\b/i.test(mailHeader(part, 'content-type'))) {
    const body = part.Body ?? '';
    const encoding = mailHeader(part, 'content-transfer-encoding').toLowerCase();
    if (encoding === 'base64') return [Buffer.from(body, 'base64').toString('utf8')];
    if (encoding === 'quoted-printable') {
      return [body.replace(/=\r?\n/g, '').replace(/=([\da-f]{2})/gi, (_, byte) => String.fromCharCode(parseInt(byte, 16)))];
    }
    return [body];
  }
  return (part.MIME?.Parts ?? []).flatMap(htmlParts);
}

export function auditEmailHtml(mail, markers) {
  const html = [mail.Content, ...(mail.MIME?.Parts ?? [])].flatMap(htmlParts).join('\n');
  if (!html) return 'HTML part missing';
  if (markers.some((marker) => html.includes(marker))) return 'raw HTML present';
  return markers.every((marker) => html.includes(marker.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')))
    ? 'escaped'
    : 'escaped marker missing';
}

// Leave time for the next navigation (up to 60s) and its asynchronous requests.
export function crawlNeedsRefresh(token, now = Date.now()) {
  let expiresAt;
  try {
    const payload = Buffer.from(token.split('.')[1], 'base64url').toString('utf8');
    expiresAt = JSON.parse(payload).exp;
  } catch {
    throw new Error('access token expiry missing or invalid');
  }
  if (!Number.isFinite(expiresAt)) throw new Error('access token expiry missing or invalid');
  return expiresAt * 1000 <= now + 90_000;
}
