import type { CareEvent, Child } from '@nestwise/shared';
export function sleepHours(events: CareEvent[], childId: string, start: number, end: number): number {
  const intervals = events.filter(e => !e.deletedAt && e.category === 'sleep' && e.endedAt && e.childIds.includes(childId))
    .map(e => [Math.max(start, Date.parse(e.occurredAt)), Math.min(end, Date.parse(e.endedAt!))])
    .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let total = 0; let previousEnd = start;
  for (const [a, b] of intervals) { total += Math.max(0, b - Math.max(a, previousEnd)); previousEnd = Math.max(previousEnd, b); }
  return total / 3600000;
}
const escape = (value: unknown) => `"${String(value).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
export function exportCsv(events: CareEvent[], children: Child[]): string {
  return [['Children', 'Category', 'Started (UTC)', 'Ended (UTC)', 'Quantity', 'Unit', 'Details', 'Notes', 'Caregiver'].map(escape).join(','),
    ...events.filter(e => !e.deletedAt).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).map(e => [children.filter(c => e.childIds.includes(c.id)).map(c => c.firstName).join(' & '), e.category, e.occurredAt, e.endedAt || '', e.details.quantity ?? '', e.details.unit || '', JSON.stringify(e.details), e.notes, e.createdByName].map(escape).join(','))].join('\r\n');
}
