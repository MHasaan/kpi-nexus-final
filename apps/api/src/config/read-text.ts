import { readFileSync } from 'node:fs';

/**
 * A repo file as text with Unix line endings, whatever the checkout has. For
 * specs that read configuration files line by line: on Windows, git may check
 * files out with "\r\n", and a line split on "\n" then ends in a stray "\r".
 */
export function readText(path: string | URL): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}
