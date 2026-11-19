/**
 * Mentioning a colleague, for someone who may not list people.
 *
 * A comment's "@" offered a member only the people who had already commented
 * on the item, so a first mention reached nobody. Owner decision 2026-11-19:
 * whoever may comment may look a colleague up by name to mention them —
 * names only. This is that look-up: a name and an id, never an email, a role
 * or a status; this organisation's active members only; never a listing.
 */
import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { CommentsService } from './comments.service.js';
import { MentionableQuerySchema } from './dto/comment.dto.js';

const ORG = 'org_alpha';

interface Person {
  id: string;
  organizationId: string;
  fullName: string;
  email: string;
  status: string;
}

type TextFilter = { startsWith?: string; contains?: string; mode?: string };
interface Where {
  organizationId: string;
  status: string;
  id: { not: string };
  OR: Array<{ fullName: TextFilter }>;
}

/** Enough of Prisma to answer the look-up's one query as Postgres would. */
function makeService(people: Person[]) {
  const findMany = vi.fn(async ({ where, select, take }: { where: Where; select: Record<string, boolean>; orderBy: unknown; take: number }) => {
    const matches = (name: string, f: TextFilter) => {
      const n = f.mode === 'insensitive' ? name.toLowerCase() : name;
      const v = (s: string) => (f.mode === 'insensitive' ? s.toLowerCase() : s);
      return f.startsWith !== undefined ? n.startsWith(v(f.startsWith)) : n.includes(v(f.contains!));
    };
    return people
      .filter((p) => p.organizationId === where.organizationId && p.status === where.status && p.id !== where.id.not)
      .filter((p) => where.OR.some((o) => matches(p.fullName, o.fullName)))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .slice(0, take)
      .map((p) => Object.fromEntries(Object.keys(select).map((k) => [k, (p as unknown as Record<string, unknown>)[k]])));
  });
  const service = new CommentsService({ user: { findMany } } as unknown as PrismaService, {} as AuditService);
  return { service, findMany };
}

const person = (id: string, fullName: string, extra: Partial<Person> = {}): Person => ({
  id,
  fullName,
  organizationId: ORG,
  email: `${id}@alpha.test`,
  status: 'ACTIVE',
  ...extra,
});

function as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const ctx: RequestContext = { userId, organizationId: ORG, roleId: null, principalType: 'user' };
  return RequestContextStore.run(ctx, fn) as Promise<T>;
}

const PEOPLE = [
  person('ada', 'Ada Admin'),
  person('adnan', 'Adnan Sheikh'),
  person('eli', 'Eli Employee'),
  person('sara', 'Sara Adeel'),
  person('zed', 'Zed Adams', { status: 'INVITED' }),
  person('gone', 'Adele Former', { status: 'ARCHIVED' }),
  person('other', 'Adam Elsewhere', { organizationId: 'org_beta' }),
];

describe('CommentsService.mentionable', () => {
  test('finds colleagues whose first or last name starts with what was typed, whatever its case', async () => {
    const { service } = makeService(PEOPLE);
    expect((await as('eli', () => service.mentionable('ad'))).map((p) => p.fullName)).toEqual(['Ada Admin', 'Adnan Sheikh', 'Sara Adeel']);
    expect((await as('eli', () => service.mentionable('SHE'))).map((p) => p.fullName)).toEqual(['Adnan Sheikh']);
  });

  test('gives a name and an id — nothing else about the person', async () => {
    const { service } = makeService(PEOPLE);
    const [first] = await as('eli', () => service.mentionable('ada'));
    expect(first).toEqual({ id: 'ada', fullName: 'Ada Admin' });
  });

  test('only active members of this organisation, and never the person asking', async () => {
    const { service, findMany } = makeService(PEOPLE);
    const found = await as('ada', () => service.mentionable('ad'));
    // Not Ada herself, not the invited Zed Adams, not the archived Adele, not Adam of another organisation.
    expect(found.map((p) => p.id)).toEqual(['adnan', 'sara']);
    expect(findMany.mock.calls[0]![0].where).toMatchObject({ organizationId: ORG, status: 'ACTIVE', id: { not: 'ada' } });
  });

  test('it is a look-up, not a list: nothing typed finds nobody, and an answer holds eight names at most', async () => {
    const many = Array.from({ length: 20 }, (_, i) => person(`p${i}`, `Pat Person${String(i).padStart(2, '0')}`));
    const { service, findMany } = makeService(many);
    expect(await as('eli', () => service.mentionable('  '))).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    expect(await as('eli', () => service.mentionable('pat'))).toHaveLength(8);
  });
});

describe('MentionableQuerySchema', () => {
  test('takes a name as typed, in any alphabet', () => {
    expect(MentionableQuerySchema.parse({ query: " Zoë O'Neil-Smith " })).toEqual({ query: "Zoë O'Neil-Smith" });
  });
  test('refuses what is not part of a name — the wildcards a search would otherwise obey among them', () => {
    for (const query of ['%', 'a_', 'a%b', '<x>', 'x'.repeat(65)]) {
      expect(MentionableQuerySchema.safeParse({ query }).success, query).toBe(false);
    }
  });
});
