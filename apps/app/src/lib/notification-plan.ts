import type { Reminder } from '@nestwise/shared';
export function notificationPlan(reminders: Reminder[], now = Date.now()) {
  return reminders.filter(r => !r.completedAt && Date.parse(r.dueAt) > now)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)).slice(0, 48)
    .map(r => ({ id: `nestwise-${r.householdId}-${r.id}`, dueAt: r.dueAt }));
}
