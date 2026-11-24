import * as Notifications from 'expo-notifications';

/** One reminder at a time: scheduling a new one replaces the old one. */
export const REMINDER_ID = 'warehouse-savings-reminder';
export const REMINDER_SCREEN = 'ReadSavings';
const CHANNEL_ID = 'reminders';
const REMINDER_HOUR = 10;
const MAX_DAYS = 7;

/**
 * When to remind the owner to read Warehouse Savings again, at 10 AM local time: a week after
 * this reading, or the day after about half of the saved offers have ended if that's sooner
 * (new offers usually start then). Never sooner than tomorrow.
 */
export function nextReminder(now: Date, endDates: string[]): Date {
  const day = (offset: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, REMINDER_HOUR);
  let when = day(MAX_DAYS);
  const sorted = [...endDates].sort();
  if (sorted.length > 0) {
    const [y, m, d] = sorted[Math.floor((sorted.length - 1) / 2)].split('-').map(Number);
    const afterMedian = new Date(y, m - 1, d + 1, REMINDER_HOUR);
    if (afterMedian < when) when = afterMedian;
  }
  const tomorrow = day(1);
  return when < tomorrow ? tomorrow : when;
}

/**
 * Schedules the next reminder on the phone. Asks for notification permission the first time.
 * Returns when it will show, or null if notifications aren't allowed.
 */
export async function scheduleSavingsReminder(
  endDates: string[],
  now: Date = new Date(),
): Promise<Date | null> {
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return null;

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Reminders',
    // The enum comes through a nested `export *` the lint rule can't follow.
    // eslint-disable-next-line import/namespace
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  const when = nextReminder(now, endDates);
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'Check Warehouse Savings',
      body: 'Tap to read the latest Warehouse Savings. It takes about 30 seconds.',
      data: { screen: REMINDER_SCREEN },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
      channelId: CHANNEL_ID,
    },
  });
  return when;
}

/** True when a tapped notification is the Warehouse Savings reminder. */
export function isSavingsReminder(response: Notifications.NotificationResponse | null): boolean {
  return response?.notification.request.content.data?.screen === REMINDER_SCREEN;
}
