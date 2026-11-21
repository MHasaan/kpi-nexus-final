/**
 * Owner's decision (2026-11-19): a changed role takes effect at once. The role
 * a request runs under is the one the person holds now, not the copy in their
 * token.
 */
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { JwtStrategy } from './jwt.strategy.js';

function make(user: { roleId: string | null } | null) {
  const findFirst = vi.fn(async (_args: { where: Record<string, unknown>; select: Record<string, unknown> }) => user);
  const strategy = new JwtStrategy({ get: () => 'test-secret' } as never, { user: { findFirst } } as never);
  return { strategy, findFirst };
}

const token = { sub: 'user_1', org: 'org_1', rid: 'role_old', adm: false, sid: 'sess_1' };

describe('JwtStrategy.validate', () => {
  it('runs the request under the role the person holds now', async () => {
    const { strategy, findFirst } = make({ roleId: 'role_new' });
    expect(await strategy.validate(token)).toEqual({
      userId: 'user_1',
      organizationId: 'org_1',
      roleId: 'role_new',
      sessionId: 'sess_1',
      principalType: 'user',
    });
    // Looked up inside the token's own organisation.
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'user_1', organizationId: 'org_1' }, select: { roleId: true } });
  });

  it('someone whose role was taken away has none, whatever the token says', async () => {
    const { strategy } = make({ roleId: null });
    expect((await strategy.validate(token)).roleId).toBeNull();
  });

  it('keeps the token’s role only when the person cannot be found', async () => {
    const { strategy } = make(null);
    expect((await strategy.validate(token)).roleId).toBe('role_old');
  });

  it('refuses a token with no person or no organisation, without asking the database', async () => {
    const { strategy, findFirst } = make({ roleId: 'role_new' });
    await expect(strategy.validate({ ...token, sub: '' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(strategy.validate({ ...token, org: '' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
