/**
 * Pure helpers for the formula dependency DAG. Kept free of Prisma/Nest so
 * identifier extraction and cycle detection can be unit-tested in isolation.
 */
import type { Expr } from '../formula/formula.js';

/** A directed dependency edge: `dependentKpiId`'s formula references `sourceKpiId`. */
export interface DependencyEdge {
  sourceKpiId: string;
  dependentKpiId: string;
}

/**
 * The deduped identifier names referenced anywhere in a parsed formula AST.
 * Call-expression function names (builtins like `max`, `abs`) are NOT
 * identifiers — only operand identifiers are returned.
 */
export function extractIdentifiers(ast: Expr): string[] {
  const found = new Set<string>();
  const walk = (node: Expr): void => {
    switch (node.type) {
      case 'identifier':
        found.add(node.name);
        return;
      case 'number':
        return;
      case 'unary':
        walk(node.expr);
        return;
      case 'binary':
        walk(node.left);
        walk(node.right);
        return;
      case 'call':
        for (const arg of node.args) walk(arg);
        return;
    }
  };
  walk(ast);
  return [...found];
}

/**
 * Would adding `source -> dependent` (dependent's formula references source)
 * create a cycle in the existing dependency graph? True for a self-reference,
 * or when `source` already (transitively) depends on `dependent`.
 */
export function wouldCreateDependencyCycle(
  edges: DependencyEdge[],
  sourceKpiId: string,
  dependentKpiId: string,
): boolean {
  if (sourceKpiId === dependentKpiId) return true;

  // deps[x] = the sources x depends on (follow x -> its sources).
  const deps = new Map<string, string[]>();
  for (const e of edges) {
    const list = deps.get(e.dependentKpiId) ?? [];
    list.push(e.sourceKpiId);
    deps.set(e.dependentKpiId, list);
  }

  // From `source`, walk what it depends on; if we reach `dependent`, the new
  // edge (dependent -> source) closes a loop.
  const stack = [sourceKpiId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === dependentKpiId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of deps.get(node) ?? []) stack.push(next);
  }
  return false;
}

/**
 * A parse error as the person typing sees it. Two bare words in a row are almost always a KPI name typed
 * without its quotes ("Unexpected token 'Recurring'"), the error people met most (F-016): that one gets the
 * hint. Names already in quotes or brackets are not counted.
 */
export function formulaErrorMessage(raw: string, message: string): string {
  // One pass over the typed text, no regular expression (a pattern over what someone typed can be made
  // to run slowly): a quoted or bracketed name is skipped whole; a bare word followed only by spaces and
  // another bare word is the hint's case.
  let i = 0;
  let afterBareWord = false;
  while (i < raw.length) {
    const ch = raw[i]!;
    if (ch === '"' || ch === '[') {
      const close = raw.indexOf(ch === '"' ? '"' : ']', i + 1);
      i = close === -1 ? raw.length : close + 1;
      afterBareWord = false;
      continue;
    }
    if (isWordStart(ch)) {
      if (afterBareWord) {
        return `${message}. A KPI name with spaces goes in double quotes: "Monthly Recurring Revenue" * 12`;
      }
      while (i < raw.length && isWordChar(raw[i]!)) i += 1;
      afterBareWord = true;
      continue;
    }
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') afterBareWord = false;
    i += 1;
  }
  return message;
}

function isWordStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isWordChar(ch: string): boolean {
  return isWordStart(ch) || (ch >= '0' && ch <= '9');
}
