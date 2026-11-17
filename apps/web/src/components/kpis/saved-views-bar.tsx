'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { Button, Input, Select } from '@/components/ui';
import {
  ApiError,
  type KpiSavedView,
  type KpiViewFilters,
  createKpiSavedView,
  deleteKpiSavedView,
  listKpiSavedViews,
} from '@/lib/api-client';
import { BusyForm, BusySubmit } from '../busy-form';

export interface SavedViewsBarProps {
  /** The toolbar's current filters (what Save stores). */
  current: KpiViewFilters;
  /** Saving needs at least one filter. */
  canSave: boolean;
  onApply: (filters: KpiViewFilters) => void;
}

/**
 * Saved views for the KPI list: pick one to apply its filters, save the
 * current filters under a name (optionally shared with the organization), or
 * delete one of your own. A view stores filters only, so a shared view shows
 * each person just the KPIs they can see.
 */
export function SavedViewsBar({ current, canSave, onApply }: SavedViewsBarProps) {
  const [views, setViews] = useState<KpiSavedView[]>([]);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setViews(await listKpiSavedViews());
    } catch (err) {
      // Not "you have no saved views": they could not be loaded (X-02).
      setViews([]);
      setError(err instanceof ApiError ? `Saved views could not be loaded: ${err.message}` : 'Saved views could not be loaded.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const pick = (id: string) => {
    setSelected(id);
    const view = views.find((v) => v.id === id);
    if (view) onApply(view.filters);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const view = await createKpiSavedView({ name: name.trim(), filters: current, isShared: shared });
      setName('');
      setShared(false);
      await load();
      setSelected(view.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the view');
    }
  };

  const remove = async () => {
    if (!selected) return;
    setError(null);
    try {
      await deleteKpiSavedView(selected);
      setSelected('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the view');
    }
  };

  const chosen = views.find((v) => v.id === selected);

  return (
    <div className="flex flex-col gap-2" data-testid="saved-views">
      <div className="flex flex-wrap items-end gap-2">
        <Select
          aria-label="Saved views"
          className="w-auto"
          value={selected}
          onChange={(e) => pick(e.target.value)}
          data-testid="saved-view-select"
        >
          <option value="">Saved views…</option>
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.isShared ? (v.mine ? ' (shared)' : ' (shared with you)') : ''}
            </option>
          ))}
        </Select>
        {chosen?.mine && (
          <Button type="button" variant="ghost" size="sm" onClick={() => void remove()} data-testid="saved-view-delete">
            Delete view
          </Button>
        )}
        {canSave && (
          <BusyForm onSubmit={save} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Name for this view"
              placeholder="Save filters as…"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-44"
              data-testid="saved-view-name"
            />
            <label className="flex items-center gap-1 text-xs text-content-muted">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} data-testid="saved-view-shared" />
              Share
            </label>
            <BusySubmit size="sm" variant="secondary" data-testid="saved-view-save">
              Save view
            </BusySubmit>
          </BusyForm>
        )}
      </div>
      {error && <p className="text-xs text-status-critical" role="alert">{error}</p>}
    </div>
  );
}
