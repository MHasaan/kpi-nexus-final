/** Which list a person belongs in on /users. */
export type DirectoryTab = 'active' | 'archived';

/**
 * Active: everyone who is, or is about to be, part of the organisation —
 * invited, active and suspended (a suspension is a pause, not a departure).
 * Archived: people who were offboarded and can still be restored.
 * A purged or deleted person, or a withdrawn invitation, is in neither.
 */
export function directoryTab(status: string): DirectoryTab | null {
  switch (status) {
    case 'INVITED':
    case 'PENDING_VERIFICATION':
    case 'ACTIVE':
    case 'SUSPENDED':
      return 'active';
    case 'ARCHIVED':
      return 'archived';
    default:
      return null;
  }
}

export type UserAction = 'edit' | 'resend' | 'cancel-invite' | 'suspend' | 'reactivate' | 'archive' | 'restore' | 'purge';

/** What can be done to a person in this state, in the order the buttons appear. */
export function userActions(status: string): UserAction[] {
  switch (status) {
    case 'INVITED':
      return ['edit', 'resend', 'cancel-invite'];
    case 'PENDING_VERIFICATION':
      return ['edit', 'archive'];
    case 'ACTIVE':
      return ['edit', 'suspend', 'archive'];
    case 'SUSPENDED':
      return ['edit', 'reactivate', 'archive'];
    case 'ARCHIVED':
      return ['restore', 'purge'];
    default:
      return [];
  }
}

/** People who can take over a leaver's KPIs or reports: active, and not the leaver. */
export function successorCandidates<U extends { id: string; status: string }>(people: readonly U[], leavingId: string): U[] {
  return people.filter((p) => p.status === 'ACTIVE' && p.id !== leavingId);
}
