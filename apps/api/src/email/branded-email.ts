import { brandColorProblem } from '@kpi-nexus/contracts';

import { escapeHtml } from './escape-html.js';

/** The accent used when an organisation has set no colour, or one an email cannot use. */
export const DEFAULT_EMAIL_COLOR = '#2563eb';

/** What an email takes from the organisation it is sent for. */
export interface EmailBrand {
  name: string;
  /** An https address, or null: mail clients do not load anything else, and nothing else is safe to print. */
  logoUrl: string | null;
  /** `#RRGGBB`, dark enough to carry white text. */
  color: string;
}

function httpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** The brand an email may use, from an organisation row. Anything missing or unusable falls back. */
export function emailBrandOf(org: { name?: string | null; logoUrl?: string | null; primaryColor?: string | null } | null | undefined): EmailBrand {
  const color = org?.primaryColor && brandColorProblem(org.primaryColor) === null ? org.primaryColor : DEFAULT_EMAIL_COLOR;
  return { name: org?.name?.trim() || 'KPI Nexus', logoUrl: httpsUrl(org?.logoUrl), color };
}

/**
 * An email's body with the organisation around it: its logo (or its name) on a
 * bar of its colour above, and a line saying whose it is below. `bodyHtml` is
 * the caller's own, already-escaped markup and is printed as given.
 *
 * Tables and inline styles only — that is what mail clients keep.
 */
export function brandedHtml(brand: EmailBrand, bodyHtml: string): string {
  const name = escapeHtml(brand.name);
  const head = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" height="32" style="display:block;height:32px;border:0;">`
    : `<span style="font-size:18px;font-weight:bold;color:#ffffff;">${name}</span>`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">` +
    `<tr><td style="background:${brand.color};padding:16px 24px;">${head}</td></tr>` +
    `<tr><td style="padding:24px;font-size:14px;line-height:1.5;">${bodyHtml}</td></tr>` +
    `<tr><td style="padding:12px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">Sent by ${name} through KPI Nexus.</td></tr>` +
    `</table>`
  );
}
