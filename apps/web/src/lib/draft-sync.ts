/**
 * Wizard draft autosave state (the DraftSyncProvider behaviour). Edits merge
 * into one pending patch; a save takes it in flight; a failed save puts it
 * back (newer edits win) and marks the draft offline, so nothing typed is lost
 * and the offline banner can offer a retry. Patches merge per top-level key,
 * like the API (each key replaces that draft section).
 */
export type DraftSyncStatus = 'idle' | 'saving' | 'saved' | 'offline';
type Patch = Record<string, unknown>;

export interface DraftSyncState {
  status: DraftSyncStatus;
  pending: Patch | null;
  inFlight: Patch | null;
  online: boolean;
}

export type DraftSyncAction =
  | { type: 'edit'; patch: Patch }
  | { type: 'flush-start' }
  | { type: 'flush-ok' }
  | { type: 'flush-fail' }
  | { type: 'connection'; online: boolean };

export function initialDraftSync(online: boolean): DraftSyncState {
  return { status: 'idle', pending: null, inFlight: null, online };
}

export function draftSyncReducer(state: DraftSyncState, action: DraftSyncAction): DraftSyncState {
  switch (action.type) {
    case 'edit':
      return { ...state, status: 'saving', pending: { ...(state.pending ?? {}), ...action.patch } };
    case 'flush-start':
      if (!state.pending || state.inFlight) return state;
      return { ...state, status: 'saving', inFlight: state.pending, pending: null };
    case 'flush-ok':
      return { ...state, inFlight: null, status: state.pending ? 'saving' : 'saved' };
    case 'flush-fail':
      return { ...state, inFlight: null, status: 'offline', pending: { ...(state.inFlight ?? {}), ...(state.pending ?? {}) } };
    case 'connection':
      return { ...state, online: action.online };
  }
}

/** Show the banner while the browser is offline or an edit is still unsaved after a failed save. */
export function showOfflineBanner(state: DraftSyncState): boolean {
  return !state.online || state.status === 'offline';
}
