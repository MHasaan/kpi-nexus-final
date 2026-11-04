'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { AppShell } from '../../../components/app-shell';
import { PermissionGuard } from '../../../components/auth/permission-guard';
import { RequirePermission } from '../../../components/auth/require-permission';
import {
  ApiError,
  clearTokens,
  getAccessToken,
  getMyOrganization,
  updateMyOrganization,
  type OrganizationSettings,
} from '../../../lib/api-client';
import { currentLoginRedirect } from '../../../lib/auth-redirect';

export default function BrandingSettingsPage() {
  const router = useRouter();
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [secondaryColor, setSecondaryColor] = useState('#7c3aed');

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    getMyOrganization()
      .then((data) => {
        setOrg(data);
        setLogoUrl(data.logoUrl ?? '');
        setFaviconUrl(data.faviconUrl ?? '');
        setPrimaryColor(data.primaryColor ?? '#2563eb');
        setSecondaryColor(data.secondaryColor ?? '#7c3aed');
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace(currentLoginRedirect());
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Failed to load branding');
      });
  }, [router]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // Empty string clears the value (send null); the api validates URL/hex.
      const updated = await updateMyOrganization({
        logoUrl: logoUrl.trim() || null,
        faviconUrl: faviconUrl.trim() || null,
        primaryColor: primaryColor.trim() || null,
        secondaryColor: secondaryColor.trim() || null,
      });
      setOrg(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <RequirePermission permission="ORG_SETTINGS">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <h1 className="text-2xl font-semibold text-content-strong" data-testid="branding-heading">
            Branding
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            Customize the logo and colors your team sees across the app.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
              data-testid="branding-error"
            >
              {error}
            </div>
          )}

          {!org && !error && <p className="mt-6 text-sm text-content-muted">Loading…</p>}

          {org && (
            <form onSubmit={handleSave} className="mt-8 space-y-6" data-testid="branding-form">
              <fieldset className="rounded-lg border border-border bg-surface-1 p-6">
                <legend className="px-2 text-sm font-semibold text-content-strong">Logo</legend>
                <Field
                  label="Logo URL"
                  value={logoUrl}
                  onChange={setLogoUrl}
                  placeholder="https://cdn.example.com/logo.png"
                  testId="branding-logo-url"
                />
                <Field
                  label="Favicon URL"
                  value={faviconUrl}
                  onChange={setFaviconUrl}
                  placeholder="https://cdn.example.com/favicon.ico"
                  testId="branding-favicon-url"
                />
                {logoUrl.trim() && (
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    className="mt-3 max-h-16 rounded border border-border bg-surface-bg p-2"
                    data-testid="branding-logo-preview"
                  />
                )}
              </fieldset>

              <fieldset className="rounded-lg border border-border bg-surface-1 p-6">
                <legend className="px-2 text-sm font-semibold text-content-strong">Colors</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorField
                    label="Primary color"
                    value={primaryColor}
                    onChange={setPrimaryColor}
                    testId="branding-primary-color"
                  />
                  <ColorField
                    label="Secondary color"
                    value={secondaryColor}
                    onChange={setSecondaryColor}
                    testId="branding-secondary-color"
                  />
                </div>
              </fieldset>

              <PermissionGuard permission="ORG_SETTINGS">
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    data-testid="branding-save"
                    className="rounded-md bg-accent-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  {saved && (
                    <span role="status" className="text-sm text-status-success" data-testid="branding-saved">
                      Saved.
                    </span>
                  )}
                </div>
              </PermissionGuard>
            </form>
          )}
        </div>
      </RequirePermission>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  testId,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="mb-4 block">
      <span className="text-sm font-medium text-content-default">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-content-default">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-border bg-surface-bg"
          aria-label={`${label} picker`}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid={testId}
          placeholder="#2563eb"
          className="w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
        />
      </div>
    </label>
  );
}
