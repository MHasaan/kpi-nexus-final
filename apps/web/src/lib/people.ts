import type { PersonLite } from './api-client';

/**
 * Who a page can name and offer in its pickers.
 *
 * Someone who may list people gets everyone, as before. Someone who may not
 * gets the people already involved in what the page shows (their names come
 * from `POST /users/names`) plus themselves — enough to read every name on the
 * page and to assign something to themselves, without the page asking for a
 * list it would be refused (X-05).
 */
export function peopleFor(named: readonly PersonLite[], me: PersonLite | null): PersonLite[] {
  const byId = new Map<string, PersonLite>();
  if (me) byId.set(me.id, me);
  for (const person of named) byId.set(person.id, person);
  return [...byId.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** The distinct, non-empty ids in a list that may hold nulls and repeats, in a stable order. */
export function distinctIds(ids: ReadonlyArray<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id !== ''))].sort();
}
