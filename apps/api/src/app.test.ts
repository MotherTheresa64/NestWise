import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildApi } from './app';
import { migrate } from './migrate';

// Each run uses a dedicated schema. Never truncates an existing database.
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL API integration', () => {
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: url });
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  let app: Awaited<ReturnType<typeof buildApi>>;
  let owner: string; let outsider: string; let householdId: string; let childId: string; let eventId: string;
  const call = async (method: 'GET' | 'POST', path: string, token?: string, payload?: unknown) => app.inject({ method, url: path, headers: token ? { authorization: `Bearer ${token}` } : {}, ...(payload === undefined ? {} : { payload: JSON.stringify(payload), headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' } }) });
  const path = (suffix: string) => `/households/${householdId}/${suffix}`;
  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`); await migrate(pool); await migrate(pool); app = await buildApi(pool);
    const register = async (email: string) => {
      const response = await call('POST', '/auth/register', undefined, { name: 'Caregiver', email, password: 'correct horse battery staple' }); expect(response.statusCode).toBe(200); return response.json().token;
    };
    owner = await register('owner@example.test'); outsider = await register('other@example.test');
    const h = await call('POST', '/households', owner, { name: 'Test family', timezone: 'America/Chicago' }); householdId = h.json().id;
    const c = await call('POST', path('children'), owner, { firstName: 'Alex', dateOfBirth: '2025-01-01' }); childId = c.json().id;
  });
  afterAll(async () => { await app?.close(); await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  it('enforces authentication and household isolation', async () => {
    expect((await call('GET', path('snapshot'))).statusCode).toBe(401);
    expect((await call('GET', path('snapshot'), outsider)).statusCode).toBe(404);
    expect((await call('POST', path('children'), outsider, { firstName: 'Bad', dateOfBirth: '2025-01-01' })).statusCode).toBe(404);
    expect((await call('GET', path('snapshot'), owner)).json().children).toHaveLength(1);
  });
  it('applies retries exactly once, detects stale edits and audits only writes', async () => {
    eventId = randomUUID();
    const event = { id: eventId, childIds: [childId], category: 'sleep', occurredAt: '2026-09-01T10:00:00Z', details: { sleepKind: 'nap' } };
    const mutation = { mutationId: randomUUID(), operation: 'create', eventId, baseVersion: 0, event };
    const [first, retry] = await Promise.all([call('POST', path('sync'), owner, [mutation]), call('POST', path('sync'), owner, [mutation])]);
    expect(first.statusCode).toBe(200); expect(retry.json()).toEqual(first.json());
    const update = { ...mutation, mutationId: randomUUID(), operation: 'update', baseVersion: 1, event: { ...event, endedAt: '2026-09-01T11:00:00Z' } };
    expect((await call('POST', path('sync'), owner, [update])).json()[0].event.version).toBe(2);
    expect((await call('POST', path('sync'), owner, [{ ...update, mutationId: randomUUID() }])).json()[0].status).toBe('conflict');
    expect((await call('GET', path('audit'), owner)).json()).toHaveLength(2);
    expect((await call('POST', path('sync'), owner, [{ ...mutation, event: { ...event, notes: 'changed retry' } }])).statusCode).toBe(409);
  });
  it('rejects foreign children and rolls back an invalid batch', async () => {
    const event = { id: randomUUID(), childIds: [childId], category: 'diaper', occurredAt: '2026-09-01T10:00:00Z' };
    const mutation = { mutationId: randomUUID(), operation: 'create', eventId: event.id, baseVersion: 0, event };
    const badId = randomUUID();
    const result = await call('POST', path('sync'), owner, [mutation, { ...mutation, mutationId: randomUUID(), eventId: badId, event: { ...event, id: badId, childIds: [randomUUID()] } }]);
    expect(result.statusCode).toBe(400);
    expect((await call('GET', path('snapshot'), owner)).json().events.some((e: { id: string }) => e.id === event.id)).toBe(false);
  });
  it('binds invitations to emails, prevents reuse, and enforces viewer read-only access', async () => {
    const invite = (await call('POST', path('invitations'), owner, { email: 'other@example.test', role: 'viewer' })).json();
    expect((await call('POST', '/invitations/accept', owner, { token: invite.token })).statusCode).toBe(400);
    expect((await call('POST', '/invitations/accept', outsider, { token: invite.token })).statusCode).toBe(200);
    expect((await call('POST', '/invitations/accept', outsider, { token: invite.token })).statusCode).toBe(400);
    expect((await call('GET', path('snapshot'), outsider)).statusCode).toBe(200);
    expect((await call('POST', path('sync'), outsider, [{ mutationId: randomUUID(), operation: 'delete', eventId, baseVersion: 2 }])).statusCode).toBe(403);
    expect((await call('GET', path('audit'), outsider)).statusCode).toBe(403);
  });
  it('revokes sessions on logout', async () => {
    expect((await call('POST', '/auth/logout', outsider)).statusCode).toBe(200);
    expect((await call('GET', '/auth/me', outsider)).statusCode).toBe(401);
  });
  it('completes recurring reminders exactly once and isolates reminder actions', async () => {
    const response = await call('POST', path('reminders'), owner, { title: 'Check supplies', category: 'routine', dueAt: '2026-01-01T10:00:00Z', repeatMinutes: 60 });
    expect(response.statusCode).toBe(200);
    const id = response.json().id;
    const results = await Promise.all([call('POST', path(`reminders/${id}/complete`), owner), call('POST', path(`reminders/${id}/complete`), owner)]);
    expect(results.every(r => r.statusCode === 200)).toBe(true);
    const reminders = (await call('GET', path('snapshot'), owner)).json().reminders;
    expect(reminders).toHaveLength(2);
    expect(Date.parse(reminders.find((r: { completedAt: string | null }) => !r.completedAt).dueAt)).toBeGreaterThan(Date.now());
  });
});
