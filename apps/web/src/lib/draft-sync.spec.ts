/**
 * Wizard draft autosave state. A failed save used to set the status back to
 * idle: the "Saving…" label vanished and the edit was silently lost. The
 * reducer keeps an unsaved patch until a save succeeds, so the offline banner
 * can say so and a retry (button, or the browser coming back online) sends it.
 */
import { describe, expect, test } from 'vitest';

import { type DraftSyncState, draftSyncReducer, initialDraftSync, showOfflineBanner } from './draft-sync';

const run = (...actions: Parameters<typeof draftSyncReducer>[1][]): DraftSyncState =>
  actions.reduce(draftSyncReducer, initialDraftSync(true));

describe('draftSyncReducer', () => {
  test('edits merge into one pending patch (newer values win) and show saving', () => {
    const s = run({ type: 'edit', patch: { organization: { name: 'A' } } }, { type: 'edit', patch: { organization: { name: 'AB' } } });
    expect(s.status).toBe('saving');
    expect(s.pending).toEqual({ organization: { name: 'AB' } });
  });

  test('a successful save clears the patch and shows saved', () => {
    const s = run({ type: 'edit', patch: { organization: { name: 'A' } } }, { type: 'flush-start' }, { type: 'flush-ok' });
    expect(s).toMatchObject({ status: 'saved', pending: null, inFlight: null });
  });

  test('an edit made while a save is in flight is kept and saved next', () => {
    const s = run(
      { type: 'edit', patch: { organization: { name: 'A' } } },
      { type: 'flush-start' },
      { type: 'edit', patch: { organization: { name: 'AB' } } },
      { type: 'flush-ok' },
    );
    expect(s.status).toBe('saving');
    expect(s.pending).toEqual({ organization: { name: 'AB' } });
  });

  test('a failed save keeps the unsaved patch (newer edits still win) and shows offline', () => {
    const s = run(
      { type: 'edit', patch: { organization: { name: 'A' }, roles: [] } },
      { type: 'flush-start' },
      { type: 'edit', patch: { organization: { name: 'AB' } } },
      { type: 'flush-fail' },
    );
    expect(s.status).toBe('offline');
    expect(s.pending).toEqual({ organization: { name: 'AB' }, roles: [] });
    expect(s.inFlight).toBeNull();
    expect(showOfflineBanner(s)).toBe(true);
  });

  test('the browser going offline shows the banner; coming back online with nothing unsaved hides it', () => {
    let s = run({ type: 'connection', online: false });
    expect(showOfflineBanner(s)).toBe(true);
    s = draftSyncReducer(s, { type: 'connection', online: true });
    expect(showOfflineBanner(s)).toBe(false);
  });

  test('coming back online with an unsaved patch keeps the banner until the retry succeeds', () => {
    let s = run({ type: 'edit', patch: { organization: { name: 'A' } } }, { type: 'flush-start' }, { type: 'flush-fail' }, { type: 'connection', online: true });
    expect(showOfflineBanner(s)).toBe(true);
    s = [{ type: 'flush-start' } as const, { type: 'flush-ok' } as const].reduce(draftSyncReducer, s);
    expect(showOfflineBanner(s)).toBe(false);
    expect(s.status).toBe('saved');
  });

  test('flush-start with nothing pending changes nothing', () => {
    const s = run({ type: 'flush-start' });
    expect(s).toEqual(initialDraftSync(true));
  });
});
