/**
 * Safe-by-construction formula evaluator for KPI computations.
 *
 * The spec calls for an evaluator that can compute formulas like
 * `(revenue - cost) / revenue * 100` against a context of variable
 * values. The original-app's formula bug class was sandbox escape via
 * eval/Function/process/global. We avoid the entire bug class by NOT
 * running any JavaScript at all — formulas are parsed into a typed AST
 * and walked with a context lookup map.
 *
 * Grammar (recursive descent):
 *   formula     := expression
 *   expression  := logicalOr
 *   logicalOr   := logicalAnd ('||' logicalAnd)*
 *   logicalAnd  := equality ('&&' equality)*
 *   equality    := comparison (('==' | '!=') comparison)*
 *   comparison  := additive (('<' | '<=' | '>' | '>=') additive)*
 *   additive    := multiplicative (('+' | '-') multiplicative)*
 *   multiplicative := power (('*' | '/' | '%') power)*
 *   power       := unary ('^' unary)*
 *   unary       := ('-' | '!') unary | primary
 *   primary     := number | identifier | call | '(' expression ')'
 *   call        := identifier '(' (expression (',' expression)*)? ')'
 *   number      := digits ('.' digits)? ([eE][+-]? digits)?
 *   identifier  := /[a-zA-Z_][a-zA-Z0-9_]* / (lookup in context map only;
 *                  never resolved against any global or process scope)
 *
 * Built-in functions: SUM, AVG, MIN, MAX, ABS, ROUND, IF.
 * Anything else throws `UnknownFunctionError`. The set is locked — adding
 * a new function requires editing this file.
 */

export class FormulaError extends Error {
  constructor(
    message: string,
    public readonly position?: number,
  ) {
    super(message);
    this.name = 'FormulaError';
  }
}
export class ParseError extends FormulaError {
  constructor(message: string, position: number) {
    super(message, position);
    this.name = 'ParseError';
  }
}
export class UnknownIdentifierError extends FormulaError {
  constructor(public readonly identifier: string) {
    super(`Unknown identifier: ${identifier}`);
    this.name = 'UnknownIdentifierError';
  }
}
export class UnknownFunctionError extends FormulaError {
  readonly funcName: string;
  constructor(funcName: string) {
    super(`Unknown function: ${funcName}`);
    this.funcName = funcName;
    this.name = 'UnknownFunctionError';
  }
}
export class DivisionByZeroError extends FormulaError {
  constructor() {
    super('Division by zero');
    this.name = 'DivisionByZeroError';
  }
}
export class TypeMismatchError extends FormulaError {
  constructor(message: string) {
    super(message);
    this.name = 'TypeMismatchError';
  }
}

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

type TokenType =
  | 'number'
  | 'ident'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'op'; // operator (any of + - * / % ^ < <= > >= == != ! && ||)

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const SINGLE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '^', '!']);
const TWO_CHAR_OPS = new Set(['==', '!=', '<=', '>=', '&&', '||']);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(', pos: i });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')', pos: i });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',', pos: i });
      i++;
      continue;
    }

    // Number: optionally starts with digits OR a dot+digit (e.g. .5)
    if (isDigit(ch) || (ch === '.' && i + 1 < input.length && isDigit(input[i + 1]!))) {
      let j = i;
      while (j < input.length && isDigit(input[j]!)) j++;
      if (j < input.length && input[j] === '.') {
        j++;
        while (j < input.length && isDigit(input[j]!)) j++;
      }
      if (j < input.length && (input[j] === 'e' || input[j] === 'E')) {
        j++;
        if (j < input.length && (input[j] === '+' || input[j] === '-')) j++;
        while (j < input.length && isDigit(input[j]!)) j++;
      }
      tokens.push({ type: 'number', value: input.slice(i, j), pos: i });
      i = j;
      continue;
    }

    // Identifier (letters, digits, underscore — must start with letter or _)
    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < input.length && isIdentChar(input[j]!)) j++;
      tokens.push({ type: 'ident', value: input.slice(i, j), pos: i });
      i = j;
      continue;
    }

    // Two-char operator first
    if (i + 1 < input.length) {
      const two = input.slice(i, i + 2);
      if (TWO_CHAR_OPS.has(two)) {
        tokens.push({ type: 'op', value: two, pos: i });
        i += 2;
        continue;
      }
    }

    // Single-char operator
    if (SINGLE_CHAR_OPS.has(ch) || ch === '<' || ch === '>') {
      tokens.push({ type: 'op', value: ch, pos: i });
      i++;
      continue;
    }

    throw new ParseError(`Unexpected character '${ch}'`, i);
  }
  return tokens;
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}
function isIdentStart(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}
function isIdentChar(c: string): boolean {
  return isIdentStart(c) || isDigit(c);
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type Expr =
  | { type: 'number'; value: number }
  | { type: 'identifier'; name: string }
  | { type: 'unary'; op: '-' | '!'; expr: Expr }
  | {
      type: 'binary';
      op:
        | '+'
        | '-'
        | '*'
        | '/'
        | '%'
        | '^'
        | '<'
        | '<='
        | '>'
        | '>='
        | '=='
        | '!='
        | '&&'
        | '||';
      left: Expr;
      right: Expr;
    }
  | { type: 'call'; name: string; args: Expr[] };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Expr {
    const expr = this.parseExpression();
    if (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos]!;
      throw new ParseError(`Unexpected token '${t.value}'`, t.pos);
    }
    return expr;
  }

  private parseExpression(): Expr {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): Expr {
    let left = this.parseLogicalAnd();
    while (this.peek('op', '||')) {
      this.next();
      const right = this.parseLogicalAnd();
      left = { type: 'binary', op: '||', left, right };
    }
    return left;
  }

  private parseLogicalAnd(): Expr {
    let left = this.parseEquality();
    while (this.peek('op', '&&')) {
      this.next();
      const right = this.parseEquality();
      left = { type: 'binary', op: '&&', left, right };
    }
    return left;
  }

  private parseEquality(): Expr {
    let left = this.parseComparison();
    while (this.peek('op', '==') || this.peek('op', '!=')) {
      const op = this.next().value as '==' | '!=';
      const right = this.parseComparison();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  private parseComparison(): Expr {
    let left = this.parseAdditive();
    while (
      this.peek('op', '<') ||
      this.peek('op', '<=') ||
      this.peek('op', '>') ||
      this.peek('op', '>=')
    ) {
      const op = this.next().value as '<' | '<=' | '>' | '>=';
      const right = this.parseAdditive();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.peek('op', '+') || this.peek('op', '-')) {
      const op = this.next().value as '+' | '-';
      const right = this.parseMultiplicative();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parsePower();
    while (this.peek('op', '*') || this.peek('op', '/') || this.peek('op', '%')) {
      const op = this.next().value as '*' | '/' | '%';
      const right = this.parsePower();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  // Power is right-associative: 2^3^2 = 2^(3^2) = 2^9 = 512
  private parsePower(): Expr {
    const left = this.parseUnary();
    if (this.peek('op', '^')) {
      this.next();
      const right = this.parsePower();
      return { type: 'binary', op: '^', left, right };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.peek('op', '-')) {
      this.next();
      return { type: 'unary', op: '-', expr: this.parseUnary() };
    }
    if (this.peek('op', '!')) {
      this.next();
      return { type: 'unary', op: '!', expr: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const t = this.tokens[this.pos];
    if (!t) {
      throw new ParseError(
        'Unexpected end of input',
        this.tokens[this.tokens.length - 1]?.pos ?? 0,
      );
    }
    if (t.type === 'number') {
      this.next();
      return { type: 'number', value: Number(t.value) };
    }
    if (t.type === 'lparen') {
      this.next();
      const e = this.parseExpression();
      if (!this.peek('rparen')) {
        throw new ParseError("Expected ')'", this.tokens[this.pos]?.pos ?? t.pos);
      }
      this.next();
      return e;
    }
    if (t.type === 'ident') {
      this.next();
      // Function call?
      if (this.peek('lparen')) {
        this.next();
        const args: Expr[] = [];
        if (!this.peek('rparen')) {
          args.push(this.parseExpression());
          while (this.peek('comma')) {
            this.next();
            args.push(this.parseExpression());
          }
        }
        if (!this.peek('rparen')) {
          throw new ParseError("Expected ')'", this.tokens[this.pos]?.pos ?? t.pos);
        }
        this.next();
        return { type: 'call', name: t.value, args };
      }
      return { type: 'identifier', name: t.value };
    }
    throw new ParseError(`Unexpected token '${t.value}'`, t.pos);
  }

  private peek(type: TokenType, value?: string): boolean {
    const t = this.tokens[this.pos];
    if (!t || t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    return true;
  }
  private next(): Token {
    return this.tokens[this.pos++]!;
  }
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

export type FormulaValue = number | boolean;
export interface FormulaContext {
  /**
   * Variable lookup. Receives the raw identifier and returns its value, or
   * `undefined` to signal "unknown" (evaluator throws `UnknownIdentifierError`).
   *
   * Note: this is the ONLY way to inject values. There is no implicit
   * global access — `process`, `require`, etc. all resolve to undefined
   * unless the host explicitly puts them here.
   */
  lookup(name: string): number | boolean | undefined;
}

function asNumber(v: FormulaValue, where: string): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  throw new TypeMismatchError(`${where}: expected number`);
}
function asBoolean(v: FormulaValue, where: string): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  throw new TypeMismatchError(`${where}: expected boolean`);
}

function evaluate(expr: Expr, ctx: FormulaContext): FormulaValue {
  switch (expr.type) {
    case 'number':
      return expr.value;
    case 'identifier': {
      const v = ctx.lookup(expr.name);
      if (v === undefined) throw new UnknownIdentifierError(expr.name);
      return v;
    }
    case 'unary': {
      const inner = evaluate(expr.expr, ctx);
      if (expr.op === '-') return -asNumber(inner, 'unary minus');
      if (expr.op === '!') return !asBoolean(inner, 'unary not');
      throw new TypeMismatchError(`Unknown unary op ${String(expr.op)}`);
    }
    case 'binary': {
      // Short-circuit for && and ||
      if (expr.op === '&&') {
        const l = asBoolean(evaluate(expr.left, ctx), '&&');
        if (!l) return false;
        return asBoolean(evaluate(expr.right, ctx), '&&');
      }
      if (expr.op === '||') {
        const l = asBoolean(evaluate(expr.left, ctx), '||');
        if (l) return true;
        return asBoolean(evaluate(expr.right, ctx), '||');
      }
      const lv = evaluate(expr.left, ctx);
      const rv = evaluate(expr.right, ctx);
      switch (expr.op) {
        case '+':
          return asNumber(lv, '+') + asNumber(rv, '+');
        case '-':
          return asNumber(lv, '-') - asNumber(rv, '-');
        case '*':
          return asNumber(lv, '*') * asNumber(rv, '*');
        case '/': {
          const r = asNumber(rv, '/');
          if (r === 0) throw new DivisionByZeroError();
          return asNumber(lv, '/') / r;
        }
        case '%': {
          const r = asNumber(rv, '%');
          if (r === 0) throw new DivisionByZeroError();
          return asNumber(lv, '%') % r;
        }
        case '^':
          return asNumber(lv, '^') ** asNumber(rv, '^');
        case '<':
          return asNumber(lv, '<') < asNumber(rv, '<');
        case '<=':
          return asNumber(lv, '<=') <= asNumber(rv, '<=');
        case '>':
          return asNumber(lv, '>') > asNumber(rv, '>');
        case '>=':
          return asNumber(lv, '>=') >= asNumber(rv, '>=');
        case '==':
          if (typeof lv !== typeof rv) {
            throw new TypeMismatchError('== requires both sides same type');
          }
          return lv === rv;
        case '!=':
          if (typeof lv !== typeof rv) {
            throw new TypeMismatchError('!= requires both sides same type');
          }
          return lv !== rv;
      }
      throw new TypeMismatchError(`Unknown binary op ${String(expr.op)}`);
    }
    case 'call':
      return callBuiltin(expr.name, expr.args, ctx);
  }
}

function callBuiltin(
  name: string,
  args: Expr[],
  ctx: FormulaContext,
): FormulaValue {
  const upper = name.toUpperCase();
  // Resolve all args eagerly EXCEPT IF, which is lazy on the branches
  if (upper === 'IF') {
    if (args.length !== 3) {
      throw new TypeMismatchError(`IF expects 3 arguments, got ${args.length}`);
    }
    const cond = asBoolean(evaluate(args[0]!, ctx), 'IF condition');
    return evaluate(cond ? args[1]! : args[2]!, ctx);
  }

  const values = args.map((a) => evaluate(a, ctx));
  switch (upper) {
    case 'SUM':
      return values.reduce<number>((acc, v) => acc + asNumber(v, 'SUM'), 0);
    case 'AVG': {
      if (values.length === 0) throw new TypeMismatchError('AVG of empty list');
      const sum = values.reduce<number>((acc, v) => acc + asNumber(v, 'AVG'), 0);
      return sum / values.length;
    }
    case 'MIN': {
      if (values.length === 0) throw new TypeMismatchError('MIN of empty list');
      return values.reduce<number>(
        (acc, v) => Math.min(acc, asNumber(v, 'MIN')),
        Number.POSITIVE_INFINITY,
      );
    }
    case 'MAX': {
      if (values.length === 0) throw new TypeMismatchError('MAX of empty list');
      return values.reduce<number>(
        (acc, v) => Math.max(acc, asNumber(v, 'MAX')),
        Number.NEGATIVE_INFINITY,
      );
    }
    case 'ABS':
      if (values.length !== 1) {
        throw new TypeMismatchError(`ABS expects 1 argument, got ${values.length}`);
      }
      return Math.abs(asNumber(values[0]!, 'ABS'));
    case 'ROUND': {
      if (values.length < 1 || values.length > 2) {
        throw new TypeMismatchError(
          `ROUND expects 1 or 2 arguments, got ${values.length}`,
        );
      }
      const n = asNumber(values[0]!, 'ROUND');
      const digits =
        values.length === 2 ? Math.trunc(asNumber(values[1]!, 'ROUND digits')) : 0;
      const factor = 10 ** digits;
      return Math.round(n * factor) / factor;
    }
  }
  throw new UnknownFunctionError(name);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseFormula(input: string): Expr {
  return new Parser(tokenize(input)).parse();
}

export function evaluateFormula(
  input: string,
  ctx: FormulaContext | Record<string, number | boolean>,
): FormulaValue {
  const context: FormulaContext =
    typeof (ctx as FormulaContext).lookup === 'function'
      ? (ctx as FormulaContext)
      : {
          // Use Object.hasOwn so prototype properties like `constructor` and
          // `__proto__` don't leak through as defined values — they would
          // otherwise return Object's constructor / Object.prototype rather
          // than `undefined`.
          lookup: (name) => {
            const map = ctx as Record<string, number | boolean>;
            return Object.hasOwn(map, name) ? map[name] : undefined;
          },
        };
  return evaluate(parseFormula(input), context);
}
