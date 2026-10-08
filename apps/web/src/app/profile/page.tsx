'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '../../components/app-shell';
import { AccountTab } from '../../components/profile/account-tab';
import { PreferencesTab } from '../../components/profile/preferences-tab';
import { SecurityTab } from '../../components/profile/security-tab';
import {
  ApiError,
  type AuthUser,
  clearTokens,
  getAccessToken,
  meRequest,
} from '../../lib/api-client';
import { TerminologyProvider } from '../../lib/terminology-context';
import {
  Avatar,
  Button,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui';
import { currentLoginRedirect } from '../../lib/auth-redirect';

type TabKey = 'account' | 'security' | 'preferences';

export default function ProfilePage() {
  return (
    <TerminologyProvider>
      <ProfilePageInner />
    </TerminologyProvider>
  );
}

function ProfilePageInner() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('account');

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await meRequest();
      setUser(res.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace(currentLoginRedirect());
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load your account');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    void refresh();
  }, [router, refresh]);

  return (
    <AppShell title="Account settings">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          eyebrow="You"
          title="Account settings"
          titleTestId="profile-heading"
          subtitle="Manage your identity, sign-in security, and personal preferences."
          actions={
            user ? (
              <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold text-content-strong">
                    {user.fullName || user.email}
                  </p>
                  <p className="text-xs text-content-muted">{user.email}</p>
                </div>
                <Avatar name={user.fullName || user.email} size="md" />
              </div>
            ) : undefined
          }
        />

        {loadError && (
          <div
            role="alert"
            data-testid="profile-load-error"
            className="mt-5 flex flex-col gap-3 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{loadError}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setLoading(true);
                void refresh();
              }}
            >
              Retry
            </Button>
          </div>
        )}

        {loading && !user ? (
          <div className="mt-6 grid gap-4" data-testid="profile-loading">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : user ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="mt-6">
            <TabsList>
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="preferences">Preferences</TabsTrigger>
            </TabsList>

            <TabsContent value="account">
              <AccountTab user={user} onUserChange={setUser} />
            </TabsContent>
            <TabsContent value="security">
              <SecurityTab user={user} onRefreshUser={refresh} />
            </TabsContent>
            <TabsContent value="preferences">
              <PreferencesTab />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </AppShell>
  );
}
