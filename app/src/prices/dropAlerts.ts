import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

import type { ApiClient } from '../api/client';
import type { Flag } from '../api/types';
import { shortDate } from '../dates';
import { formatCents } from '../money';

/**
 * Price-drop alerts as local notifications on the phone. Every new flag is created while the
 * app is in use (price checks and Warehouse Savings run on the phone, ADR 0007 and 0008), so
 * the app itself can announce it; no push service or extra accounts are needed. The phone also
 * schedules a reminder before each claim deadline.
 */

export const DROP_SCREEN = 'ClaimCard';
const CHANNEL_ID = 'price-drops';
const NOTIFIED_KEY = 'notified_drops';
const REMINDER_PREFIX = 'claim-';
const REMINDER_HOUR = 10;
/** Days before the claim deadline for the last-chance reminder. */
const REMIND_DAYS_BEFORE = 2;

/** Where the ids of flags already announced are kept, so each drop is announced once. */
export interface NotifiedStore {
  get(): Promise<string[]>;
  set(ids: string[]): Promise<void>;
}

export const secureNotifiedStore: NotifiedStore = {
  async get() {
    try {
      const raw = await SecureStore.getItemAsync(NOTIFIED_KEY);
      const ids: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(ids) ? ids.filter((i): i is string => typeof i === 'string') : [];
    } catch {
      return [];
    }
  },
  set: (ids) => SecureStore.setItemAsync(NOTIFIED_KEY, JSON.stringify(ids)),
};

/** When to remind about a claim: 10 AM two days before the deadline, or null if that's past. */
export function claimReminderAt(deadline: string, now: Date): Date | null {
  const [y, m, d] = deadline.split('-').map(Number);
  const at = new Date(y, m - 1, d - REMIND_DAYS_BEFORE, REMINDER_HOUR);
  return at > now ? at : null;
}

function title(flag: Flag): string {
  return flag.description
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .slice(0, 60);
}

/**
 * Announces new price drops and keeps one claim reminder per open drop. Drops already seen in
 * the app (not unread) aren't announced. Returns false when notifications aren't allowed.
 */
export async function syncDropAlerts(
  flags: Flag[],
  store: NotifiedStore = secureNotifiedStore,
  now: Date = new Date(),
): Promise<boolean> {
  const open = flags.filter((f) => f.status === 'flagged');
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain && open.some((f) => f.unread)) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return false;

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Price drops',
    // The enum comes through a nested `export *` the lint rule can't follow.
    // eslint-disable-next-line import/namespace
    importance: Notifications.AndroidImportance.HIGH,
  });

  const notified = new Set(await store.get());
  for (const flag of open) {
    if (!flag.unread || notified.has(flag.id)) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Price drop',
        body: `${title(flag)}: get ${formatCents(flag.refund_due_cents)} back. Claim by ${shortDate(flag.claim_deadline)}.`,
        data: { screen: DROP_SCREEN, flagId: flag.id },
      },
      trigger: { channelId: CHANNEL_ID },
    });
    notified.add(flag.id);
  }

  const openIds = new Set(open.map((f) => f.id));
  for (const flag of open) {
    const at = claimReminderAt(flag.claim_deadline, now);
    if (!at) continue;
    // Scheduling with the same identifier replaces the earlier reminder.
    await Notifications.scheduleNotificationAsync({
      identifier: `${REMINDER_PREFIX}${flag.id}`,
      content: {
        title: 'Claim your price adjustment',
        body: `${title(flag)}: ${formatCents(flag.refund_due_cents)} back if you claim by ${shortDate(flag.claim_deadline)}.`,
        data: { screen: DROP_SCREEN, flagId: flag.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        channelId: CHANNEL_ID,
      },
    });
  }
  // Claimed, dismissed or expired drops need no reminder.
  for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
    const id = n.identifier;
    if (id.startsWith(REMINDER_PREFIX) && !openIds.has(id.slice(REMINDER_PREFIX.length))) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  }

  // Only open drops can be announced again, so that's all that needs remembering.
  await store.set([...notified].filter((id) => openIds.has(id)));
  return true;
}

let running: Promise<boolean> | null = null;

/** Loads the drops and syncs alerts. Overlapping calls share one run; errors are ignored. */
export function refreshDropAlerts(api: ApiClient): Promise<boolean> {
  running ??= api
    .flags()
    .then((flags) => syncDropAlerts(flags))
    .catch(() => false)
    .finally(() => {
      running = null;
    });
  return running;
}

/** On sign-out: no reminders about the account that signed out. */
export async function clearDropAlerts(store: NotifiedStore = secureNotifiedStore): Promise<void> {
  try {
    for (const n of await Notifications.getAllScheduledNotificationsAsync()) {
      if (n.identifier.startsWith(REMINDER_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
    await store.set([]);
  } catch {
    // Best effort.
  }
}

/** The claim card a tapped drop notification should open, if it is one. */
export function dropFlagId(
  response: Notifications.NotificationResponse | null | undefined,
): string | null {
  const data = response?.notification.request.content.data;
  return data?.screen === DROP_SCREEN && typeof data.flagId === 'string' ? data.flagId : null;
}
