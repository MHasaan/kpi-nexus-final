/**
 * Flow walk (comments): "Type @ and a name to notify someone" — but only the
 * exact full name without spaces (or an email's first part) matched, nothing
 * was offered while typing, and a miss notified nobody and said nothing.
 */
import { describe, expect, test } from 'vitest';

import { mentionHandle, mentionQueryAt, pickMention, resolveMentions, suggestMentions } from './mentions';

const sara = { id: 'u1', fullName: 'Sara Admin', email: 'sara.a@acme.test' };
const omar = { id: 'u2', fullName: 'Omar Sheikh' };
const zoe = { id: 'u3', fullName: "Zoë O'Neil" };
const people = [sara, omar, zoe];

describe('mentionQueryAt', () => {
  test('finds the @word being typed at the caret', () => {
    expect(mentionQueryAt('Numbers look low, @Sa', 21)).toEqual({ query: 'Sa', start: 18, end: 21 });
    expect(mentionQueryAt('@', 1)).toEqual({ query: '', start: 0, end: 1 });
  });
  test('nothing when the caret is not in an @word, or the @ is inside a word (an email)', () => {
    expect(mentionQueryAt('Numbers look low', 16)).toBeNull();
    expect(mentionQueryAt('write to sara@acme', 18)).toBeNull();
    expect(mentionQueryAt('@Sara thanks', 12)).toBeNull();
  });
});

describe('suggestMentions', () => {
  test('offers people whose first or last name, or email, starts with what was typed — never the writer', () => {
    expect(suggestMentions(people, 'o', 'u1').map((p) => p.fullName)).toEqual(['Omar Sheikh', "Zoë O'Neil"]);
    expect(suggestMentions(people, 'she', 'u1').map((p) => p.fullName)).toEqual(['Omar Sheikh']);
    expect(suggestMentions(people, 'sara', 'u2').map((p) => p.fullName)).toEqual(['Sara Admin']);
    expect(suggestMentions(people, 'sara', 'u1')).toEqual([]);
  });
  test('a bare @ offers everyone else, at most six', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, fullName: `Person ${i}` }));
    expect(suggestMentions(many, '', 'p0')).toHaveLength(6);
  });
});

describe('pickMention', () => {
  test('replaces the @word with the person\'s handle and a space, and says where the caret goes', () => {
    const at = mentionQueryAt('Numbers look low, @Sa', 21)!;
    expect(pickMention('Numbers look low, @Sa', at, sara)).toEqual({ text: 'Numbers look low, @SaraAdmin ', caret: 29 });
  });
  test('a handle keeps the letters of any alphabet and drops what is not a letter or digit', () => {
    expect(mentionHandle(zoe)).toBe('ZoëONeil');
  });
});

describe('resolveMentions', () => {
  test('a picked handle, a first name that only one person has, and an email\'s first part all find the person', () => {
    expect(resolveMentions('@SaraAdmin and @omar, see this', people, 'u3').people.map((p) => p.id)).toEqual(['u1', 'u2']);
    expect(resolveMentions('@sara.a please', people, 'u3').people.map((p) => p.id)).toEqual(['u1']);
    expect(resolveMentions('@zoëoneil', people, 'u1').people.map((p) => p.id)).toEqual(['u3']);
  });
  test('a name nobody has is reported, not swallowed', () => {
    expect(resolveMentions('@Sa can you look?', people, 'u3')).toEqual({ people: [], unknown: ['Sa'] });
  });
  test('a first name two people share is not guessed at', () => {
    const two = [...people, { id: 'u4', fullName: 'Omar Farooq' }];
    expect(resolveMentions('@omar', two, 'u1')).toEqual({ people: [], unknown: ['omar'] });
    expect(resolveMentions('@OmarFarooq', two, 'u1').people.map((p) => p.id)).toEqual(['u4']);
  });
  test('mentioning yourself notifies nobody and is not called unknown', () => {
    expect(resolveMentions('@SaraAdmin', people, 'u1')).toEqual({ people: [], unknown: [] });
  });
});
