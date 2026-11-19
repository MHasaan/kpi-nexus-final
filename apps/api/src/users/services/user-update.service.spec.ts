import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../../tenancy/request-context.js';
import { UserUpdateService } from './user-update.service.js';

const ORG = 'org_1';

interface U {
  id: string;
  organizationId: string;
  fullName: string;
  status: string;
  roleId: string | null;
  managerId: string | null;
  positionId: string | null;
}

let users: U[];
let roles: Array<{ id: string; organizationId: string; isAdmin: boolean }>;
let positions: Array<{ id: string; organizationId: string }>;
let callerIsAdmin: boolean;
let visible: string[] | null;

const prisma = {
  user: {
    findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
      users.find((u) => u.id === where.id && u.organizationId === where.organizationId) ?? null,
    ),
    count: vi.fn(async ({ where }: { where: { organizationId: string; status: string; id: { not: string }; role: { isAdmin: boolean } } }) =>
      users.filter(
        (u) =>
          u.organizationId === where.organizationId &&
          u.status === where.status &&
          u.id !== where.id.not &&
          roles.find((r) => r.id === u.roleId)?.isAdmin === true,
      ).length,
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<U> }) => {
      const u = users.find((x) => x.id === where.id)!;
      Object.assign(u, data);
      return u;
    }),
  },
  roleDefinition: {
    findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
      roles.find((r) => r.id === where.id && r.organizationId === where.organizationId) ?? null,
    ),
  },
  position: {
    findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
      positions.find((p) => p.id === where.id && p.organizationId === where.organizationId) ?? null,
    ),
  },
};
const audit = { record: vi.fn(async () => undefined) };
const accessContext = {
  invalidate: vi.fn((_org: string, _user: string) => undefined),
  isPersonVisible: vi.fn(async (id: string) => visible === null || visible.includes(id)),
  resolveForCurrentPrincipal: vi.fn(async () => ({ isAdmin: callerIsAdmin })),
};

const resolver = { invalidate: vi.fn((_org: string, _user: string) => undefined) };
const svc = () => new UserUpdateService(prisma as never, audit as never, accessContext as never, resolver as never);
const user = (id: string, over: Partial<U> = {}): U => ({
  id,
  organizationId: ORG,
  fullName: `User ${id}`,
  status: 'ACTIVE',
  roleId: 'role_member',
  managerId: null,
  positionId: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  callerIsAdmin = true;
  visible = null;
  roles = [
    { id: 'role_admin', organizationId: ORG, isAdmin: true },
    { id: 'role_member', organizationId: ORG, isAdmin: false },
    { id: 'role_other_org', organizationId: 'org_2', isAdmin: false },
  ];
  positions = [{ id: 'pos_eng', organizationId: ORG }, { id: 'pos_other_org', organizationId: 'org_2' }];
  users = [
    user('caller', { roleId: 'role_admin' }),
    user('ceo', { roleId: 'role_admin' }),
    user('lead', { managerId: 'ceo' }),
    user('dev', { managerId: 'lead' }),
    user('outsider', { organizationId: 'org_2' }),
  ];
  vi.spyOn(RequestContextStore, 'require').mockReturnValue({
    organizationId: ORG,
    userId: 'caller',
    roleId: 'role_admin',
    principalType: 'user',
  } as never);
});

describe('UserUpdateService.update (UI-010)', () => {
  it('sets a manager, a position, a role and a name in one go', async () => {
    const updated = await svc().update('dev', {
      fullName: 'Dev Renamed',
      roleId: 'role_admin',
      managerId: 'ceo',
      positionId: 'pos_eng',
    });
    expect(updated).toMatchObject({ fullName: 'Dev Renamed', roleId: 'role_admin', managerId: 'ceo', positionId: 'pos_eng' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'User', entityId: 'dev' }),
    );
  });

  // Flow walk: what a person may do is kept in memory for five minutes; a role change left the old
  // answer in place.
  it('a changed role drops what was kept about that person’s permissions', async () => {
    await svc().update('dev', { roleId: 'role_admin' });
    expect(resolver.invalidate).toHaveBeenCalledWith(ORG, 'dev');
    expect(accessContext.invalidate).toHaveBeenCalledWith(ORG, 'dev');
  });

  it('a changed manager drops what was kept about the person and both managers', async () => {
    // dev reports to lead; move them under the ceo.
    await svc().update('dev', { managerId: 'ceo' });
    const dropped = accessContext.invalidate.mock.calls.map((c) => c[1]).sort();
    expect(dropped).toEqual(['ceo', 'dev', 'lead']);
    expect(resolver.invalidate).not.toHaveBeenCalled();
  });

  it('a changed name drops nothing', async () => {
    await svc().update('dev', { fullName: 'Dev Renamed' });
    expect(resolver.invalidate).not.toHaveBeenCalled();
    expect(accessContext.invalidate).not.toHaveBeenCalled();
  });

  it('null clears a manager and a position; a key left out is left alone', async () => {
    users.find((u) => u.id === 'dev')!.positionId = 'pos_eng';
    const updated = await svc().update('dev', { managerId: null });
    expect(updated.managerId).toBeNull();
    expect(updated.positionId).toBe('pos_eng');
  });

  describe('who', () => {
    it('someone in another organisation is a 404', async () => {
      await expect(svc().update('outsider', { fullName: 'Nope' })).rejects.toMatchObject({ status: 404 });
    });

    it('someone outside the caller’s PEOPLE scope is a 404, as if absent', async () => {
      visible = ['caller'];
      await expect(svc().update('dev', { fullName: 'Nope' })).rejects.toMatchObject({ status: 404 });
    });

    it('an erased account cannot be edited', async () => {
      users.find((u) => u.id === 'dev')!.status = 'PURGED';
      await expect(svc().update('dev', { fullName: 'Nope' })).rejects.toMatchObject({
        status: 400,
        response: { code: 'NOT_EDITABLE' },
      });
    });
  });

  describe('role', () => {
    it('nobody changes their own role', async () => {
      await expect(svc().update('caller', { roleId: 'role_member' })).rejects.toMatchObject({
        status: 400,
        response: { code: 'SELF_ROLE_CHANGE' },
      });
    });

    it('a role from another organisation is refused', async () => {
      await expect(svc().update('dev', { roleId: 'role_other_org' })).rejects.toMatchObject({ status: 400 });
    });

    it('only an administrator can make someone an administrator', async () => {
      callerIsAdmin = false;
      await expect(svc().update('dev', { roleId: 'role_admin' })).rejects.toMatchObject({
        status: 403,
        response: { code: 'ADMIN_ROLE_REQUIRES_ADMIN' },
      });
    });

    it('only an administrator can take the administrator role away', async () => {
      callerIsAdmin = false;
      await expect(svc().update('ceo', { roleId: 'role_member' })).rejects.toMatchObject({ status: 403 });
    });

    it('the last active administrator cannot be demoted', async () => {
      users = users.filter((u) => u.id !== 'caller'); // only `ceo` holds the admin role now
      users.push(user('caller', { roleId: 'role_member' }));
      await expect(svc().update('ceo', { roleId: 'role_member' })).rejects.toMatchObject({
        status: 400,
        response: { code: 'LAST_ADMIN' },
      });
    });

    it('an administrator can be demoted while another remains', async () => {
      const updated = await svc().update('ceo', { roleId: 'role_member' });
      expect(updated.roleId).toBe('role_member');
    });

    it('a non-admin may move someone between ordinary roles', async () => {
      callerIsAdmin = false;
      roles.push({ id: 'role_analyst', organizationId: ORG, isAdmin: false });
      const updated = await svc().update('dev', { roleId: 'role_analyst' });
      expect(updated.roleId).toBe('role_analyst');
    });
  });

  describe('manager', () => {
    it('nobody manages themselves', async () => {
      await expect(svc().update('dev', { managerId: 'dev' })).rejects.toMatchObject({
        status: 400,
        response: { code: 'SELF_MANAGER' },
      });
    });

    it('a manager must be in the same organisation', async () => {
      await expect(svc().update('dev', { managerId: 'outsider' })).rejects.toMatchObject({ status: 400 });
    });

    it('a reporting loop is refused: a lead cannot report to their own report', async () => {
      // ceo ← lead ← dev. Making lead report to dev would close the loop.
      await expect(svc().update('lead', { managerId: 'dev' })).rejects.toMatchObject({
        status: 400,
        response: { code: 'MANAGER_CYCLE' },
      });
    });

    it('a loop further up the chain is caught too', async () => {
      await expect(svc().update('ceo', { managerId: 'dev' })).rejects.toMatchObject({
        status: 400,
        response: { code: 'MANAGER_CYCLE' },
      });
    });

    it('an archived person cannot be made a manager', async () => {
      users.find((u) => u.id === 'lead')!.status = 'ARCHIVED';
      users.push(user('newbie'));
      await expect(svc().update('newbie', { managerId: 'lead' })).rejects.toMatchObject({ status: 400 });
    });
  });

  it('sending the value a person already has changes nothing and audits nothing', async () => {
    await svc().update('dev', { managerId: 'lead' });
    expect(audit.record).not.toHaveBeenCalled();
  });

  describe('position', () => {
    it('a position from another organisation is refused', async () => {
      await expect(svc().update('dev', { positionId: 'pos_other_org' })).rejects.toMatchObject({ status: 400 });
    });
  });
});
