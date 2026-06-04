'use client';

import { useCallback, useMemo, useState } from 'react';

import type { PageAccessConfig } from '../../lib/api-client';
import { PAGE_ROUTES, type PageRoute } from '../../lib/page-routes';

// Group the configurable routes once, preserving the nav section order.
const GROUPED: Array<{ group: string; routes: PageRoute[] }> = (() => {
  const order: string[] = [];
  const byGroup = new Map<string, PageRoute[]>();
  for (const r of PAGE_ROUTES) {
    if (!byGroup.has(r.group)) {
      byGroup.set(r.group, []);
      order.push(r.group);
    }
    byGroup.get(r.group)!.push(r);
  }
  return order.map((group) => ({ group, routes: byGroup.get(group)! }));
})();

/**
 * Phase 7 — Layer-5 "Page access" editor block, shared by the per-role editor
 * (Roles page) and the per-user override editor (Access Center). Mirrors the
 * styling of the sibling scope/limits/category blocks (`kn-eyebrow` headers,
 * `accent-accent-primary` checkboxes).
 *
 * Controlled: the parent owns nothing but reads the produced config back via
 * `onChange` on every mutation, so Save can always send the current value
 * (including the cleared `{ allow: null, deny: [] }`).
 */
export function PageAccessEditor({
  value,
  onChange,
}: {
  value: PageAccessConfig | null;
  onChange: (next: PageAccessConfig) => void;
}) {
  // Hydrate once from the incoming value (the host re-mounts via `key` when the
  // selected role/user changes, so a one-time initial state is correct).
  const [denySet, setDenySet] = useState<Set<string>>(
    () => new Set(value?.deny ?? []),
  );
  const [restrictOn, setRestrictOn] = useState<boolean>(
    () => value?.allow != null,
  );
  const [allowSet, setAllowSet] = useState<Set<string>>(
    () => new Set(value?.allow ?? []),
  );

  const emit = useCallback(
    (deny: Set<string>, restrict: boolean, allow: Set<string>) => {
      onChange({
        allow: restrict ? [...allow] : null,
        deny: [...deny],
      });
    },
    [onChange],
  );

  const toggleDeny = useCallback(
    (href: string, on: boolean) => {
      setDenySet((prev) => {
        const next = new Set(prev);
        if (on) next.add(href);
        else next.delete(href);
        emit(next, restrictOn, allowSet);
        return next;
      });
    },
    [emit, restrictOn, allowSet],
  );

  const toggleAllow = useCallback(
    (href: string, on: boolean) => {
      setAllowSet((prev) => {
        const next = new Set(prev);
        if (on) next.add(href);
        else next.delete(href);
        emit(denySet, restrictOn, next);
        return next;
      });
    },
    [emit, denySet, restrictOn],
  );

  const toggleRestrict = useCallback(
    (on: boolean) => {
      setRestrictOn(on);
      emit(denySet, on, allowSet);
    },
    [emit, denySet, allowSet],
  );

  const allowEmptyWarning = useMemo(
    () => restrictOn && allowSet.size === 0,
    [restrictOn, allowSet],
  );

  return (
    <div data-testid="page-access-editor" className="mt-6">
      <div className="kn-eyebrow mb-2">Page access (navigation)</div>
      <p className="mb-3 max-w-xl text-xs text-content-muted">
        Hide specific pages, or restrict navigation to an explicit allow-list.
        Admins always see every page regardless of this config.
      </p>

      {/* Deny list */}
      <div>
        <p className="mb-2 text-sm font-medium text-content-strong">Hide specific pages</p>
        <div className="flex flex-col gap-3">
          {GROUPED.map(({ group, routes }) => (
            <div key={group}>
              <div className="kn-eyebrow mb-1.5">{group}</div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {routes.map((r) => (
                  <label
                    key={r.href}
                    className="inline-flex items-center gap-2 text-sm text-content-default"
                  >
                    <input
                      type="checkbox"
                      checked={denySet.has(r.href)}
                      onChange={(e) => toggleDeny(r.href, e.target.checked)}
                      data-testid={`page-deny-${r.href}`}
                      className="h-4 w-4 rounded border-border-strong accent-accent-primary"
                    />
                    {r.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Allow-list (advanced) */}
      <div className="mt-5">
        <label className="flex items-center gap-2 text-sm font-medium text-content-strong">
          <input
            type="checkbox"
            checked={restrictOn}
            onChange={(e) => toggleRestrict(e.target.checked)}
            data-testid="page-restrict-toggle"
            className="h-4 w-4 rounded border-border-strong accent-accent-primary"
          />
          Restrict navigation to only specific pages (advanced)
        </label>

        {restrictOn && (
          <div className="mt-2 flex flex-col gap-3">
            {allowEmptyWarning && (
              <p
                role="alert"
                className="text-xs text-status-warning"
                data-testid="page-allow-empty-warning"
              >
                Saving with none selected hides every page — the user will only
                have non-navigation pages like Profile.
              </p>
            )}
            {GROUPED.map(({ group, routes }) => (
              <div key={group}>
                <div className="kn-eyebrow mb-1.5">{group}</div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {routes.map((r) => (
                    <label
                      key={r.href}
                      className="inline-flex items-center gap-2 text-sm text-content-default"
                    >
                      <input
                        type="checkbox"
                        checked={allowSet.has(r.href)}
                        onChange={(e) => toggleAllow(r.href, e.target.checked)}
                        data-testid={`page-allow-${r.href}`}
                        className="h-4 w-4 rounded border-border-strong accent-accent-primary"
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
