import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Reminder } from '@nestwise/shared';
import { notificationPlan } from './notification-plan';
export const localNotificationsSupported = true;
export async function enableLocalNotifications() {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('care-reminders', { name: 'Care reminders', importance: Notifications.AndroidImportance.DEFAULT, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE });
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Notification permission was not granted. You can change it in device settings.');
}
let pending = Promise.resolve();
export function reconcileNotifications(reminders: Reminder[]): Promise<void> {
  const next = pending.catch(() => {}).then(async () => {
    const permission = await Notifications.getPermissionsAsync();
    const desired = permission.granted ? notificationPlan(reminders) : [];
    const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter(n => n.identifier.startsWith('nestwise-'));
    for (const entry of scheduled) {
      if (!desired.some(d => d.id === entry.identifier && entry.content.data?.dueAt === d.dueAt)) await Notifications.cancelScheduledNotificationAsync(entry.identifier);
    }
    for (const entry of desired) {
      if (scheduled.some(n => n.identifier === entry.id && n.content.data?.dueAt === entry.dueAt)) continue;
      await Notifications.scheduleNotificationAsync({ identifier: entry.id,
        content: { title: 'NestWise reminder', body: 'Open your nest to review a care reminder.', data: { dueAt: entry.dueAt } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(entry.dueAt), channelId: 'care-reminders' } });
    }
  });
  pending = next; return next;
}
