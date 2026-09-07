import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { registerRealtime } from './realtime';
import { registerAccountRoutes, type AccountMail } from './account';
import type pg from 'pg';
import { z } from 'zod';
import { canManage, canWrite, childInputSchema, householdInputSchema, idSchema, loginSchema, mutationSchema, registerSchema, reminderInputSchema, type CareEvent, type Reminder, type Role, type User } from '@nestwise/shared';

const scrypt = promisify(scryptCallback);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }); };
type Access = { user: User; role: Role; householdId: string };
const paramsSchema = z.object({ householdId: idSchema });

export async function buildApi(pool: pg.Pool, options: { deliverAccountMail?: AccountMail } = {}) {
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024 });
  await app.register(cors, { origin: (process.env.CORS_ORIGIN || 'http://localhost:8081').split(','), methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  await app.register(helmet);
  await app.register(rateLimit, { max: 200, timeWindow: '1 minute' });
  await registerRealtime(app, pool);
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') });
    const e = error as Error & { statusCode?: number; code?: string };
    if (e.code === '23505') return reply.code(409).send({ error: 'This record already exists.' });
    const status = e.statusCode || 500;
    if (status >= 500) app.log.error(error);
    return reply.code(status).send({ error: status >= 500 ? 'Unable to complete the request.' : e.message });
  });
  async function userFor(request: FastifyRequest): Promise<User> {
    const token = request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) return fail(401, 'Please sign in.');
    const result = await pool.query('SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()', [hash(token)]);
    return result.rows[0] || fail(401, 'Your session has expired. Please sign in again.');
  }
  registerAccountRoutes(app, pool, userFor, options.deliverAccountMail);
  async function access(request: FastifyRequest, mode: 'read' | 'write' | 'manage' = 'read'): Promise<Access> {
    const user = await userFor(request);
    const { householdId } = paramsSchema.parse(request.params);
    const result = await pool.query('SELECT role FROM members WHERE household_id=$1 AND user_id=$2', [householdId, user.id]);
    const role = result.rows[0]?.role as Role | undefined;
    if (!role) return fail(404, 'Household not found.');
    if ((mode === 'write' && !canWrite(role)) || (mode === 'manage' && !canManage(role))) return fail(403, 'Your role does not allow this action.');
    return { user, role, householdId };
  }
  async function session(user: User) {
    const token = randomBytes(32).toString('hex');
    await pool.query('INSERT INTO sessions(token_hash,user_id) VALUES($1,$2)', [hash(token), user.id]);
    return { token, user };
  }
  async function checkChildren(client: pg.Pool | pg.PoolClient, householdId: string, childIds: string[]) {
    const result = await client.query('SELECT id FROM children WHERE household_id=$1 AND id=ANY($2::uuid[])', [householdId, childIds]);
    if (result.rowCount !== new Set(childIds).size) fail(400, 'Every child must belong to this household.');
  }
  app.get('/health', async () => { await pool.query('SELECT 1'); return { status: 'ok' }; });
  app.post('/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async request => {
    const input = registerSchema.parse(request.body);
    const salt = randomBytes(16).toString('hex');
    const key = await scrypt(input.password, salt, 64) as Buffer;
    const user = { id: randomUUID(), email: input.email.toLowerCase(), name: input.name };
    await pool.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)', [user.id, user.email, user.name, `${salt}:${key.toString('hex')}`]);
    return session(user);
  });
  app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async request => {
    const input = loginSchema.parse(request.body);
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [input.email.toLowerCase()]);
    const record = result.rows[0];
    const [salt, stored] = (record?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
    const key = await scrypt(input.password, salt, 64) as Buffer;
    if (!record || !timingSafeEqual(key, Buffer.from(stored, 'hex'))) return fail(401, 'Email or password is incorrect.');
    return session({ id: record.id, email: record.email, name: record.name });
  });
  app.get('/auth/me', async request => userFor(request));
  app.post('/auth/logout', async request => {
    await userFor(request);
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [hash(request.headers.authorization!.slice(7))]);
    return { ok: true };
  });
  app.get('/households', async request => {
    const user = await userFor(request);
    return (await pool.query('SELECT h.*,m.role FROM households h JOIN members m ON m.household_id=h.id WHERE m.user_id=$1 ORDER BY h.name', [user.id])).rows;
  });
  app.post('/households', async request => {
    const user = await userFor(request); const input = householdInputSchema.parse(request.body); const id = randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO households(id,name,timezone) VALUES($1,$2,$3)', [id, input.name, input.timezone]);
      await client.query('INSERT INTO members VALUES($1,$2,$3)', [id, user.id, 'owner']);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    return { id, ...input, role: 'owner' };
  });
  app.get('/households/:householdId/snapshot', async request => {
    const { householdId, role } = await access(request);
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const household = (await client.query('SELECT * FROM households WHERE id=$1', [householdId])).rows[0];
      const children = (await client.query('SELECT id,data,created_at,version FROM children WHERE household_id=$1 ORDER BY created_at', [householdId])).rows.map(r => ({ ...r.data, id: r.id, householdId, createdAt: r.created_at.toISOString(), version: r.version }));
      const events = (await client.query('SELECT data FROM events WHERE household_id=$1 ORDER BY updated_at DESC', [householdId])).rows.map(r => r.data);
      const members = (await client.query('SELECT u.id AS "userId",u.name,u.email,m.role FROM members m JOIN users u ON u.id=m.user_id WHERE m.household_id=$1', [householdId])).rows;
      const reminders = (await client.query('SELECT data FROM reminders WHERE household_id=$1', [householdId])).rows.map(r => r.data);
      await client.query('COMMIT');
      return { household: { ...household, role }, revision: Number(household.revision), children, events, members, reminders, serverTime: new Date().toISOString() };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  app.get('/households/:householdId/changes', async request => {
    const { householdId } = await access(request);
    const { after } = z.object({ after: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).parse(request.query);
    const rows = (await pool.query('SELECT revision,kind,entity_id AS "entityId",record FROM changes WHERE household_id=$1 AND revision>$2 ORDER BY revision LIMIT 201', [householdId, after])).rows;
    return { changes: rows.slice(0, 200).map(r => ({ ...r, revision: Number(r.revision) })), hasMore: rows.length > 200 };
  });
  app.post('/households/:householdId/children', async request => {
    const { householdId } = await access(request, 'manage'); const input = childInputSchema.parse(request.body); const id = randomUUID();
    const result = await pool.query('INSERT INTO children(id,household_id,data) VALUES($1,$2,$3) RETURNING created_at', [id, householdId, input]);
    return { ...input, id, householdId, createdAt: result.rows[0].created_at.toISOString(), version: 1 };
  });
  app.patch('/households/:householdId/children/:id', async request => {
    const { householdId } = await access(request, 'manage');
    const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = z.object({ baseVersion: z.number().int().positive(), child: childInputSchema }).strict().parse(request.body);
    const result = await pool.query('UPDATE children SET data=$1,version=version+1 WHERE id=$2 AND household_id=$3 AND version=$4 RETURNING *', [input.child, id, householdId, input.baseVersion]);
    if (!result.rowCount) fail(409, 'This child was changed or is unavailable. Refresh and review before saving again.');
    const row = result.rows[0]; return { ...row.data, id, householdId, createdAt: row.created_at.toISOString(), version: row.version };
  });
  app.post('/households/:householdId/sync', async request => {
    const { user, householdId } = await access(request, 'write');
    const mutations = z.array(mutationSchema).min(1).max(100).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serializes mutations within a household, including retries with the same mutation ID.
      await client.query('SELECT id FROM households WHERE id=$1 FOR UPDATE', [householdId]);
      const membership = (await client.query('SELECT m.role FROM members m JOIN sessions s ON s.user_id=m.user_id WHERE m.household_id=$1 AND m.user_id=$2 AND s.token_hash=$3 AND s.expires_at>now()', [householdId, user.id, hash(request.headers.authorization!.slice(7))])).rows[0];
      if (!membership || !canWrite(membership.role)) return fail(403, 'Your permission to log care has ended.');
      const results = [];
      for (const mutation of mutations) {
        const receipt = (await client.query('SELECT * FROM mutation_receipts WHERE household_id=$1 AND mutation_id=$2', [householdId, mutation.mutationId])).rows[0];
        if (receipt) {
          const same = await client.query('SELECT $1::jsonb=$2::jsonb AS same', [receipt.input, mutation]);
          if (receipt.user_id !== user.id || !same.rows[0].same) fail(409, 'Mutation ID was already used for a different request.');
          results.push(receipt.result); continue;
        }
        const existing = (await client.query('SELECT data FROM events WHERE id=$1 AND household_id=$2', [mutation.eventId, householdId])).rows[0]?.data as CareEvent | undefined;
        if (!existing && mutation.operation !== 'create') fail(404, 'Care event not found.');
        if (!existing && mutation.baseVersion !== 0) fail(400, 'New events must start at version zero.');
        if (mutation.event) await checkChildren(client, householdId, mutation.event.childIds);
        const conflict = existing && (mutation.operation === 'create' || existing.version !== mutation.baseVersion || existing.deletedAt);
        let event: CareEvent;
        if (conflict) event = existing;
        else {
          const now = new Date().toISOString();
          event = { ...(mutation.event || existing!), householdId, createdBy: existing?.createdBy || user.id,
            createdByName: existing?.createdByName || user.name, updatedBy: user.id, createdAt: existing?.createdAt || now,
            updatedAt: now, version: (existing?.version || 0) + 1, deletedAt: mutation.operation === 'delete' ? now : null };
          if (existing) await client.query('UPDATE events SET data=$1,version=$2,updated_at=now() WHERE id=$3 AND household_id=$4', [event, event.version, event.id, householdId]);
          else await client.query('INSERT INTO events(id,household_id,data,version) VALUES($1,$2,$3,$4)', [event.id, householdId, event, event.version]);
          await client.query('INSERT INTO audit(household_id,user_id,action,entity_id) VALUES($1,$2,$3,$4)', [householdId, user.id, mutation.operation, event.id]);
        }
        const result = { mutationId: mutation.mutationId, status: conflict ? 'conflict' : 'applied', event };
        await client.query('INSERT INTO mutation_receipts VALUES($1,$2,$3,$4,$5)', [householdId, mutation.mutationId, user.id, mutation, result]);
        results.push(result);
      }
      await client.query('COMMIT'); return results;
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  app.post('/households/:householdId/invitations', async request => {
    const { householdId, role } = await access(request, 'manage');
    const input = z.object({ email: z.string().email().max(254), role: z.enum(['admin', 'caregiver', 'viewer']) }).strict().parse(request.body);
    if (role !== 'owner' && input.role === 'admin') fail(403, 'Only owners can invite administrators.');
    const token = randomBytes(32).toString('hex');
    await pool.query('INSERT INTO invitations(id,household_id,email,role,token_hash) VALUES($1,$2,$3,$4,$5)', [randomUUID(), householdId, input.email.toLowerCase(), input.role, hash(token)]);
    return { token, expiresInDays: 7 };
  });
  app.post('/invitations/accept', async request => {
    const user = await userFor(request); const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const invite = (await client.query('DELETE FROM invitations WHERE token_hash=$1 AND email=$2 AND expires_at>now() RETURNING *', [hash(token), user.email])).rows[0];
      if (!invite) fail(400, 'Invitation is invalid, expired, or addressed to another email.');
      await client.query('INSERT INTO members VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [invite.household_id, user.id, invite.role]);
      await client.query('COMMIT'); return { ok: true };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  app.post('/households/:householdId/reminders', async request => {
    const { householdId } = await access(request, 'write'); const input = reminderInputSchema.parse(request.body);
    await checkChildren(pool, householdId, input.childIds);
    const reminder = { ...input, id: randomUUID(), householdId, completedAt: null, version: 1 };
    await pool.query('INSERT INTO reminders VALUES($1,$2,$3)', [reminder.id, householdId, reminder]); return reminder;
  });
  app.post('/households/:householdId/reminders/:id/complete', async request => {
    const { householdId } = await access(request, 'write'); const { id } = z.object({ id: idSchema }).parse(request.params);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const reminder = (await client.query('SELECT data FROM reminders WHERE id=$1 AND household_id=$2 FOR UPDATE', [id, householdId])).rows[0]?.data as Reminder | undefined;
      if (!reminder) return fail(404, 'Reminder not found.');
      if (!reminder.completedAt) {
        reminder.completedAt = new Date().toISOString();
        reminder.version = (reminder.version || 1) + 1;
        await client.query('UPDATE reminders SET data=$1 WHERE id=$2', [reminder, id]);
        if (reminder.repeatMinutes) {
          const step = reminder.repeatMinutes * 60000; const previous = Date.parse(reminder.dueAt);
          const next = { ...reminder, id: randomUUID(), version: 1, dueAt: new Date(previous + Math.max(1, Math.floor((Date.now() - previous) / step) + 1) * step).toISOString(), completedAt: null };
          await client.query('INSERT INTO reminders VALUES($1,$2,$3)', [next.id, householdId, next]);
        }
      }
      await client.query('COMMIT'); return reminder;
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  app.post('/households/:householdId/reminders/:id/snooze', async request => {
    const { householdId } = await access(request, 'write'); const { id } = z.object({ id: idSchema }).parse(request.params);
    const input = z.object({ dueAt: z.string().datetime(), baseVersion: z.number().int().positive() }).strict().parse(request.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const reminder = (await client.query('SELECT data FROM reminders WHERE id=$1 AND household_id=$2 FOR UPDATE', [id, householdId])).rows[0]?.data as Reminder | undefined;
      if (!reminder) return fail(404, 'Reminder not found.');
      if (reminder.completedAt) fail(409, 'This reminder is already complete.');
      if (reminder.dueAt !== input.dueAt) {
        if ((reminder.version || 1) !== input.baseVersion) fail(409, 'Another caregiver changed this reminder. Refresh and review.');
        if (Date.parse(input.dueAt) <= Date.now()) fail(400, 'Choose a future snooze time.');
        reminder.dueAt = input.dueAt; reminder.version = (reminder.version || 1) + 1;
        await client.query('UPDATE reminders SET data=$1 WHERE id=$2', [reminder, id]);
      }
      await client.query('COMMIT'); return reminder;
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  app.get('/households/:householdId/audit', async request => {
    const { householdId } = await access(request, 'manage');
    return (await pool.query('SELECT * FROM audit WHERE household_id=$1 ORDER BY id DESC LIMIT 200', [householdId])).rows;
  });
  app.get('/households/:householdId/invitations', async request => {
    const { householdId } = await access(request, 'manage');
    return (await pool.query('SELECT id,email,role,expires_at AS "expiresAt" FROM invitations WHERE household_id=$1 ORDER BY expires_at DESC', [householdId])).rows;
  });
  app.delete('/households/:householdId/invitations/:id', async request => {
    const { householdId } = await access(request, 'manage'); const { id } = z.object({ id: idSchema }).parse(request.params);
    await pool.query('DELETE FROM invitations WHERE household_id=$1 AND id=$2', [householdId, id]); return { ok: true };
  });
  app.post('/households/:householdId/membership', async request => {
    const { householdId, user } = await access(request);
    const input = z.discriminatedUnion('action', [
      z.object({ action: z.literal('role'), userId: idSchema, role: z.enum(['admin', 'caregiver', 'viewer']) }).strict(),
      z.object({ action: z.literal('remove'), userId: idSchema }).strict(),
      z.object({ action: z.literal('transfer'), userId: idSchema, confirmation: z.literal('TRANSFER OWNERSHIP') }).strict(),
      z.object({ action: z.literal('leave') }).strict(),
    ]).parse(request.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM households WHERE id=$1 FOR UPDATE', [householdId]);
      const members = (await client.query('SELECT user_id,role FROM members WHERE household_id=$1', [householdId])).rows;
      const role = members.find(m => m.user_id === user.id)?.role;
      const targetId = input.action === 'leave' ? user.id : input.userId;
      const target = members.find(m => m.user_id === targetId);
      if (!role || !target) return fail(404, 'Household member not found.');
      if (input.action === 'leave') {
        if (role === 'owner') return fail(409, 'Transfer ownership before leaving.');
        await client.query('DELETE FROM members WHERE household_id=$1 AND user_id=$2', [householdId, user.id]);
      } else {
        if (role !== 'owner') return fail(403, 'Only the owner can change membership or transfer ownership.');
        if (targetId === user.id || target.role === 'owner') return fail(409, 'Use ownership transfer or Leave household for your own membership.');
        if (input.action === 'remove') await client.query('DELETE FROM members WHERE household_id=$1 AND user_id=$2', [householdId, targetId]);
        if (input.action === 'role') await client.query('UPDATE members SET role=$1 WHERE household_id=$2 AND user_id=$3', [input.role, householdId, targetId]);
        if (input.action === 'transfer') {
          await client.query("UPDATE members SET role='admin' WHERE household_id=$1 AND user_id=$2", [householdId, user.id]);
          await client.query("UPDATE members SET role='owner' WHERE household_id=$1 AND user_id=$2", [householdId, targetId]);
        }
      }
      await client.query('INSERT INTO audit(household_id,user_id,action,entity_id) VALUES($1,$2,$3,$4)', [householdId, user.id, `membership:${input.action}`, targetId]);
      await client.query('COMMIT'); return { ok: true };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  });
  return app;
}
