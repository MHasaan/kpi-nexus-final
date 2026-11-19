/**
 * Mentions in a comment: "@" and a name notifies that person.
 *
 * It used to match only the exact full name without its spaces (or the first
 * part of an email), offered nothing while typing, and a miss notified nobody
 * without saying so. These helpers find the @word being typed, offer people
 * for it, write the pick into the text, and say who a finished text will
 * notify — and which @words match no one.
 */

/** A person who can be mentioned; the email is known only to readers who may list people. */
export interface Mentionable {
  id: string;
  fullName: string;
  email?: string | null;
}

/** An @word: letters and digits of any alphabet, with . _ - ' inside it. */
const HANDLE = "[\\p{L}\\p{N}][\\p{L}\\p{N}._'-]*";
const MENTION = new RegExp(`(?:^|\\s)@(${HANDLE})`, 'gu');
const TYPING = new RegExp(`(?:^|\\s)@((?:${HANDLE})?)$`, 'u');

const fold = (s: string): string => s.toLocaleLowerCase();
const lettersOnly = (s: string): string => s.replace(/[^\p{L}\p{N}]/gu, '');

/** What is written for a person: their name without spaces or punctuation ("Zoë O'Neil" → "ZoëONeil"). */
export function mentionHandle(person: Mentionable): string {
  return lettersOnly(person.fullName);
}

const emailName = (person: Mentionable): string | null => person.email?.split('@')[0] ?? null;
const nameWords = (person: Mentionable): string[] => person.fullName.split(/\s+/).filter(Boolean);

export interface MentionQuery {
  /** What has been typed after the @ so far. */
  query: string;
  /** Where the @ is, and where the word ends (the caret). */
  start: number;
  end: number;
}

/** The @word being typed at the caret, or null when the caret is not at the end of one. */
export function mentionQueryAt(text: string, caret: number): MentionQuery | null {
  const match = TYPING.exec(text.slice(0, caret));
  if (!match) return null;
  const query = match[1] ?? '';
  return { query, start: caret - query.length - 1, end: caret };
}

/** People to offer for what has been typed: a name word, the whole name or the email starts with it. Never the writer. */
export function suggestMentions<P extends Mentionable>(people: readonly P[], query: string, selfId: string | null, limit = 6): P[] {
  const q = fold(query);
  const plain = fold(lettersOnly(query));
  return people
    .filter((p) => p.id !== selfId)
    .filter(
      (p) =>
        q === '' ||
        nameWords(p).some((w) => fold(w).startsWith(q)) ||
        (plain !== '' && fold(mentionHandle(p)).startsWith(plain)) ||
        (emailName(p) !== null && fold(emailName(p)!).startsWith(q)),
    )
    .slice(0, limit);
}

/** Put a picked person where the @word was. Returns the new text and where the caret belongs. */
export function pickMention(text: string, at: MentionQuery, person: Mentionable): { text: string; caret: number } {
  const written = `@${mentionHandle(person)} `;
  const rest = text.slice(at.end).replace(/^ /, '');
  return { text: text.slice(0, at.start) + written + rest, caret: at.start + written.length };
}

/**
 * Who a text will notify, and the @words that match no one.
 *
 * An @word finds a person by their handle, by the first part of their email,
 * or by one word of their name when only one person has it — "@omar" with two
 * Omars is not guessed at. The writer is never notified.
 */
export function resolveMentions<P extends Mentionable>(text: string, people: readonly P[], selfId: string | null): { people: P[]; unknown: string[] } {
  const found = new Map<string, P>();
  const unknown: string[] = [];
  for (const match of text.matchAll(MENTION)) {
    // A full stop or comma that ends the sentence is not part of the name.
    const word = (match[1] ?? '').replace(/[._'-]+$/u, '');
    if (!word) continue;
    const w = fold(word);
    const exact = people.filter((p) => fold(mentionHandle(p)) === fold(lettersOnly(word)) || (emailName(p) !== null && fold(emailName(p)!) === w));
    const byWord = exact.length > 0 ? exact : people.filter((p) => nameWords(p).some((n) => fold(n) === w));
    const hit = exact.length > 0 ? exact : byWord.length === 1 ? byWord : [];
    if (hit.length === 0) {
      if (!unknown.includes(word)) unknown.push(word);
      continue;
    }
    for (const p of hit) if (p.id !== selfId) found.set(p.id, p);
  }
  return { people: [...found.values()], unknown };
}
