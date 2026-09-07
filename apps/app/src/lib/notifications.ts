import type { Reminder } from '@nestwise/shared';
export const localNotificationsSupported = false;
export async function enableLocalNotifications(): Promise<void> { throw new Error('Local notifications require the iOS or Android app.'); }
export async function reconcileNotifications(_reminders: Reminder[]): Promise<void> {}
