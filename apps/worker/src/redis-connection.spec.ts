import { describe, expect, it } from 'vitest';

import { bullConnectionFromUrl } from './redis-connection.js';

describe('bullConnectionFromUrl', () => {
  it('defaults to database 0 without TLS', () => {
    expect(bullConnectionFromUrl('redis://127.0.0.1:6379')).toEqual({ host: '127.0.0.1', port: 6379, db: 0 });
  });

  it('defaults the port to 6379', () => {
    expect(bullConnectionFromUrl('redis://cache.internal')).toMatchObject({ host: 'cache.internal', port: 6379 });
  });

  it('honors the database number in the path', () => {
    expect(bullConnectionFromUrl('redis://127.0.0.1:6379/15')).toMatchObject({ db: 15 });
  });

  it('enables TLS for rediss:// and decodes the credentials', () => {
    expect(bullConnectionFromUrl('rediss://default:p%40ss@x.upstash.io:6379')).toEqual({
      host: 'x.upstash.io',
      port: 6379,
      db: 0,
      username: 'default',
      password: 'p@ss',
      tls: {},
    });
  });

  it('accepts a password without a username', () => {
    expect(bullConnectionFromUrl('redis://:secret@127.0.0.1:6379')).toEqual({
      host: '127.0.0.1',
      port: 6379,
      db: 0,
      password: 'secret',
    });
  });

  it('rejects a database path that is not a number', () => {
    expect(() => bullConnectionFromUrl('redis://127.0.0.1:6379/abc')).toThrow(/database/);
  });

  it('rejects other schemes', () => {
    expect(() => bullConnectionFromUrl('http://127.0.0.1:6379')).toThrow(/redis:\/\/ or rediss:\/\//);
  });
});
