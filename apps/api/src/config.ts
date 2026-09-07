import type pg from 'pg';

type Env = Record<string, string | undefined>;
export function origins(env: Env = process.env): string[] {
  const value = env.CORS_ORIGIN || (env.NODE_ENV === 'production' ? '' : 'http://localhost:8081');
  if (!value) throw new Error('CORS_ORIGIN is required');
  return value.split(',').map(part => {
    const origin = part.trim(); const url = new URL(origin);
    if (url.origin !== origin || url.hostname.includes('*') || !['http:', 'https:'].includes(url.protocol) || (env.NODE_ENV === 'production' && url.protocol !== 'https:')) throw new Error('CORS_ORIGIN must contain exact origins (HTTPS in production), without paths or wildcards');
    return origin;
  });
}
export function poolConfig(env: Env = process.env): pg.PoolConfig {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const url = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be PostgreSQL');
  // URL SSL flags can override node-postgres ssl options. Keep one explicit source of truth.
  for (const key of url.searchParams.keys()) if (key.startsWith('ssl')) throw new Error('Remove SSL query parameters from DATABASE_URL; use DATABASE_SSL_MODE');
  const mode = env.DATABASE_SSL_MODE || (env.NODE_ENV === 'production' ? 'verify-full' : 'disable');
  if (!['disable', 'verify-full'].includes(mode)) throw new Error('DATABASE_SSL_MODE must be disable or verify-full');
  if (mode === 'disable' && env.NODE_ENV === 'production' && env.DATABASE_PRIVATE_NETWORK !== 'true') throw new Error('Unencrypted production PostgreSQL requires explicit DATABASE_PRIVATE_NETWORK=true');
  const max = Number(env.DATABASE_POOL_MAX || 10);
  if (!Number.isInteger(max) || max < 2 || max > 50) throw new Error('DATABASE_POOL_MAX must be 2–50 (one connection is reserved for LISTEN)');
  return { connectionString: env.DATABASE_URL, max, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    statement_timeout: 30000, ssl: mode === 'disable' ? false : { rejectUnauthorized: true, ...(env.DATABASE_CA_CERT ? { ca: env.DATABASE_CA_CERT.replace(/\\n/g, '\n') } : {}) } };
}
export function proxyTrust(env: Env = process.env): false | ((address: string, hop: number) => boolean) {
  const hops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(hops) || hops < 0 || hops > 2) throw new Error('TRUST_PROXY_HOPS must be 0, 1, or 2');
  return hops ? (_address, hop) => hop < hops : false;
}
