'use client';

import { type PersonLite, listUsers, meRequest, userNames } from './api-client';
import { distinctIds, peopleFor } from './people';
import { useAsyncData } from './use-async-data';
import { usePermissions } from './use-permissions';

/**
 * The people a page can name and offer in pickers (see `peopleFor`).
 *
 * @param ids ids the page holds — assignees, owners, authors. Used only when
 *   the reader may not list people; pass them once the page's own data loads.
 *
 * Never asks for `GET /users` on behalf of someone who would be refused it.
 * A failure leaves the list empty: names fall back to the page's own
 * placeholder rather than breaking it.
 */
/** A person a page can name; the email is present only for readers who may list people. */
export type Person = PersonLite & { email?: string };

export function usePeople(ids: ReadonlyArray<string | null | undefined>): Person[] {
  const { ready, authenticated, has } = usePermissions();
  const canList = has('USERS_VIEW');
  const wanted = distinctIds(ids);
  const people = useAsyncData(
    async (): Promise<Person[]> => {
      if (canList) return listUsers();
      const [me, named] = await Promise.all([meRequest().catch(() => null), userNames(wanted)]);
      return peopleFor(named, me ? { id: me.user.id, fullName: me.user.fullName } : null);
    },
    [canList, wanted.join(',')],
    { enabled: ready && authenticated },
  );
  return people.data ?? [];
}
