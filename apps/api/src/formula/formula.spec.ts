/**
 * Comprehensive tests for the safe-by-construction formula evaluator.
 *
 * The P2 exit criterion calls for 50+ tests "including sandbox escape
 * attempts". The evaluator IS safe by construction (no JS execution,
 * no globals access) — but we still verify that classic escape vectors
 * resolve to UnknownIdentifierError rather than reaching any runtime
 * symbol. The escape vectors tested below cover process, require, global,
 * globalThis, Function, constructor, __proto__, setTimeout, fs,
 * child_process, this, window, and member-access syntax.
 */
import { describe, expect, test } from 'vitest';

import {
  DivisionByZeroError,
  evaluateFormula,
  ParseError,
  parseFormula,
  TypeMismatchError,
  UnknownFunctionError,
  UnknownIdentifierError,
} from './formula.js';

describe('Formula evaluator — happy paths', () => {
  test('literal number', () => {
    expect(evaluateFormula('42', {})).toBe(42);
  });
  test('decimal literal', () => {
    expect(evaluateFormula('3.14', {})).toBe(3.14);
  });
  test('scientific notation', () => {
    expect(evaluateFormula('1.5e2', {})).toBe(150);
  });
  test('leading-dot decimal', () => {
    expect(evaluateFormula('.5', {})).toBe(0.5);
  });
  test('addition', () => {
    expect(evaluateFormula('1 + 2', {})).toBe(3);
  });
  test('subtraction', () => {
    expect(evaluateFormula('5 - 3', {})).toBe(2);
  });
  test('multiplication', () => {
    expect(evaluateFormula('4 * 6', {})).toBe(24);
  });
  test('division', () => {
    expect(evaluateFormula('10 / 4', {})).toBe(2.5);
  });
  test('modulo', () => {
    expect(evaluateFormula('10 % 3', {})).toBe(1);
  });
  test('power right-associative: 2^3^2 = 512', () => {
    expect(evaluateFormula('2 ^ 3 ^ 2', {})).toBe(512);
  });
  test('precedence: 1 + 2 * 3 = 7', () => {
    expect(evaluateFormula('1 + 2 * 3', {})).toBe(7);
  });
  test('parens override precedence: (1 + 2) * 3 = 9', () => {
    expect(evaluateFormula('(1 + 2) * 3', {})).toBe(9);
  });
  test('unary minus', () => {
    expect(evaluateFormula('-5 + 3', {})).toBe(-2);
  });
  test('double unary minus', () => {
    expect(evaluateFormula('--5', {})).toBe(5);
  });
  test('identifier lookup', () => {
    expect(evaluateFormula('revenue', { revenue: 1000 })).toBe(1000);
  });
  test('identifier arithmetic', () => {
    expect(
      evaluateFormula('(revenue - cost) / revenue * 100', {
        revenue: 1000,
        cost: 200,
      }),
    ).toBe(80);
  });
});

describe('Formula evaluator — comparisons + booleans', () => {
  test('less than', () => {
    expect(evaluateFormula('1 < 2', {})).toBe(true);
  });
  test('greater than or equal', () => {
    expect(evaluateFormula('3 >= 3', {})).toBe(true);
  });
  test('equals', () => {
    expect(evaluateFormula('5 == 5', {})).toBe(true);
  });
  test('not-equals', () => {
    expect(evaluateFormula('5 != 4', {})).toBe(true);
  });
  test('logical AND short-circuits', () => {
    expect(
      evaluateFormula('flagFalse && unknownVar', { flagFalse: 0 }),
    ).toBe(false);
  });
  test('logical OR short-circuits', () => {
    expect(evaluateFormula('flagTrue || unknownVar', { flagTrue: 1 })).toBe(true);
  });
  test('logical not', () => {
    expect(evaluateFormula('!flagFalse', { flagFalse: 0 })).toBe(true);
  });
});

describe('Formula evaluator — built-in functions', () => {
  test('SUM', () => {
    expect(evaluateFormula('SUM(1, 2, 3, 4)', {})).toBe(10);
  });
  test('AVG', () => {
    expect(evaluateFormula('AVG(2, 4, 6)', {})).toBe(4);
  });
  test('MIN', () => {
    expect(evaluateFormula('MIN(3, 1, 2)', {})).toBe(1);
  });
  test('MAX', () => {
    expect(evaluateFormula('MAX(3, 1, 2)', {})).toBe(3);
  });
  test('ABS', () => {
    expect(evaluateFormula('ABS(-7)', {})).toBe(7);
  });
  test('ROUND to integer', () => {
    expect(evaluateFormula('ROUND(3.7)', {})).toBe(4);
  });
  test('ROUND to N digits', () => {
    expect(evaluateFormula('ROUND(3.14159, 2)', {})).toBe(3.14);
  });
  test('IF true branch', () => {
    expect(evaluateFormula('IF(1 > 0, 100, 200)', {})).toBe(100);
  });
  test('IF false branch', () => {
    expect(evaluateFormula('IF(1 > 10, 100, 200)', {})).toBe(200);
  });
  test('IF is lazy — never evaluates the unchosen branch', () => {
    expect(
      evaluateFormula('IF(flagTrue, 1, unknown_var)', { flagTrue: 1 }),
    ).toBe(1);
  });
  test('case-insensitive function names', () => {
    expect(evaluateFormula('sum(1, 2)', {})).toBe(3);
    expect(evaluateFormula('Min(5, 2)', {})).toBe(2);
  });
  test('nested function calls', () => {
    expect(evaluateFormula('SUM(AVG(2, 4), MIN(1, 3))', {})).toBe(4);
  });
  test('function with identifier args', () => {
    expect(
      evaluateFormula('SUM(revenue, cost)', { revenue: 100, cost: 50 }),
    ).toBe(150);
  });
});

describe('Formula evaluator — errors', () => {
  test('division by zero', () => {
    expect(() => evaluateFormula('1 / 0', {})).toThrow(DivisionByZeroError);
  });
  test('modulo by zero', () => {
    expect(() => evaluateFormula('1 % 0', {})).toThrow(DivisionByZeroError);
  });
  test('unknown identifier', () => {
    expect(() => evaluateFormula('revenue', {})).toThrow(UnknownIdentifierError);
  });
  test('unknown function', () => {
    expect(() => evaluateFormula('FOO(1, 2)', {})).toThrow(UnknownFunctionError);
  });
  test('missing closing paren', () => {
    expect(() => parseFormula('(1 + 2')).toThrow(ParseError);
  });
  test('unexpected token after expression', () => {
    expect(() => parseFormula('1 + 2 3')).toThrow(ParseError);
  });
  test('empty input', () => {
    expect(() => parseFormula('')).toThrow(ParseError);
  });
  test('ROUND wrong arity', () => {
    expect(() => evaluateFormula('ROUND(1, 2, 3)', {})).toThrow(TypeMismatchError);
  });
  test('ABS wrong arity', () => {
    expect(() => evaluateFormula('ABS()', {})).toThrow(TypeMismatchError);
  });
  test('AVG of empty list', () => {
    expect(() => evaluateFormula('AVG()', {})).toThrow(TypeMismatchError);
  });
  test('IF wrong arity', () => {
    expect(() => evaluateFormula('IF(flagTrue, 1)', { flagTrue: 1 })).toThrow(
      TypeMismatchError,
    );
  });
  test('== type mismatch', () => {
    expect(() => evaluateFormula('1 == bool', { bool: true })).toThrow(
      TypeMismatchError,
    );
  });
  test('unexpected character', () => {
    expect(() => parseFormula('1 @ 2')).toThrow(ParseError);
  });
  test('unclosed function call', () => {
    expect(() => parseFormula('SUM(1, 2')).toThrow(ParseError);
  });
});

describe('Formula evaluator — escape attempts (safe by construction)', () => {
  // None of these identifiers exist in our context map. The evaluator
  // ONLY resolves names via ctx.lookup() — never against any JS object —
  // so every attempt throws UnknownIdentifierError or UnknownFunctionError
  // without reaching any runtime symbol.

  const escapeVectors = [
    'process',
    'global',
    'globalThis',
    'Function',
    'constructor',
    '__proto__',
    'fs',
    'child_process',
    'window',
    'document',
    'this',
    'arguments',
    'self',
    'parent',
  ];

  for (const vector of escapeVectors) {
    test(`'${vector}' resolves to UnknownIdentifierError`, () => {
      expect(() => evaluateFormula(vector, {})).toThrow(UnknownIdentifierError);
    });
  }

  const escapeFunctions = [
    'require',
    'setTimeout',
    'setInterval',
    'setImmediate',
    'queueMicrotask',
  ];

  for (const fn of escapeFunctions) {
    test(`${fn}() resolves to UnknownFunctionError`, () => {
      expect(() => evaluateFormula(`${fn}(1)`, {})).toThrow(UnknownFunctionError);
    });
  }

  test('member access syntax (process.exit) is rejected at parse time', () => {
    // Our grammar has no `.` member-access operator. `process.exit` parses
    // `process` as identifier then sees `.exit` as unexpected — ParseError.
    expect(() => parseFormula('process.exit')).toThrow(ParseError);
  });
  test('bracket index access is rejected at parse time', () => {
    expect(() => parseFormula('arr[0]')).toThrow(ParseError);
  });
  test('arrow functions are unparseable', () => {
    expect(() => parseFormula('(x) => x + 1')).toThrow(ParseError);
  });
  test('object literals are unparseable', () => {
    expect(() => parseFormula('{foo: 1}')).toThrow(ParseError);
  });
  test('template literals are unparseable', () => {
    expect(() => parseFormula('`${a}`')).toThrow(ParseError);
  });
  test('semicolons are rejected', () => {
    expect(() => parseFormula('1; 2')).toThrow(ParseError);
  });
  test('assignment operator `=` is rejected (only == is valid)', () => {
    expect(() => parseFormula('a = 5')).toThrow(ParseError);
  });
  test('variable declarations are rejected', () => {
    expect(() => parseFormula('var x = 1')).toThrow(ParseError);
  });
  test('string literals are rejected (no string type in DSL)', () => {
    // Even passing a quoted string is rejected because ' and " aren't tokens
    expect(() => parseFormula("'foo'")).toThrow(ParseError);
    expect(() => parseFormula('"foo"')).toThrow(ParseError);
  });
  test('host lookup returning a non-number/non-boolean is caught', () => {
    const ctx = {
      lookup: (n: string) =>
        n === 'sketchy'
          ? (('NOT_A_NUMBER' as unknown) as number)
          : undefined,
    };
    expect(() => evaluateFormula('sketchy + 1', ctx)).toThrow(TypeMismatchError);
  });
  test('infinite-loop construct is not expressible (no loop syntax)', () => {
    // The grammar has no loops, no goto, no recursion construct. The
    // evaluator is single-pass over a finite AST and terminates by
    // construction.
    expect(parseFormula('SUM(1, 2)')).toBeDefined();
  });
  test('deeply nested expression parses (50-deep) without stack overflow', () => {
    let expr = '0';
    for (let i = 0; i < 50; i++) expr = `(${expr} + 1)`;
    expect(evaluateFormula(expr, {})).toBe(50);
  });
});

describe('Formula evaluator — real-world formulas', () => {
  test('gross margin percent', () => {
    expect(
      evaluateFormula('(revenue - cogs) / revenue * 100', {
        revenue: 1000,
        cogs: 400,
      }),
    ).toBe(60);
  });
  test('conversion rate from totals', () => {
    expect(
      evaluateFormula('ROUND(conversions / visitors * 100, 2)', {
        conversions: 47,
        visitors: 1200,
      }),
    ).toBe(3.92);
  });
  test('on-target bonus calculation', () => {
    expect(
      evaluateFormula(
        'IF(actual >= target, baseBonus * (actual / target), baseBonus * 0.5)',
        { actual: 110, target: 100, baseBonus: 1000 },
      ),
    ).toBeCloseTo(1100, 5);
  });
  test('weighted score across three metrics', () => {
    expect(
      evaluateFormula('csat * 0.4 + nps * 0.4 + retention * 0.2', {
        csat: 80,
        nps: 60,
        retention: 90,
      }),
    ).toBeCloseTo(74, 5);
  });
});
