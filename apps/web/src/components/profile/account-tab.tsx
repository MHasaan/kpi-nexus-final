'use client';

import { type FormEvent, useState } from 'react';

import {
  ApiError,
  type AuthUser,
  updateMyProfile,
} from '../../lib/api-client';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '../ui';

interface AccountTabProps {
  user: AuthUser;
  /** Called with the refreshed user after a successful save. */
  onUserChange: (user: AuthUser) => void;
}

function statusTone(status: string): 'success' | 'neutral' | 'warning' {
  const s = status.toUpperCase();
  if (s === 'ACTIVE') return 'success';
  if (s === 'SUSPENDED' || s === 'DISABLED' || s === 'INACTIVE') return 'warning';
  return 'neutral';
}

export function AccountTab({ user, onUserChange }: AccountTabProps) {
  const [fullName, setFullName] = useState(user.fullName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = fullName.trim();
  const unchanged = trimmed === user.fullName;
  const empty = trimmed.length === 0;
  const status = user.status ?? 'ACTIVE';

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (empty || unchanged) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updateMyProfile({ fullName: trimmed });
      onUserChange(updated);
      setFullName(updated.fullName);
      // Let the app-shell (which loads its own copy of the user) refresh the
      // header/footer identity so the new name shows everywhere immediately.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kpi-nexus:profile-updated'));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save your name');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="flex items-center gap-4">
            <Avatar name={user.fullName || user.email} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-content-strong">
                {user.fullName || '—'}
              </p>
              <p className="truncate text-sm text-content-muted">{user.email}</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="grid gap-3" data-testid="account-form">
            <div className="grid gap-2">
              <Label htmlFor="account-name" required>
                Display name
              </Label>
              <Input
                id="account-name"
                data-testid="account-name-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={saving}
                placeholder="Your full name"
                aria-invalid={empty || undefined}
                autoComplete="name"
                className="max-w-md"
              />
              {empty && (
                <p role="alert" className="text-xs text-status-critical">
                  Name can&apos;t be empty.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="submit"
                data-testid="save-account"
                isLoading={saving}
                disabled={empty || unchanged}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
              {saved && (
                <span role="status" data-testid="account-saved" className="text-sm text-status-success">
                  Saved.
                </span>
              )}
            </div>

            {error && (
              <p role="alert" data-testid="account-error" className="text-sm text-status-critical">
                {error}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
            <Field label="Email" hint="Contact an admin to change your email.">
              <span className="text-sm text-content-strong">{user.email}</span>
            </Field>
            <Field label="Status">
              <Badge tone={statusTone(status)}>{status}</Badge>
            </Field>
            <Field label="Role">
              <span className="text-sm text-content-strong">{user.roleId ?? '—'}</span>
            </Field>
            <Field label="User ID">
              <span className="font-mono text-xs text-content-muted">{user.id}</span>
            </Field>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-content-muted">{label}</dt>
      <dd>{children}</dd>
      {hint && <p className="text-xs text-content-muted">{hint}</p>}
    </div>
  );
}
