import { expect, it } from 'vitest';
import { applyChanges, optimisticEvents } from './queue';
import { notificationPlan } from './notification-plan';
import type { CareEvent, Reminder, Snapshot, SyncMutation } from '@nestwise/shared';
const event: CareEvent = { id: 'e', householdId: 'h', childIds: ['c'], category: 'sleep', occurredAt: '2026-01-01T10:00:00Z', endedAt: null, notes: '', details: {}, version: 1, createdBy: 'u', createdByName: 'Parent', updatedBy: 'u', createdAt: '', updatedAt: '', deletedAt: null };
const snapshot: Snapshot = { household: { id: 'h', name: 'Family', role: 'owner', timezone: 'UTC' }, children: [], members: [], reminders: [], events: [event], serverTime: '', revision: 1 };
it('merges ordered changes without discarding optimistic edits, ignores old revisions and applies tombstones', () => {
  const next = applyChanges(snapshot, [{ kind: 'events', entityId: 'e', revision: 2, record: { ...event, notes: 'Other caregiver', version: 2 } }], 'u');
  const pending: SyncMutation = { mutationId: 'm', eventId: 'e', operation: 'update', baseVersion: 1, event: { ...event, notes: 'My unsynced edit' } };
  expect(optimisticEvents(next, [pending], { id: 'u', name: 'Parent' })[0].notes).toBe('My unsynced edit');
  expect(next.events[0].notes).toBe('Other caregiver');
  expect(applyChanges(next, [{ kind: 'events', entityId: 'e', revision: 1, record: event }], 'u')).toEqual(next);
  expect(applyChanges(next, [{ kind: 'events', entityId: 'e', revision: 3, record: null }], 'u').events).toEqual([]);
});
it('updates the active user role from a household-scoped member change', () => {
  expect(applyChanges(snapshot, [{ kind: 'members', entityId: 'u', revision: 2, record: { userId: 'u', name: 'Parent', email: 'p@test', role: 'viewer' } }], 'u').household.role).toBe('viewer');
});
it('bounds local notifications, excludes completed/past reminders, and never includes care details', () => {
  const now = Date.now(); const reminders: Reminder[] = Array.from({ length: 60 }, (_, i) => ({ id: String(i), householdId: 'h', title: 'Private medicine name', category: 'medicine', childIds: ['c'], repeatMinutes: null, dueAt: new Date(now + i * 60000).toISOString(), completedAt: i === 1 ? new Date().toISOString() : null }));
  const plan = notificationPlan(reminders, now); expect(plan).toHaveLength(48); expect(plan[0].id).toBe('nestwise-h-2'); expect(JSON.stringify(plan)).not.toContain('medicine');
});
