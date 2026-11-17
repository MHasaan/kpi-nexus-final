/**
 * BE-046: accept-invitation only looked at the token, so someone archived or
 * suspended before they accepted could still use the link and become ACTIVE.
 */
import { describe, expect, test } from 'vitest';

import { isWithdrawnInvitee } from './auth.service.js';

describe('isWithdrawnInvitee', () => {
  test('a pending invitation stands while the person is invited or awaiting verification', () => {
    expect(isWithdrawnInvitee('INVITED')).toBe(false);
    expect(isWithdrawnInvitee('PENDING_VERIFICATION')).toBe(false);
  });

  test('an active person is handled by the "already active" check, not this one', () => {
    expect(isWithdrawnInvitee('ACTIVE')).toBe(false);
  });

  test('suspending, archiving, deleting or purging the person withdraws it', () => {
    for (const status of ['SUSPENDED', 'ARCHIVED', 'DELETED', 'PURGED']) {
      expect(isWithdrawnInvitee(status), status).toBe(true);
    }
  });
});
