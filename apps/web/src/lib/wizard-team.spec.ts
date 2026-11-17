import { describe, expect, test } from 'vitest';

import { managerChoices, mergeTeam, parseTeamList, removeTeamMember, retargetManager, setTeamEmail, setTeamField } from './wizard-team';

const draft = {
  roles: [{ name: 'Admin', isAdmin: true }, { name: 'Member' }],
  positions: [{ name: 'Engineer' }],
  orgUnits: [{ name: 'Engineering', type: 'Department' }],
};

describe('parseTeamList', () => {
  test('one person per line: email, name, role, position, unit, manager', () => {
    const { rows, skipped } = parseTeamList('lena@acme.test, Lena Lead, member, engineer, ENGINEERING\ndev@acme.test, Dev Person, , , , Lena@acme.test', draft);
    expect(skipped).toBe(0);
    expect(rows).toEqual([
      { email: 'lena@acme.test', fullName: 'Lena Lead', role: 'Member', position: 'Engineer', unit: 'Engineering' },
      { email: 'dev@acme.test', fullName: 'Dev Person', manager: 'lena@acme.test' },
    ]);
  });

  test('just emails is enough', () => {
    expect(parseTeamList('a@acme.test\n\n  b@acme.test  \n', draft).rows).toEqual([
      { email: 'a@acme.test', fullName: '' },
      { email: 'b@acme.test', fullName: '' },
    ]);
  });

  test('a spreadsheet paste is tab-separated, and may be name first', () => {
    expect(parseTeamList('Lena Lead\tlena@acme.test\tMember', draft).rows).toEqual([{ email: 'lena@acme.test', fullName: 'Lena Lead', role: 'Member' }]);
  });

  test('a header row names the columns, in any order and any spelling', () => {
    const text = 'Full name;E-mail;Department;Reports to\nLena Lead;LENA@acme.test;engineering;boss@acme.test';
    expect(parseTeamList(text, draft).rows).toEqual([{ email: 'lena@acme.test', fullName: 'Lena Lead', unit: 'Engineering', manager: 'boss@acme.test' }]);
  });

  test('a line with no email in it is skipped and counted', () => {
    const { rows, skipped } = parseTeamList('not a person\nreal@acme.test, Real Person', draft);
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  test('a role that the draft does not have is kept as typed, to be flagged', () => {
    expect(parseTeamList('x@acme.test, Ex, Wizard', draft).rows[0]!.role).toBe('Wizard');
  });

  test('a quoted cell may hold the separator, and a doubled quote is one quote', () => {
    const line = '"q@acme.test","Name, Quoted","The ""Member"""';
    expect(parseTeamList(line, draft).rows[0]).toEqual({ email: 'q@acme.test', fullName: 'Name, Quoted', role: 'The "Member"' });
  });
});

describe('mergeTeam', () => {
  test('adds new people and leaves out anyone already listed, whatever the capitals', () => {
    const existing = [{ email: 'a@acme.test', fullName: 'A' }];
    const result = mergeTeam(existing, [{ email: 'A@acme.test', fullName: 'Again' }, { email: 'b@acme.test', fullName: 'B' }, { email: 'b@acme.test', fullName: 'B twice' }]);
    expect(result.team.map((p) => p.email)).toEqual(['a@acme.test', 'b@acme.test']);
    expect(result).toMatchObject({ added: 1, duplicates: 2 });
  });
});

describe('reporting lines follow edits', () => {
  const team = [
    { email: 'lena@acme.test', fullName: 'Lena', manager: 'boss@acme.test' },
    { email: 'dev@acme.test', fullName: 'Dev', manager: 'LENA@acme.test' },
    { email: 'ops@acme.test', fullName: 'Ops' },
  ];

  test('changing an email changes it on the people who report to them', () => {
    expect(setTeamEmail(team, 0, 'lena.lead@acme.test').map((p) => p.manager)).toEqual(['boss@acme.test', 'lena.lead@acme.test', undefined]);
  });

  test('removing someone leaves their reports with no manager', () => {
    const after = removeTeamMember(team, 0);
    expect(after.map((p) => p.email)).toEqual(['dev@acme.test', 'ops@acme.test']);
    expect(after[0]).toEqual({ email: 'dev@acme.test', fullName: 'Dev' });
  });

  test('when the administrator changes their email, their reports follow', () => {
    expect(retargetManager(team, 'Boss@acme.test', 'ceo@acme.test')!.map((p) => p.manager)).toEqual(['ceo@acme.test', 'LENA@acme.test', undefined]);
    expect(retargetManager(team, 'nobody@acme.test', 'x@acme.test')).toBeNull();
    expect(retargetManager(team, '', 'x@acme.test')).toBeNull();
  });
});

describe('managerChoices', () => {
  const team = [{ email: 'lena@acme.test', fullName: 'Lena Lead' }, { email: 'dev@acme.test', fullName: '' }, { email: '', fullName: 'No Email Yet' }];

  test('the administrator first, then everyone else with an email — never oneself', () => {
    expect(managerChoices(team, 1, 'boss@acme.test')).toEqual([
      { value: 'boss@acme.test', label: 'Me (boss@acme.test)' },
      { value: 'lena@acme.test', label: 'Lena Lead (lena@acme.test)' },
    ]);
  });

  test('with no administrator email yet, only the others', () => {
    expect(managerChoices(team, 0, '').map((c) => c.value)).toEqual(['dev@acme.test']);
  });
});

describe('setTeamField', () => {
  test('choosing "none" removes the field', () => {
    const person = setTeamField({ email: 'a@acme.test', fullName: 'A' }, 'role', 'Member');
    expect(person.role).toBe('Member');
    expect(setTeamField(person, 'role', '')).toEqual({ email: 'a@acme.test', fullName: 'A' });
  });
});
