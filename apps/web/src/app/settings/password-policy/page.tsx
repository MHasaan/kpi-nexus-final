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
  type PasswordPolicy,
} from '../../../lib/api-client';

const DEFAULT_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: false,
  requireLowercase: false,
  requireDigit: false,
  requireSpecial: false,
  maxAgeDays: 0,
};

const FLAGS: Array<{ key: keyof PasswordPolicy; label: string }> = [
  { key: 'requireUppercase', label: 'Require an uppercase letter' },
  { key: 'requireLowercase', label: 'Require a lowercase letter' },
  { key: 'requireDigit', label: 'Require a digit' },
  { key: 'requireSpecial', label: 'Require a special character' },
];

export default function PasswordPolicySettingsPage() {
  const router = useRouter();
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [policy, setPolicy] = useState<PasswordPolicy>(DEFAULT_POLICY);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    getMyOrganization()
      .then((data) => {
        setOrg(data);
        setPolicy({ ...DEFAULT_POLICY, ...(data.passwordPolicy ?? {}) });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace('/login');
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Failed to load password policy');
      });
  }, [router]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateMyOrganization({ passwordPolicy: policy });
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
          <h1 className="text-2xl font-semibold text-content-strong" data-testid="password-policy-heading">
            Password policy
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            Set complexity rules enforced when members set or change their password.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
              data-testid="password-policy-error"
            >
              {error}
            </div>
          )}

          {!org && !error && <p className="mt-6 text-sm text-content-muted">Loading…</p>}

          {org && (
            <form onSubmit={handleSave} className="mt-8 space-y-6" data-testid="password-policy-form">
              <fieldset className="rounded-lg border border-border bg-surface-1 p-6">
                <legend className="px-2 text-sm font-semibold text-content-strong">Length & expiry</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-content-default">Minimum length</span>
                    <input
                      type="number"
                      min={6}
                      max={128}
                      value={policy.minLength}
                      onChange={(e) => setPolicy({ ...policy, minLength: Number(e.target.value) })}
                      data-testid="password-policy-min-length"
                      className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-content-default">Max age (days, 0 = never expires)</span>
                    <input
                      type="number"
                      min={0}
                      value={policy.maxAgeDays}
                      onChange={(e) => setPolicy({ ...policy, maxAgeDays: Number(e.target.value) })}
                      data-testid="password-policy-max-age"
                      className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="rounded-lg border border-border bg-surface-1 p-6">
                <legend className="px-2 text-sm font-semibold text-content-strong">Complexity</legend>
                <div className="space-y-3">
                  {FLAGS.map((f) => (
                    <label key={f.key} className="flex items-center gap-2 text-sm text-content-default">
                      <input
                        type="checkbox"
                        checked={Boolean(policy[f.key])}
                        onChange={(e) => setPolicy({ ...policy, [f.key]: e.target.checked })}
                        data-testid={`password-policy-${f.key}`}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <PermissionGuard permission="ORG_SETTINGS">
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    data-testid="password-policy-save"
                    className="rounded-md bg-accent-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  {saved && (
                    <span role="status" className="text-sm text-status-success" data-testid="password-policy-saved">
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
