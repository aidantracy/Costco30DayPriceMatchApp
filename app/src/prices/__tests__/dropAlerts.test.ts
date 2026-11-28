import * as Notifications from 'expo-notifications';

import type { Flag } from '../../api/types';
import {
  claimReminderAt,
  clearDropAlerts,
  dropFlagId,
  syncDropAlerts,
  type NotifiedStore,
} from '../dropAlerts';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
jest.mock('expo-secure-store', () => ({}));

const N = Notifications as jest.Mocked<typeof Notifications>;
const now = new Date(2026, 10, 27, 9, 0);

function flag(over: Partial<Flag> = {}): Flag {
  return {
    id: 'f1',
    status: 'flagged',
    unread: true,
    item_number: '1111111',
    description: 'KS EXAMPLE COFFEE 2/40 OZ',
    refund_due_cents: 500,
    claim_deadline: '2026-12-10',
    ...over,
  };
}

function memoryStore(initial: string[] = []): NotifiedStore & { ids: string[] } {
  const store = {
    ids: initial,
    get: async () => store.ids,
    set: async (ids: string[]) => {
      store.ids = ids;
    },
  };
  return store;
}

const scheduled = () => N.scheduleNotificationAsync.mock.calls.map((c) => c[0]);

beforeEach(() => {
  jest.clearAllMocks();
  N.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
  N.getAllScheduledNotificationsAsync.mockResolvedValue([]);
});

test('claim reminders are 2 days before the deadline at 10 AM, unless that has passed', () => {
  expect(claimReminderAt('2026-12-10', now)).toEqual(new Date(2026, 11, 8, 10));
  expect(claimReminderAt('2026-11-28', now)).toBeNull();
});

test('announces a new drop once and schedules its claim reminder', async () => {
  const store = memoryStore();
  expect(await syncDropAlerts([flag()], store, now)).toBe(true);
  const [announce, reminder] = scheduled();
  expect(announce.content).toMatchObject({
    title: 'Price drop',
    body: 'Ks Example Coffee 2/40 Oz: get $5.00 back. Claim by Dec 10.',
    data: { screen: 'ClaimCard', flagId: 'f1' },
  });
  expect(announce.trigger).toEqual({ channelId: 'price-drops' });
  expect(reminder.identifier).toBe('claim-f1');
  expect(reminder.trigger).toMatchObject({ type: 'date', date: new Date(2026, 11, 8, 10) });
  expect(store.ids).toEqual(['f1']);

  N.scheduleNotificationAsync.mockClear();
  await syncDropAlerts([flag()], store, now);
  // Only the reminder is rescheduled; the drop isn't announced again.
  expect(scheduled().map((r) => r.identifier)).toEqual(['claim-f1']);
});

test("doesn't announce drops already seen in the app", async () => {
  await syncDropAlerts([flag({ unread: false })], memoryStore(), now);
  expect(scheduled().map((r) => r.identifier)).toEqual(['claim-f1']);
});

test('cancels reminders for drops that were claimed or dismissed', async () => {
  N.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: 'claim-f1' },
    { identifier: 'claim-old' },
    { identifier: 'warehouse-savings-reminder' },
  ] as never);
  const store = memoryStore(['f1', 'old']);
  await syncDropAlerts([flag({ status: 'claimed' }), flag({ id: 'f2' })], store, now);
  const cancelled = N.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0]);
  expect(cancelled).toEqual(['claim-f1', 'claim-old']);
  expect(store.ids).toEqual(['f2']);
});

test('asks for permission only when there is a new drop, and stops if refused', async () => {
  N.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
  N.requestPermissionsAsync.mockResolvedValue({ granted: false } as never);
  expect(await syncDropAlerts([flag({ unread: false })], memoryStore(), now)).toBe(false);
  expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(await syncDropAlerts([flag()], memoryStore(), now)).toBe(false);
  expect(N.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('sign-out clears claim reminders and what was announced', async () => {
  N.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: 'claim-f1' },
    { identifier: 'warehouse-savings-reminder' },
  ] as never);
  const store = memoryStore(['f1']);
  await clearDropAlerts(store);
  expect(N.cancelScheduledNotificationAsync.mock.calls.map((c) => c[0])).toEqual(['claim-f1']);
  expect(store.ids).toEqual([]);
});

test('finds the claim card a tapped drop notification opens', () => {
  const tap = (data: Record<string, unknown>) =>
    ({
      notification: { request: { content: { data } } },
    }) as unknown as Notifications.NotificationResponse;
  expect(dropFlagId(tap({ screen: 'ClaimCard', flagId: 'f1' }))).toBe('f1');
  expect(dropFlagId(tap({ screen: 'ReadSavings' }))).toBeNull();
  expect(dropFlagId(undefined)).toBeNull();
});
