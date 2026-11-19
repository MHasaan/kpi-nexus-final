'use client';

import { useEffect, useId, useState } from 'react';

import type { PersonLite } from '../lib/api-client';
import { lookupMentionable } from '../lib/collab-client';
import { isLookupQuery } from '../lib/mentions';
import { usePermissions } from '../lib/use-permissions';
import { Input, Label } from './ui';

/**
 * "Find a colleague by name", under a people picker, for someone who may not list people (X-05).
 *
 * Such a picker offers only the reader and the people the page already names, so an Employee could not
 * give a task to a colleague who was on no task yet. The owner agreed on 2026-11-20 that they may look a
 * colleague up by name, names only, as a mention already does (2026-11-19): this asks the same
 * `POST /comments/mentionable`, which answers with the id and name of active colleagues whose name starts
 * with what was typed — never an email, never the asker, at most eight. It needs the permission to view
 * KPIs, which every page with such a picker needs too. Someone who may list people has everyone in the
 * picker already, and sees nothing here.
 */
export function FindColleague({
  testId,
  onPick,
  exclude,
}: {
  /** Prefix for the box's test ids: `<testId>-find-input`, `-find-results`, `-find-none`, `-find-hint`. */
  testId: string;
  /** Called with the person picked; the page adds them to its picker and chooses them. */
  onPick: (person: PersonLite) => void;
  /** People not to offer, e.g. the unit's members already. */
  exclude?: ReadonlySet<string>;
}) {
  const { ready, has } = usePermissions();
  const searches = ready && has('KPI_VIEW') && !has('USERS_VIEW');
  const inputId = useId();
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<{ query: string; people: PersonLite[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const query = text.trim();
  const askable = isLookupQuery(query);

  useEffect(() => {
    if (!searches || !askable) return;
    let stale = false;
    // A short wait, so a name typed quickly is asked for once, not once a letter.
    const timer = setTimeout(() => {
      lookupMentionable(query).then(
        (people) => {
          if (stale) return;
          setAnswer({ query, people });
          setFailed(false);
        },
        () => {
          if (!stale) setFailed(true);
        },
      );
    }, 200);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [searches, askable, query]);

  if (!searches) return null;
  // Only the answer to what is in the box now: an older one would offer names for other letters.
  const found = askable && answer?.query === query ? answer.people.filter((p) => !exclude?.has(p.id)) : null;
  const pick = (person: PersonLite) => {
    onPick(person);
    setText('');
    setAnswer(null);
  };

  return (
    <div className="mt-2 flex flex-col gap-1" data-testid={`${testId}-find`}>
      <Label htmlFor={inputId} className="text-xs font-normal text-content-muted">
        Find a colleague by name
      </Label>
      <Input
        id={inputId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a name…"
        autoComplete="off"
        data-testid={`${testId}-find-input`}
      />
      {query !== '' && !askable && (
        <p className="text-xs text-content-muted" data-testid={`${testId}-find-hint`}>
          A name has letters, digits, spaces and . &apos; - only.
        </p>
      )}
      {askable && failed && (
        <p role="alert" className="text-xs text-status-critical">
          Could not look anyone up just now. Try again in a moment.
        </p>
      )}
      {found &&
        (found.length === 0 ? (
          <p className="text-xs text-content-muted" data-testid={`${testId}-find-none`}>
            No colleague by that name.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" data-testid={`${testId}-find-results`}>
            {found.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => pick(person)}
                  className="rounded-md border border-border px-2 py-1 text-xs text-content-default transition-colors hover:border-accent-primary hover:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {person.fullName}
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
