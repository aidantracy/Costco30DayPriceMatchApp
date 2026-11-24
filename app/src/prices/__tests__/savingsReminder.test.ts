import * as Notifications from 'expo-notifications';

import {
  isSavingsReminder,
  nextReminder,
  REMINDER_ID,
  scheduleSavingsReminder,
} from '../savingsReminder';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const N = Notifications as jest.Mocked<typeof Notifications>;
const now = new Date(2026, 10, 23, 21, 47); // Nov 23, 9:47 PM

describe('nextReminder', () => {
  it('is a week later at 10 AM when the offers run longer', () => {
    expect(nextReminder(now, ['2026-12-20', '2026-12-20', '2026-12-31'])).toEqual(
      new Date(2026, 10, 30, 10),
    );
    expect(nextReminder(now, [])).toEqual(new Date(2026, 10, 30, 10));
  });

  it('is the day after about half the offers end, when that is sooner', () => {
    const ends = ['2026-12-20', '2026-11-26', '2026-11-27', '2026-11-27', '2026-11-29'];
    expect(nextReminder(now, ends)).toEqual(new Date(2026, 10, 28, 10));
  });

  it('is never sooner than tomorrow', () => {
    expect(nextReminder(now, ['2026-11-23'])).toEqual(new Date(2026, 10, 24, 10));
  });
});

describe('scheduleSavingsReminder', () => {
  beforeEach(() => jest.clearAllMocks());

  it('replaces the reminder and opens the reader when tapped', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    const when = await scheduleSavingsReminder(['2026-12-20'], now);
    expect(when).toEqual(new Date(2026, 10, 30, 10));
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith(REMINDER_ID);
    const request = N.scheduleNotificationAsync.mock.calls[0][0];
    expect(request.identifier).toBe(REMINDER_ID);
    expect(request.trigger).toMatchObject({ type: 'date', date: when, channelId: 'reminders' });
    const response = { notification: { request } } as unknown as Notifications.NotificationResponse;
    expect(isSavingsReminder(response)).toBe(true);
  });

  it('asks for permission once and gives up quietly when refused', async () => {
    N.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    N.requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    expect(await scheduleSavingsReminder([], now)).toBeNull();
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();

    N.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    N.requestPermissionsAsync.mockClear();
    expect(await scheduleSavingsReminder([], now)).toBeNull();
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('ignores other notifications', () => {
    expect(isSavingsReminder(null)).toBe(false);
    const other = {
      notification: { request: { content: { data: { screen: 'ClaimCard' } } } },
    } as unknown as Notifications.NotificationResponse;
    expect(isSavingsReminder(other)).toBe(false);
  });
});
