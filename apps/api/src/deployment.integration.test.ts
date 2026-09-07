import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from './migrate';
import { buildApi } from './app';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('release migrations and HTTP safety', () => {
  const schema = `deploy_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: url });
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  let app: Awaited<ReturnType<typeof buildApi>>;
  beforeAll(async () => { await admin.query(`CREATE SCHEMA ${schema}`); await migrate(pool); app = await buildApi(pool); });
  afterAll(async () => { await app.close(); await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  it('bootstraps empty, preserves data on repeat migration, refuses changed checksums', async () => {
    expect((await pool.query('SELECT * FROM users')).rowCount).toBe(0);
    const id = randomUUID(); await pool.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)', [id, 'migration@example.test', 'Preserve me', 'test-only']);
    await migrate(pool);
    expect((await pool.query('SELECT name FROM users WHERE id=$1', [id])).rows[0].name).toBe('Preserve me');
    await pool.query("UPDATE schema_migrations SET checksum='changed'");
    await expect(migrate(pool)).rejects.toThrow('Applied migration changed');
    expect((await pool.query('SELECT * FROM users')).rowCount).toBe(1);
  });
  it('returns uncached readiness and does not authorize an unlisted browser origin', async () => {
    const ready = await app.inject('/ready'); expect(ready.statusCode).toBe(200); expect(ready.headers['cache-control']).toBe('no-store');
    expect((await app.inject('/live')).statusCode).toBe(200);
    const response = await app.inject({ url: '/auth/me', headers: { origin: 'https://evil.example' } });
    expect(response.statusCode).toBe(401); expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
