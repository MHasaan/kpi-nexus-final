'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { AppShell } from '../../components/app-shell';
import { RequirePermission } from '../../components/auth/require-permission';
import { getAccessToken } from '../../lib/api-client';

interface SettingLink {
  href: string;
  title: string;
  description: string;
}

const GROUPS: Array<{ heading: string; links: SettingLink[] }> = [
  {
    heading: 'General',
    links: [
      { href: '/settings/organization', title: 'Organization', description: 'Name, locale, currency, and terminology.' },
      { href: '/settings/branding', title: 'Branding', description: 'Logo, favicon, and brand colors.' },
      { href: '/settings/fiscal', title: 'Fiscal calendar', description: 'Fiscal year start and date/number formats.' },
    ],
  },
  {
    heading: 'Security',
    links: [
      { href: '/settings/password-policy', title: 'Password policy', description: 'Length and complexity requirements.' },
      { href: '/settings/sso', title: 'Single sign-on', description: 'SAML / OIDC identity provider config.' },
      { href: '/settings/scim', title: 'SCIM provisioning', description: 'Bearer tokens for IdP user provisioning.' },
      { href: '/settings/audit', title: 'Audit log', description: 'Review security-relevant activity.' },
    ],
  },
  {
    heading: 'Integrations',
    links: [
      { href: '/settings/custom-domain', title: 'Custom domain', description: 'Serve KPI Nexus from your own domain.' },
      { href: '/settings/notifications', title: 'Notifications', description: 'Digest mode, mute windows, channel prefs.' },
      { href: '/settings/ai', title: 'AI', description: 'Provider, budget caps, and feature models.' },
      { href: '/settings/api-keys', title: 'API keys', description: 'Programmatic access tokens.' },
      { href: '/settings/webhooks', title: 'Webhooks', description: 'Outbound event subscriptions.' },
      { href: '/settings/retention', title: 'Data retention', description: 'Per-entity retention policies.' },
    ],
  },
  {
    heading: 'Access control',
    links: [
      { href: '/settings/access', title: 'Access Center', description: 'Per-user access overrides and resolved-access preview.' },
    ],
  },
  {
    heading: 'Billing',
    links: [
      { href: '/billing', title: 'Billing & plan', description: 'Current plan, usage, and quotas.' },
    ],
  },
];

export default function SettingsIndexPage() {
  const router = useRouter();
  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  return (
    <AppShell>
      <RequirePermission permission="ORG_SETTINGS">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <h1 className="text-2xl font-semibold text-content-strong" data-testid="settings-index-heading">Settings</h1>
          <p className="mt-1 text-sm text-content-muted">Manage your organization&apos;s configuration.</p>

          <div className="mt-8 space-y-8">
            {GROUPS.map((group) => (
              <section key={group.heading} data-testid={`settings-group-${group.heading.toLowerCase()}`}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-content-muted">{group.heading}</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      data-testid={`settings-link-${link.href.replace(/^\//, '').replace(/\//g, '-')}`}
                      className="block rounded-lg border border-border bg-surface-1 p-4 transition hover:border-accent-primary hover:bg-surface-2"
                    >
                      <span className="block font-medium text-content-strong">{link.title}</span>
                      <span className="mt-1 block text-xs text-content-muted">{link.description}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </RequirePermission>
    </AppShell>
  );
}
