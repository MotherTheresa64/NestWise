import { type CareEvent, type MutationResult, type Snapshot, type SyncMutation } from '@nestwise/shared';
export function optimisticEvents(snapshot: Snapshot, queue: SyncMutation[], user: { id: string; name: string }): CareEvent[] {
  const events = new Map(snapshot.events.map(event => [event.id, event]));
  for (const mutation of queue) {
    const previous = events.get(mutation.eventId);
    if (mutation.operation === 'delete') {
      if (previous) events.set(previous.id, { ...previous, deletedAt: new Date().toISOString(), version: mutation.baseVersion + 1 });
    } else if (mutation.event) events.set(mutation.eventId, {
      ...mutation.event, householdId: snapshot.household.id, createdBy: previous?.createdBy || user.id,
      createdByName: previous?.createdByName || user.name, updatedBy: user.id,
      createdAt: previous?.createdAt || mutation.event.occurredAt, updatedAt: mutation.event.occurredAt,
      version: mutation.baseVersion + 1, deletedAt: null,
    });
  }
  return [...events.values()];
}
export function applyResult(snapshot: Snapshot, result: MutationResult): Snapshot {
  return { ...snapshot, events: [...snapshot.events.filter(event => event.id !== result.event.id), result.event] };
}
