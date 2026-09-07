import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { poolConfig } from './config';
export async function migrate(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(763294)');
    await client.query("SET LOCAL statement_timeout='5min'");
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    // Freeze the inherited idempotent schema as the first migration. Append future files; never edit applied SQL.
    for (const name of ['schema.sql']) {
      const sql = (await readFile(new URL(`./${name}`, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prior = (await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name])).rows[0];
      if (prior && prior.checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      if (!prior) { await client.query(sql); await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum]); }
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
if (/migrate\.(ts|js)$/.test(process.argv[1] || '')) {
  try {
    const pool = new pg.Pool(poolConfig());
    try { await migrate(pool); console.log('Database schema ready'); } finally { await pool.end(); }
  } catch { console.error('Migration failed. Check connectivity and migration checksums; no partial transaction was committed.'); process.exitCode = 1; }
}
