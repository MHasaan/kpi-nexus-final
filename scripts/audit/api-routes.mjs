#!/usr/bin/env node
/**
 * Static route inventory for apps/api (audit tooling, read-only).
 *
 * Parses every *.controller.ts, pairs class-level decorators (@Controller,
 * @Public, @RequirePermissions, guards) with each handler's HTTP decorator,
 * and writes docs/audit/api-routes.json — one entry per route.
 *
 *   node scripts/audit/api-routes.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditOutputDir, failAudit, redactAuditText, writeAuditJson } from './common.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API_SRC = join(REPO_ROOT, 'apps', 'api', 'src');
const OUT = join(auditOutputDir(REPO_ROOT), 'api-routes.json');

const HTTP = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.name.endsWith('.controller.ts')) yield p;
  }
}

/** Index just past the `)` matching the `(` at `open`, skipping strings/template literals. */
function matchParen(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i + 1;
  }
  throw new Error(`unbalanced parens at ${open}`);
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** First string literal in a decorator's args ('' when none — e.g. @Get()). */
function firstString(args) {
  const m = args.match(/^\(\s*(['"`])([^'"`]*)\1/);
  if (m) return m[2];
  const obj = args.match(/path\s*:\s*(['"`])([^'"`]*)\1/);
  return obj ? obj[2] : '';
}

function permissionKeys(args) {
  const keys = [...args.matchAll(/PermissionKey\.([A-Z0-9_]+)/g)].map((m) => m[1]);
  const strs = [...args.matchAll(/['"]([A-Z][A-Z0-9_]+)['"]/g)].map((m) => m[1]);
  return [...new Set([...keys, ...strs])];
}

function keysOf(decorators, name) {
  return [...new Set(decorators.filter((p) => p.name === name).flatMap((p) => permissionKeys(p.args)))];
}

function guardsOf(decorators) {
  return decorators
    .filter((p) => p.name === 'UseGuards')
    .flatMap((p) => [...p.args.matchAll(/\b(\w+Guard)\b/g)].map((m) => m[1]));
}

function joinPath(prefix, sub) {
  const path = `/${[prefix, sub].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

function parseController(src, file) {
  const text = stripComments(src);
  const routes = [];
  const decoratorRe = /@(\w+)\s*(\()?/g;
  let pending = [];
  let cls = null;
  let i = 0;

  while (i < text.length) {
    decoratorRe.lastIndex = i;
    const d = decoratorRe.exec(text);
    if (!d) break;

    // A class or method declaration between the previous point and this decorator closes `pending`.
    flush(text.slice(i, d.index));

    // `@scope/pkg` inside an import string is not a decorator.
    if (/['"`/]/.test(text[d.index - 1] ?? '')) {
      i = d.index + 1;
      continue;
    }

    let end = d.index + d[0].length;
    let args = '';
    if (d[2]) {
      end = matchParen(text, d.index + d[0].length - 1);
      args = text.slice(d.index + d[0].length - 1, end);
    }
    pending.push({ name: d[1], args });
    i = end;
  }
  flush(text.slice(i));
  return routes;

  function flush(between) {
    if (pending.length === 0) return;
    const classDecl = between.match(/^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classDecl) {
      const ctrl = pending.find((p) => p.name === 'Controller');
      cls = {
        name: classDecl[1],
        prefix: ctrl ? firstString(ctrl.args) : '',
        isPublic: pending.some((p) => p.name === 'Public'),
        permissions: keysOf(pending, 'RequirePermissions'),
        anyPermissions: keysOf(pending, 'RequireAnyPermission'),
        guards: guardsOf(pending),
        decorators: pending.map((p) => p.name),
      };
      pending = [];
      return;
    }
    const method = between.match(/^\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(\w+)\s*[(<]/);
    if (!method) {
      // Parameter decorators (@Body, @Param…) sit inside a signature; once the
      // method body starts they belong to no route.
      if (/[{}]/.test(between)) pending = [];
      return;
    }
    const http = pending.find((p) => HTTP.has(p.name));
    if (http && cls) {
      const methodPerms = keysOf(pending, 'RequirePermissions');
      const methodAny = keysOf(pending, 'RequireAnyPermission');
      routes.push({
        method: http.name.toUpperCase(),
        path: joinPath(cls.prefix, firstString(http.args)),
        controller: cls.name,
        handler: method[1],
        file: relative(REPO_ROOT, file).replaceAll('\\', '/'),
        public: cls.isPublic || pending.some((p) => p.name === 'Public'),
        permissions: methodPerms.length ? methodPerms : cls.permissions,
        anyPermissions: methodAny.length ? methodAny : cls.anyPermissions,
        guards: [...new Set([...cls.guards, ...guardsOf(pending)])],
        decorators: [...new Set([...cls.decorators, ...pending.map((p) => p.name)])].filter(
          (n) => n !== 'Controller' && !HTTP.has(n),
        ),
      });
    }
    pending = [];
  }
}

async function main() {
  const routes = [];
  for await (const file of walk(API_SRC)) {
    routes.push(...parseController(await readFile(file, 'utf-8'), file));
  }
  routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  await writeAuditJson(OUT, routes);

  const byMethod = Object.groupBy(routes, (r) => r.method);
  console.log(`${routes.length} routes → ${redactAuditText(relative(REPO_ROOT, OUT))}`);
  console.log(Object.entries(byMethod).map(([m, rs]) => `${m} ${rs.length}`).join(' · '));
  const gated = (r) => r.permissions.length || r.anyPermissions.length || r.guards.length;
  console.log(
    `public ${routes.filter((r) => r.public).length} · gated (permission/any-permission/guard) ${routes.filter(gated).length} · ` +
      `authenticated-only ${routes.filter((r) => !r.public && !gated(r)).length}`,
  );
}

await main().catch(failAudit);
