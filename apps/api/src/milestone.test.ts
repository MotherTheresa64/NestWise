import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import WebSocket from 'ws';
import { buildApi } from './app';
import { migrate } from './migrate';
import type { AccountMail } from './account';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('live household product integration', () => {
  const schema = `live_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: url });
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 15 });
  const delivered: Parameters<AccountMail>[0][] = [];
  let api: Awaited<ReturnType<typeof buildApi>>; let replica: typeof api; let address: string;
  let owner: string; let caregiver: string; let caregiverId: string; let household: string; let child: string;
  const sockets: WebSocket[] = [];
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, token?: string, body?: unknown) => api.inject({ method, url: path, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { payload: JSON.stringify(body) } : {}) });
  const path = (s: string) => `/households/${household}/${s}`;
  const register = async (email: string) => { const result = await call('POST', '/auth/register', undefined, { email, name: 'Parent', password: 'original passphrase 123' }); expect(result.statusCode).toBe(200); return result.json(); };
  async function connect(token: string, householdId: string) {
    const ws = new WebSocket(address.replace('http', 'ws') + '/realtime'); sockets.push(ws);
    const messages: { type: string }[] = []; let closed = 0;
    ws.on('message', data => messages.push(JSON.parse(data.toString()))); ws.on('close', code => { closed = code; });
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    ws.send(JSON.stringify({ token, householdId })); return { ws, messages, closed: () => closed };
  }
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`); await migrate(pool); await migrate(pool);
    api = await buildApi(pool, { deliverAccountMail: async message => { delivered.push(message); } });
    replica = await buildApi(pool); address = await replica.listen({ port: 0, host: '127.0.0.1' });
    owner = (await register('owner@live.test')).token;
    const c = await register('caregiver@live.test'); caregiver = c.token; caregiverId = c.user.id;
    household = (await call('POST', '/households', owner, { name: 'Live family', timezone: 'America/Chicago' })).json().id;
    child = (await call('POST', path('children'), owner, { firstName: 'River', dateOfBirth: '2026-01-01' })).json().id;
    const invite = (await call('POST', path('invitations'), owner, { email: 'caregiver@live.test', role: 'caregiver' })).json();
    expect((await call('POST', '/invitations/accept', caregiver, { token: invite.token })).statusCode).toBe(200);
  });
  afterAll(async () => { sockets.forEach(ws => ws.terminate()); await replica?.close(); await api?.close(); await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  it('authorizes subscriptions and pushes committed changes across API instances without care payloads', async () => {
    const invalid = await connect(owner, randomUUID()); await expect.poll(invalid.closed).toBe(4403);
    const connection = await connect(caregiver, household); await expect.poll(() => connection.messages[0]?.type).toBe('ready');
    const reminder = await call('POST', path('reminders'), owner, { title: 'Private detail never on WebSocket', category: 'routine', dueAt: new Date(Date.now() + 3600000).toISOString() });
    expect(reminder.statusCode).toBe(200);
    await expect.poll(() => connection.messages.some(m => m.type === 'changed')).toBe(true);
    expect(connection.messages.every(m => Object.keys(m).join(',') === 'type')).toBe(true);
    const cursor = (await call('GET', path('snapshot'), caregiver)).json().revision;
    expect((await call('GET', path(`changes?after=${cursor}`), caregiver)).json()).toEqual({ changes: [], hasMore: false });
    connection.ws.close();
  });
  it('paginates committed changes without skipping revisions and rejects unauthenticated reads', async () => {
    expect((await call('GET', path('changes?after=0'))).statusCode).toBe(401);
    const cursor = (await call('GET', path('snapshot'), owner)).json().revision;
    const transaction = await pool.connect(); await transaction.query('BEGIN');
    try {
      for (let i = 0; i < 205; i++) { const id = randomUUID(); await transaction.query('INSERT INTO events VALUES($1,$2,$3,1,now())', [id, household, { id, householdId: household, childIds: [child], category: 'diaper', occurredAt: new Date().toISOString(), details: {}, notes: '', endedAt: null, deletedAt: null, version: 1 }]); }
      expect((await call('GET', path(`changes?after=${cursor}`), owner)).json().changes).toEqual([]);
      await transaction.query('COMMIT');
    } finally { transaction.release(); }
    const first = (await call('GET', path(`changes?after=${cursor}`), owner)).json(); expect(first.changes).toHaveLength(200); expect(first.hasMore).toBe(true);
    const second = (await call('GET', path(`changes?after=${first.changes.at(-1).revision}`), owner)).json(); expect(second.changes).toHaveLength(5); expect(second.hasMore).toBe(false);
    expect(new Set([...first.changes, ...second.changes].map((c: { revision: number }) => c.revision)).size).toBe(205);
  });
  it('edits and archives children with optimistic locking and preserves history', async () => {
    const body = { baseVersion: 1, child: { firstName: 'River edited', dateOfBirth: '2026-01-01', active: false } };
    expect((await call('PATCH', path(`children/${child}`), caregiver, body)).statusCode).toBe(403);
    expect((await call('PATCH', path(`children/${child}`), owner, body)).json().version).toBe(2);
    expect((await call('PATCH', path(`children/${child}`), owner, body)).statusCode).toBe(409);
    const snapshot = (await call('GET', path('snapshot'), owner)).json(); expect(snapshot.events).toHaveLength(205); expect(snapshot.children[0].active).toBe(false);
  });
  it('snoozes idempotently, detects stale snoozes and does not reopen completed reminders', async () => {
    const r = (await call('POST', path('reminders'), owner, { title: 'Check bag', category: 'routine', childIds: [child], dueAt: new Date().toISOString(), repeatMinutes: 60 })).json();
    const input = { dueAt: new Date(Date.now() + 900000).toISOString(), baseVersion: 1 };
    expect((await call('POST', path(`reminders/${r.id}/snooze`), caregiver, input)).json().version).toBe(2);
    expect((await call('POST', path(`reminders/${r.id}/snooze`), caregiver, input)).json().version).toBe(2);
    expect((await call('POST', path(`reminders/${r.id}/snooze`), caregiver, { ...input, dueAt: new Date(Date.now() + 1800000).toISOString() })).statusCode).toBe(409);
    await call('POST', path(`reminders/${r.id}/complete`), owner);
    expect((await call('POST', path(`reminders/${r.id}/snooze`), caregiver, input)).statusCode).toBe(409);
  });
  it('revokes other sessions without exposing credentials', async () => {
    const login = (await call('POST', '/auth/login', undefined, { email: 'owner@live.test', password: 'original passphrase 123' })).json();
    const connection = await connect(login.token, household); await expect.poll(() => connection.messages[0]?.type).toBe('ready');
    const sessions = (await call('GET', '/auth/sessions', owner)).json(); expect(sessions).toHaveLength(2); expect(JSON.stringify(sessions)).not.toContain('token');
    const other = sessions.find((s: { current: boolean }) => !s.current);
    expect((await call('DELETE', `/auth/sessions/${other.id}`, caregiver)).statusCode).toBe(404);
    expect((await call('DELETE', `/auth/sessions/${other.id}`, owner)).statusCode).toBe(200);
    await expect.poll(connection.closed).toBe(4403);
    expect((await call('GET', '/auth/me', login.token)).statusCode).toBe(401);
  });
  it('guards ownership, changes permissions and terminates a removed caregiver subscription', async () => {
    expect((await call('POST', path('membership'), owner, { action: 'leave' })).statusCode).toBe(409);
    expect((await call('POST', path('membership'), caregiver, { action: 'role', userId: caregiverId, role: 'admin' })).statusCode).toBe(403);
    const connection = await connect(caregiver, household); await expect.poll(() => connection.messages[0]?.type).toBe('ready');
    expect((await call('POST', path('membership'), owner, { action: 'role', userId: caregiverId, role: 'viewer' })).statusCode).toBe(200);
    expect((await call('POST', path('reminders'), caregiver, {})).statusCode).toBe(403);
    expect((await call('POST', path('membership'), owner, { action: 'remove', userId: caregiverId })).statusCode).toBe(200);
    await expect.poll(connection.closed).toBe(4403);
    expect((await call('GET', path('changes?after=0'), caregiver)).statusCode).toBe(404);
  });
  it('revokes invitations and transfers ownership atomically, then allows the former owner to leave', async () => {
    const revoked = (await call('POST', path('invitations'), owner, { email: 'caregiver@live.test', role: 'caregiver' })).json();
    const invitation = (await call('GET', path('invitations'), owner)).json().find((i: { email: string }) => i.email === 'caregiver@live.test');
    expect((await call('DELETE', path(`invitations/${invitation.id}`), owner)).statusCode).toBe(200);
    expect((await call('POST', '/invitations/accept', caregiver, { token: revoked.token })).statusCode).toBe(400);
    const fresh = (await call('POST', path('invitations'), owner, { email: 'caregiver@live.test', role: 'caregiver' })).json();
    await call('POST', '/invitations/accept', caregiver, { token: fresh.token });
    expect((await call('POST', path('membership'), owner, { action: 'transfer', userId: caregiverId, confirmation: 'yes' })).statusCode).toBe(400);
    expect((await call('POST', path('membership'), owner, { action: 'transfer', userId: caregiverId, confirmation: 'TRANSFER OWNERSHIP' })).statusCode).toBe(200);
    const members = (await call('GET', path('snapshot'), caregiver)).json().members;
    expect(members.filter((m: { role: string }) => m.role === 'owner')).toHaveLength(1);
    expect(members.find((m: { userId: string }) => m.userId === caregiverId).role).toBe('owner');
    expect((await call('POST', path('membership'), owner, { action: 'role', userId: caregiverId, role: 'viewer' })).statusCode).toBe(403);
    expect((await call('POST', path('membership'), owner, { action: 'leave' })).statusCode).toBe(200);
  });
  it('verifies email and resets passwords through one-use purpose-bound mail tokens', async () => {
    expect((await call('POST', '/auth/request-verification', owner)).statusCode).toBe(200);
    const verification = delivered.at(-1)!;
    expect((await call('POST', '/auth/reset-password', undefined, { token: verification.token, password: 'new valid passphrase 123' })).statusCode).toBe(400);
    expect((await call('POST', '/auth/verify-email', undefined, { token: verification.token })).statusCode).toBe(200);
    expect((await call('POST', '/auth/verify-email', undefined, { token: verification.token })).statusCode).toBe(400);
    expect((await call('GET', '/auth/security', owner)).json().emailVerified).toBe(true);
    const unknown = await call('POST', '/auth/request-reset', undefined, { email: 'unknown@live.test' });
    const known = await call('POST', '/auth/request-reset', undefined, { email: 'owner@live.test' }); expect(known.json()).toEqual(unknown.json());
    const reset = delivered.at(-1)!;
    expect((await call('POST', '/auth/reset-password', undefined, { token: reset.token, password: 'new valid passphrase 123' })).statusCode).toBe(200);
    expect((await call('GET', '/auth/me', owner)).statusCode).toBe(401);
    expect((await call('POST', '/auth/login', undefined, { email: 'owner@live.test', password: 'original passphrase 123' })).statusCode).toBe(401);
    expect((await call('POST', '/auth/login', undefined, { email: 'owner@live.test', password: 'new valid passphrase 123' })).statusCode).toBe(200);
  });
});
