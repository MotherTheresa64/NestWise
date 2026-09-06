import { it, expect } from 'vitest';
import { optimisticEvents, applyResult } from './queue';
import type { Snapshot, SyncMutation } from '@nestwise/shared';
import { exportCsv, sleepHours } from './report';
const snapshot: Snapshot = { household: { id: 'h', name: 'Family', role: 'owner', timezone: 'UTC' }, children: [], events: [], members: [], reminders: [], serverTime: '' };
const create: SyncMutation = { mutationId: 'm', operation: 'create', eventId: 'e', baseVersion: 0, event: { id: 'e', childIds: ['c'], category: 'sleep', occurredAt: '2026-09-01T10:00:00Z', endedAt: null, notes: '=HYPERLINK("bad")', details: {} } };
it('reconstructs offline create → stop → delete in queue order without modifying server state', () => {
  const update = { ...create, operation: 'update' as const, baseVersion: 1, event: { ...create.event!, endedAt: '2026-09-01T11:00:00Z' } };
  const events = optimisticEvents(snapshot, [create, update], { id: 'u', name: 'Parent' });
  expect(events[0].version).toBe(2); expect(events[0].endedAt).toBe(update.event.endedAt); expect(snapshot.events).toEqual([]);
  expect(optimisticEvents(snapshot, [create, update, { ...create, operation: 'delete', baseVersion: 2 }], { id: 'u', name: 'Parent' })[0].deletedAt).toBeTruthy();
  expect(applyResult(snapshot, { mutationId: 'm', status: 'applied', event: events[0] }).events).toHaveLength(1);
});
it('exports real data and neutralizes spreadsheet formulas', () => {
  const events = optimisticEvents(snapshot, [create], { id: 'u', name: 'Parent' });
  const csv = exportCsv(events, []); expect(csv).toContain("'=HYPERLINK"); expect(csv).toContain('2026-09-01T10:00:00Z');
  expect(exportCsv([{ ...events[0], deletedAt: 'now' }], []).split('\r\n')).toHaveLength(1);
});
it('clips sleep at report boundaries and does not double count overlapping logs', () => {
  const event = optimisticEvents(snapshot, [create], { id: 'u', name: 'Parent' })[0];
  const logs = [{ ...event, endedAt: '2026-09-01T12:00:00Z' }, { ...event, occurredAt: '2026-09-01T11:00:00Z', endedAt: '2026-09-01T13:00:00Z' }];
  expect(sleepHours(logs, 'c', Date.parse('2026-09-01T11:30:00Z'), Date.parse('2026-09-01T12:30:00Z'))).toBe(1);
});
