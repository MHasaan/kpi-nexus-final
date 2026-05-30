/**
 * OrgUnitsService reorganization unit tests (Task B / v1 gap-closure).
 *
 * In-memory Prisma fake with a real-ish $transaction (snapshot + rollback on
 * throw) and a no-op audit. Covers the reorganization surface:
 *   - renameUnit: writes a name-history row (previousName=old, changedById)
 *     and updates the name in one transaction; cross-tenant → NotFound.
 *   - getNameHistory: rows desc by changedAt.
 *   - moveUsers: sets leftAt on the old membership + creates/reactivates the
 *     new one; reactivation respects the unique [orgUnitId,userId] constraint.
 *   - mergeUnits: reparents children to target, moves active members to
 *     target, archives the source (status ARCHIVED, never hard-deleted).
 *   - splitUnit: creates a new unit (same parent/type) + reassigns listed
 *     members from source.
 *   - descendantsVisibleToHead: BFS over parentUnitId, cycle-safe.
 *   - listMembershipsByUser: only active tenant rows.
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { OrgUnitsService } from './org-units.service.js';

interface FakeUnit {
  id: string;
  organizationId: string;
  orgUnitTypeId: string;
  parentUnitId: string | null;
  name: string;
  code: string | null;
  description: string | null;
  headUserId: string | null;
  status: string;
  visibilityInherits: boolean;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  metadata: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeMember {
  id: string;
  organizationId: string;
  orgUnitId: string;
  userId: string;
  memberRole: string;
  joinedAt: Date;
  leftAt: Date | null;
  leaveReason: string | null;
}

interface FakeHistory {
  id: string;
  orgUnitId: string;
  previousName: string;
  changedById: string;
  changedAt: Date;
}

const ORG = 'org_alpha';

/** Match a row's organizationId against a where clause that may omit it. */
function tenantMatch(rowOrg: string, where: Record<string, unknown>): boolean {
  return where.organizationId === undefined || rowOrg === where.organizationId;
}

class FakePrisma {
  private n = 1;
  units: FakeUnit[] = [];
  members: FakeMember[] = [];
  history: FakeHistory[] = [];

  orgUnit = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const u = this.units.find(
        (u) => u.id === where.id && tenantMatch(u.organizationId, where),
      );
      return u ? { ...u } : null;
    }),
    findMany: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) => {
        return this.units
          .filter((u) => tenantMatch(u.organizationId, where))
          .filter((u) =>
            where.parentUnitId === undefined
              ? true
              : u.parentUnitId === where.parentUnitId,
          )
          .map((u) => ({ ...u }));
      },
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const u: FakeUnit = {
        id: `ou_${this.n++}`,
        organizationId: data.organizationId as string,
        orgUnitTypeId: data.orgUnitTypeId as string,
        parentUnitId: (data.parentUnitId as string) ?? null,
        name: data.name as string,
        code: (data.code as string) ?? null,
        description: (data.description as string) ?? null,
        headUserId: (data.headUserId as string) ?? null,
        status: (data.status as string) ?? 'ACTIVE',
        visibilityInherits: (data.visibilityInherits as boolean) ?? true,
        effectiveFrom: (data.effectiveFrom as Date) ?? null,
        effectiveTo: (data.effectiveTo as Date) ?? null,
        metadata: data.metadata ?? null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.units.push(u);
      return { ...u };
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const u = this.units.find((u) => u.id === where.id)!;
        for (const k of Object.keys(data)) {
          if (data[k] !== undefined) (u as unknown as Record<string, unknown>)[k] = data[k];
        }
        u.updatedAt = new Date();
        return { ...u };
      },
    ),
    updateMany: vi.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const u of this.units) {
          if (
            tenantMatch(u.organizationId, where) &&
            (where.parentUnitId === undefined || u.parentUnitId === where.parentUnitId)
          ) {
            for (const k of Object.keys(data)) {
              if (data[k] !== undefined) (u as unknown as Record<string, unknown>)[k] = data[k];
            }
            count += 1;
          }
        }
        return { count };
      },
    ),
  };

  orgUnitMember = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const m = this.members.find(
        (m) =>
          tenantMatch(m.organizationId, where) &&
          (where.orgUnitId === undefined || m.orgUnitId === where.orgUnitId) &&
          (where.userId === undefined || m.userId === where.userId) &&
          (where.leftAt === undefined || m.leftAt === where.leftAt),
      );
      return m ? { ...m } : null;
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return this.members
        .filter(
          (m) =>
            tenantMatch(m.organizationId, where) &&
            (where.orgUnitId === undefined || m.orgUnitId === where.orgUnitId) &&
            (where.userId === undefined || m.userId === where.userId) &&
            (where.leftAt === undefined || m.leftAt === where.leftAt),
        )
        .map((m) => ({ ...m }));
    }),
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const key = where.orgUnitId_userId as { orgUnitId: string; userId: string } | undefined;
      if (!key) return null;
      const m = this.members.find(
        (m) => m.orgUnitId === key.orgUnitId && m.userId === key.userId,
      );
      return m ? { ...m } : null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const orgUnitId = data.orgUnitId as string;
      const userId = data.userId as string;
      if (this.members.some((m) => m.orgUnitId === orgUnitId && m.userId === userId)) {
        const e = new Error('Unique constraint failed') as Error & { code: string };
        e.code = 'P2002';
        throw e;
      }
      const m: FakeMember = {
        id: `m_${this.n++}`,
        organizationId: data.organizationId as string,
        orgUnitId,
        userId,
        memberRole: (data.memberRole as string) ?? 'MEMBER',
        joinedAt: new Date(),
        leftAt: null,
        leaveReason: null,
      };
      this.members.push(m);
      return { ...m };
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const m = this.members.find((m) => m.id === where.id)!;
        for (const k of Object.keys(data)) {
          if (data[k] !== undefined) (m as unknown as Record<string, unknown>)[k] = data[k];
        }
        return { ...m };
      },
    ),
  };

  orgUnitNameHistory = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const h: FakeHistory = {
        id: `h_${this.n++}`,
        orgUnitId: data.orgUnitId as string,
        previousName: data.previousName as string,
        changedById: data.changedById as string,
        changedAt: new Date(Date.now() + this.history.length), // monotonically increasing
      };
      this.history.push(h);
      return { ...h };
    }),
    findMany: vi.fn(
      async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: { changedAt?: 'asc' | 'desc' } }) => {
        const rows = this.history.filter((h) => h.orgUnitId === where.orgUnitId).map((h) => ({ ...h }));
        if (orderBy?.changedAt === 'desc') {
          rows.sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
        } else {
          rows.sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
        }
        return rows;
      },
    ),
  };

  // Real-ish atomic transaction: snapshot, run, roll back on throw.
  async $transaction<T>(fn: (tx: FakePrisma) => Promise<T>): Promise<T> {
    const snapU = this.units.map((u) => ({ ...u }));
    const snapM = this.members.map((m) => ({ ...m }));
    const snapH = this.history.map((h) => ({ ...h }));
    try {
      return await fn(this);
    } catch (e) {
      this.units = snapU;
      this.members = snapM;
      this.history = snapH;
      throw e;
    }
  }

  // ---- helpers for arranging test state ----
  seedUnit(partial: Partial<FakeUnit> & { id: string; name: string }): FakeUnit {
    const u: FakeUnit = {
      organizationId: ORG,
      orgUnitTypeId: 'type_1',
      parentUnitId: null,
      code: null,
      description: null,
      headUserId: null,
      status: 'ACTIVE',
      visibilityInherits: true,
      effectiveFrom: null,
      effectiveTo: null,
      metadata: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...partial,
    } as FakeUnit;
    this.units.push(u);
    return u;
  }

  seedMember(partial: Partial<FakeMember> & { id: string; orgUnitId: string; userId: string }): FakeMember {
    const m: FakeMember = {
      organizationId: ORG,
      memberRole: 'MEMBER',
      joinedAt: new Date(),
      leftAt: null,
      leaveReason: null,
      ...partial,
    } as FakeMember;
    this.members.push(m);
    return m;
  }
}

class FakeAudit {
  record = vi.fn(async () => {});
}

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    {
      userId: ctx.userId ?? 'u1',
      organizationId: ctx.organizationId ?? ORG,
      roleId: null,
      principalType: 'user',
    },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  const service = new OrgUnitsService(
    prisma as unknown as PrismaService,
    new FakeAudit() as unknown as AuditService,
  );
  return { service, prisma };
}

describe('OrgUnitsService — rename + name history', () => {
  test('renameUnit writes a history row with the OLD name + changedById, then updates the name', async () => {
    const { service, prisma } = makeService();
    prisma.seedUnit({ id: 'ou1', name: 'Old Name' });

    const updated = await withCtx({ userId: 'actor1' }, () =>
      service.renameUnit('ou1', 'New Name'),
    );

    expect(updated.name).toBe('New Name');
    // unit row actually mutated
    expect(prisma.units.find((u) => u.id === 'ou1')!.name).toBe('New Name');
    // history captured the OLD name + the acting user
    expect(prisma.history).toHaveLength(1);
    expect(prisma.history[0]!.previousName).toBe('Old Name');
    expect(prisma.history[0]!.orgUnitId).toBe('ou1');
    expect(prisma.history[0]!.changedById).toBe('actor1');
  });

  test('renameUnit cross-tenant → NotFound and writes nothing', async () => {
    const { service, prisma } = makeService();
    prisma.seedUnit({ id: 'ou1', name: 'Old', organizationId: 'org_a' });

    await expect(
      withCtx({ organizationId: 'org_b' }, () => service.renameUnit('ou1', 'New')),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.history).toHaveLength(0);
    expect(prisma.units.find((u) => u.id === 'ou1')!.name).toBe('Old');
  });

  test('getNameHistory returns rows newest-first', async () => {
    const { service, prisma } = makeService();
    prisma.seedUnit({ id: 'ou1', name: 'A' });
    await withCtx({}, () => service.renameUnit('ou1', 'B'));
    await withCtx({}, () => service.renameUnit('ou1', 'C'));

    const hist = await withCtx({}, () => service.getNameHistory('ou1'));
    expect(hist.map((h) => h.previousName)).toEqual(['B', 'A']);
  });
});

describe('OrgUnitsService — moveUsers', () => {
  test('moveUsers sets leftAt on the source membership and creates a new one in target', async () => {
    const { service, prisma } = makeService();
    prisma.seedUnit({ id: 'src', name: 'Source' });
    prisma.seedUnit({ id: 'dst', name: 'Target' });
    prisma.seedMember({ id: 'm1', orgUnitId: 'src', userId: 'userA' });

    await withCtx({}, () =>
      service.moveUsers({ userIds: ['userA'], fromUnitId: 'src', toUnitId: 'dst' }),
    );

    const srcMember = prisma.members.find((m) => m.orgUnitId === 'src' && m.userId === 'userA')!;
    expect(srcMember.leftAt).not.toBeNull();

    const dstMember = prisma.members.find((m) => m.orgUnitId === 'dst' && m.userId === 'userA');
    expect(dstMember).toBeDefined();
    expect(dstMember!.leftAt).toBeNull();
  });

  test('moveUsers reactivates a previously-left membership in target (respects unique constraint)', async () => {
    const { service, prisma } = makeService();
    prisma.seedUnit({ id: 'src', name: 'Source' });
    prisma.seedUnit({ id: 'dst', name: 'Target' });
    prisma.seedMember({ id: 'm1', orgUnitId: 'src', userId: 'userA' });
    // userA already has a LEFT membership row in dst — must be reactivated, not duplicated
    prisma.seedMember({
      id: 'mDstOld',
      orgUnitId: 'dst',
      userId: 'userA',
      leftAt: new Date('2020-01-01'),
      leaveReason: 'STRUCTURE_CHANGE',
    });

    await withCtx({}, () =>
      service.moveUsers({ userIds: ['userA'], fromUnitId: 'src', toUnitId: 'dst' }),
    );

    const dstRows = prisma.members.filter((m) => m.orgUnitId === 'dst' && m.userId === 'userA');
    expect(dstRows).toHaveLength(1); // no duplicate created
    expect(dstRows[0]!.id).toBe('mDstOld'); // same row reused
    expect(dstRows[0]!.leftAt).toBeNull(); // reactivated
  });

  test('moveUsers without fromUnitId only adds to target (no source side-effect)', async () => {
    const { service, prisma } = makeService();
    prisma.seedUnit({ id: 'dst', name: 'Target' });

    await withCtx({}, () => service.moveUsers({ userIds: ['userA'], toUnitId: 'dst' }));

    const dstMember = prisma.members.find((m) => m.orgUnitId === 'dst' && m.userId === 'userA');
    expect(dstMember).toBeDefined();
    expect(dstMember!.leftAt).toBeNull();
  });

  test('moveUsers with unknown target → NotFound', async () => {
    const { service } = makeService();
    await expect(
      withCtx({}, () => service.moveUsers({ userIds: ['userA'], toUnitId: 'nope' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OrgUnitsService — mergeUnits', () => {
  test('mergeUnits reparents children to target, moves active members, and archives the source', async () => {
    const { service, prisma } = makeService();
    prisma.seedUnit({ id: 'src', name: 'Source' });
    prisma.seedUnit({ id: 'dst', name: 'Target' });
    prisma.seedUnit({ id: 'child', name: 'Child', parentUnitId: 'src' });
    prisma.seedMember({ id: 'mActive', orgUnitId: 'src', userId: 'userA' });
    prisma.seedMember({
      id: 'mLeft',
      orgUnitId: 'src',
      userId: 'userB',
      leftAt: new Date('2020-01-01'),
    });

    await withCtx({}, () => service.mergeUnits('src', 'dst'));

    // children reparented to target
    expect(prisma.units.find((u) => u.id === 'child')!.parentUnitId).toBe('dst');
    // source archived, NOT deleted
    expect(prisma.units.find((u) => u.id === 'src')!.status).toBe('ARCHIVED');
    expect(prisma.units.find((u) => u.id === 'src')).toBeDefined();
    // active member moved: source row left, target row active
    expect(prisma.members.find((m) => m.id === 'mActive')!.leftAt).not.toBeNull();
    const movedToTarget = prisma.members.find((m) => m.orgUnitId === 'dst' && m.userId === 'userA');
    expect(movedToTarget).toBeDefined();
    expect(movedToTarget!.leftAt).toBeNull();
    // already-left member was NOT moved (no new dst row for userB)
    expect(prisma.members.some((m) => m.orgUnitId === 'dst' && m.userId === 'userB')).toBe(false);
  });

  test('mergeUnits cross-tenant target → NotFound', async () => {
    const { service, prisma } = makeService();
    prisma.seedUnit({ id: 'src', name: 'Source', organizationId: 'org_a' });
    prisma.seedUnit({ id: 'dst', name: 'Target', organizationId: 'org_b' });

    await expect(
      withCtx({ organizationId: 'org_a' }, () => service.mergeUnits('src', 'dst')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OrgUnitsService — splitUnit', () => {
  test('splitUnit creates a new unit (same parent/type) and reassigns the listed members', async () => {
    const { service, prisma } = makeService();
    prisma.seedUnit({ id: 'src', name: 'Source', parentUnitId: 'parent1', orgUnitTypeId: 'type_x' });
    prisma.seedMember({ id: 'mA', orgUnitId: 'src', userId: 'userA' });
    prisma.seedMember({ id: 'mB', orgUnitId: 'src', userId: 'userB' });

    const newUnit = await withCtx({}, () =>
      service.splitUnit('src', { newUnitName: 'Spun Off', memberUserIds: ['userA'] }),
    );

    expect(newUnit.name).toBe('Spun Off');
    expect(newUnit.parentUnitId).toBe('parent1');
    expect(newUnit.orgUnitTypeId).toBe('type_x');

    // userA moved to the new unit, left the source
    expect(prisma.members.find((m) => m.id === 'mA')!.leftAt).not.toBeNull();
    const aInNew = prisma.members.find((m) => m.orgUnitId === newUnit.id && m.userId === 'userA');
    expect(aInNew).toBeDefined();
    expect(aInNew!.leftAt).toBeNull();

    // userB stays in source untouched
    expect(prisma.members.find((m) => m.id === 'mB')!.leftAt).toBeNull();
    expect(prisma.members.some((m) => m.orgUnitId === newUnit.id && m.userId === 'userB')).toBe(false);
  });

  test('splitUnit cross-tenant source → NotFound', async () => {
    const { service, prisma } = makeService();
    prisma.seedUnit({ id: 'src', name: 'Source', organizationId: 'org_a' });
    await expect(
      withCtx({ organizationId: 'org_b' }, () =>
        service.splitUnit('src', { newUnitName: 'X', memberUserIds: [] }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OrgUnitsService — descendantsVisibleToHead (BFS)', () => {
  test('returns nested descendants', async () => {
    const { service, prisma } = makeService();
    prisma.seedUnit({ id: 'root', name: 'Root' });
    prisma.seedUnit({ id: 'a', name: 'A', parentUnitId: 'root' });
    prisma.seedUnit({ id: 'b', name: 'B', parentUnitId: 'root' });
    prisma.seedUnit({ id: 'a1', name: 'A1', parentUnitId: 'a' });
    prisma.seedUnit({ id: 'a1x', name: 'A1X', parentUnitId: 'a1' });

    const ids = await withCtx({}, () => service.descendantsVisibleToHead('root'));
    expect([...ids].sort()).toEqual(['a', 'a1', 'a1x', 'b']);
  });

  test('is cycle-safe (does not loop on a mutual parent cycle)', async () => {
    const { service, prisma } = makeService();
    // Pathological corrupt data: a and b are each other's parent (a <-> b).
    // BFS from `a` must visit `b` exactly once and terminate (no infinite loop).
    prisma.seedUnit({ id: 'a', name: 'A', parentUnitId: 'b' });
    prisma.seedUnit({ id: 'b', name: 'B', parentUnitId: 'a' });

    const ids = await withCtx({}, () => service.descendantsVisibleToHead('a'));
    // `a` is the seed (excluded); `b` is its child; the a<-b<-a loop must not
    // re-add `a`. Returns ['b'] and terminates.
    expect([...ids].sort()).toEqual(['b']);
  });

  test('does not cross tenant boundary', async () => {
    const { service, prisma } = makeService();
    prisma.seedUnit({ id: 'root', name: 'Root', organizationId: 'org_a' });
    prisma.seedUnit({ id: 'child', name: 'Child', parentUnitId: 'root', organizationId: 'org_b' });

    const ids = await withCtx({ organizationId: 'org_a' }, () =>
      service.descendantsVisibleToHead('root'),
    );
    expect(ids).toEqual([]);
  });
});

describe('OrgUnitsService — listMembershipsByUser', () => {
  test('returns only active memberships for that user in the tenant', async () => {
    const { service, prisma } = makeService();
    prisma.seedUnit({ id: 'u1', name: 'U1' });
    prisma.seedUnit({ id: 'u2', name: 'U2' });
    prisma.seedMember({ id: 'mActive', orgUnitId: 'u1', userId: 'userA' });
    prisma.seedMember({
      id: 'mLeft',
      orgUnitId: 'u2',
      userId: 'userA',
      leftAt: new Date('2020-01-01'),
    });
    // another user / another tenant must not leak in
    prisma.seedMember({ id: 'mOther', orgUnitId: 'u1', userId: 'userB' });
    prisma.seedMember({
      id: 'mForeign',
      orgUnitId: 'u1',
      userId: 'userA',
      organizationId: 'org_other',
    });

    const rows = await withCtx({}, () => service.listMembershipsByUser('userA'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('mActive');
    expect(rows[0]!.orgUnitId).toBe('u1');
  });
});
