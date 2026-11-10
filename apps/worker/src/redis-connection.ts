/**
 * BullMQ connection options from REDIS_URL (main verification MV-002).
 *
 * The queue modules used to copy only host, port and password out of the URL,
 * so `redis://…/15` silently shared database 0 with every other deployment on
 * the same server, and `rediss://` (Upstash) connected without TLS. The other
 * Redis clients hand the URL straight to ioredis, which already honors these;
 * this keeps BullMQ consistent with them. Kept identical to
 * apps/api/src/config/redis-connection.ts (the worker has no shared runtime package).
 */
export interface BullConnectionOptions {
  host: string;
  port: number;
  db: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
}

export function bullConnectionFromUrl(raw: string): BullConnectionOptions {
  const url = new URL(raw);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error(`REDIS_URL must use redis:// or rediss://, got ${url.protocol}//`);
  }

  const path = url.pathname.replace(/^\//, '');
  if (path !== '' && !/^\d+$/.test(path)) {
    throw new Error(`REDIS_URL database must be a number, got "${path}"`);
  }

  const options: BullConnectionOptions = {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: path === '' ? 0 : Number(path),
  };
  if (url.username) options.username = decodeURIComponent(url.username);
  if (url.password) options.password = decodeURIComponent(url.password);
  if (url.protocol === 'rediss:') options.tls = {};
  return options;
}
