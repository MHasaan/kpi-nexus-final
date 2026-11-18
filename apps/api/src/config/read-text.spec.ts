/**
 * QA-T1: specs that read repo files (the production compose file, the env
 * templates) split them on "\n". On a Windows checkout those files end lines
 * with "\r\n", so every line carried a stray "\r" and the specs failed there.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, test } from 'vitest';

import { readText } from './read-text.js';

describe('readText — a repo file as text, whatever line endings the checkout has', () => {
  const dir = mkdtempSync(join(tmpdir(), 'read-text-'));
  const write = (name: string, body: string) => {
    const path = join(dir, name);
    writeFileSync(path, body);
    return path;
  };

  test('Windows line endings read the same as Unix ones', () => {
    const unix = write('unix.env', 'A=1\nB=2\n');
    const windows = write('windows.env', 'A=1\r\nB=2\r\n');
    expect(readText(windows)).toBe(readText(unix));
    expect(readText(windows).split('\n')).toEqual(['A=1', 'B=2', '']);
  });

  test('takes a path or a file URL', () => {
    const path = write('either.txt', 'x\r\ny');
    expect(readText(pathToFileURL(path))).toBe('x\ny');
  });

  test('a lone carriage return inside a line is left alone', () => {
    expect(readText(write('lone.txt', 'a\rb\n'))).toBe('a\rb\n');
  });
});
