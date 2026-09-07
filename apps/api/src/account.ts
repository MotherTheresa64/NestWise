import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { createHash, randomBytes, scrypt as callback } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { User } from '@nestwise/shared';
const scrypt = promisify(callback);
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
/** Production supplies a delivery adapter. Tokens are never returned in HTTP responses or logs. */
export type AccountMail = (message: { email: string; purpose: 'verify' | 'reset'; token: string; expiresMinutes: number }) => Promise<void>;
export function registerAccountRoutes(app: FastifyInstance, pool: pg.Pool, userFor: (request: FastifyRequest) => Promise<User>, deliver?: AccountMail) {
  const fail = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }); };
  app.get('/auth/security', async request => {
    const user = await userFor(request); const row = (await pool.query('SELECT verified_at FROM users WHERE id=$1', [user.id])).rows[0];
    return { emailVerified: !!row.verified_at, mailAvailable: !!deliver };
  });
  app.get('/auth/recovery-capabilities', async () => ({ mailAvailable: !!deliver }));
  async function issue(userId: string, email: string, purpose: 'verify' | 'reset') {
    if (!deliver) return fail(503, 'Email delivery has not been configured.');
    const token = randomBytes(32).toString('hex');
    await pool.query("INSERT INTO account_tokens VALUES($1,$2,$3,now()+interval '30 minutes')", [hash(token), userId, purpose]);
    try { await deliver({ email, token, purpose, expiresMinutes: 30 }); }
    catch (e) { await pool.query('DELETE FROM account_tokens WHERE token_hash=$1', [hash(token)]); throw e; }
  }
  app.post('/auth/request-verification', { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } }, async request => {
    const user = await userFor(request); await issue(user.id, user.email, 'verify'); return { ok: true };
  });
  app.post('/auth/request-reset', { config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } }, async request => {
    if (!deliver) return fail(503, 'Email delivery has not been configured.');
    const { email } = z.object({ email: z.string().email().max(254) }).strict().parse(request.body);
    const user = (await pool.query('SELECT id,email FROM users WHERE email=$1', [email.toLowerCase()])).rows[0];
    if (user) await issue(user.id, user.email, 'reset');
    return { message: 'If an account matches, recovery instructions will be sent.' };
  });
  for (const purpose of ['verify', 'reset'] as const) app.post(`/auth/${purpose === 'verify' ? 'verify-email' : 'reset-password'}`, { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async request => {
    const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), ...(purpose === 'reset' ? { password: z.string().min(12).max(128) } : {}) }).strict().parse(request.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const record = (await client.query('SELECT user_id FROM account_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now()', [hash(input.token), purpose])).rows[0];
      if (!record) return fail(400, 'This token is invalid or expired.');
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [record.user_id]);
      const consumed = await client.query('DELETE FROM account_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now() RETURNING user_id', [hash(input.token), purpose]);
      if (!consumed.rowCount) return fail(400, 'This token was already used.');
      if (purpose === 'verify') await client.query('UPDATE users SET verified_at=now() WHERE id=$1', [record.user_id]);
      else {
        const password = z.object({ password: z.string().min(12).max(128) }).parse(request.body).password;
        const salt = randomBytes(16).toString('hex'); const key = await scrypt(password, salt, 64) as Buffer;
        await client.query('UPDATE users SET password_hash=$1 WHERE id=$2', [`${salt}:${key.toString('hex')}`, record.user_id]);
        await client.query('DELETE FROM sessions WHERE user_id=$1', [record.user_id]);
        await client.query("SELECT pg_notify('nestwise_changes',household_id::text) FROM members WHERE user_id=$1", [record.user_id]);
      }
      await client.query('DELETE FROM account_tokens WHERE user_id=$1 AND purpose=$2', [record.user_id, purpose]);
      await client.query('COMMIT'); return { ok: true };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  app.get('/auth/sessions', async request => {
    const user = await userFor(request);
    return (await pool.query('SELECT id,created_at AS "createdAt",expires_at AS "expiresAt",token_hash=$2 AS current FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC', [user.id, hash(request.headers.authorization!.slice(7))])).rows;
  });
  app.delete('/auth/sessions/:id', async request => {
    const user = await userFor(request); const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await pool.query('DELETE FROM sessions WHERE id=$1 AND user_id=$2 AND token_hash<>$3 RETURNING id', [id, user.id, hash(request.headers.authorization!.slice(7))]);
    if (!result.rowCount) return fail(404, 'Session not found. Use Sign out to end this session.');
    await pool.query("SELECT pg_notify('nestwise_changes',household_id::text) FROM members WHERE user_id=$1", [user.id]);
    return { ok: true };
  });
}
