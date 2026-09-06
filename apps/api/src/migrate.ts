import { readFile } from 'node:fs/promises';
import pg from 'pg';
export async function migrate(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(763294)');
    await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
if (process.argv[1]?.endsWith('migrate.ts')) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { await migrate(pool); console.log('Database schema ready'); } finally { await pool.end(); }
}
