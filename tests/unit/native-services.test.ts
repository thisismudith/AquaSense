/** UNIT with mocked Expo native modules. Notification delivery, GPS and camera on a real phone are NOT verified here. */
jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

import { pickFromGallery, takePhoto } from '@/services/camera/photoPicker';
import { captureLocation, formatCoordinates } from '@/services/location/LocationService';
import { formatClock, NOTIFICATION_STEP_TIMEOUT_MS, remainingSeconds, TimerService } from '@/services/notifications/TimerService';

import { createTestRepos } from '../helpers/db';

const granted = { granted: true, canAskAgain: true, status: 'granted' };
const denied = { granted: false, canAskAgain: true, status: 'denied' };
const blocked = { granted: false, canAskAgain: false, status: 'denied' };

describe('photoPicker (UNIT)', () => {
  it('camera: permission blocked → no launch', async () => {
    (ImagePicker.getCameraPermissionsAsync as jest.Mock).mockResolvedValue(blocked);
    expect(await takePhoto()).toEqual({
      kind: 'permission',
      outcome: 'blocked',
    });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });
  it('camera: picked / cancelled / error', async () => {
    (ImagePicker.getCameraPermissionsAsync as jest.Mock).mockResolvedValue(granted);
    (ImagePicker.launchCameraAsync as jest.Mock)
      .mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///c.jpg' }],
      })
      .mockResolvedValueOnce({ canceled: true, assets: null })
      .mockRejectedValueOnce(new Error('camera busy'));
    expect(await takePhoto()).toEqual({ kind: 'picked', uri: 'file:///c.jpg' });
    expect(await takePhoto()).toEqual({ kind: 'cancelled' });
    expect(await takePhoto()).toEqual({
      kind: 'error',
      message: 'camera busy',
    });
  });
  it('gallery uses the photo picker without asking for storage permission', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'content://p/1' }],
    });
    expect(await pickFromGallery()).toEqual({
      kind: 'picked',
      uri: 'content://p/1',
    });
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['images'], selectionLimit: 1 }));
  });
});

describe('LocationService (UNIT)', () => {
  beforeEach(() => jest.clearAllMocks());
  it('denied / services disabled / success / timeout / failure', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue(denied);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce(denied);
    expect(await captureLocation()).toEqual({ ok: false, reason: 'denied' });

    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue(granted);
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValueOnce(false);
    expect(await captureLocation()).toEqual({
      ok: false,
      reason: 'services_disabled',
    });

    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValue(true);
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({
      coords: { latitude: 12.5, longitude: -77.25, accuracy: 6 },
      timestamp: 1763546400000,
    });
    expect(await captureLocation()).toEqual({
      ok: true,
      location: {
        latitude: 12.5,
        longitude: -77.25,
        accuracy: 6,
        timestamp: new Date(1763546400000).toISOString(),
      },
    });

    (Location.getCurrentPositionAsync as jest.Mock).mockReturnValueOnce(new Promise(() => undefined));
    expect(await captureLocation(20)).toEqual({ ok: false, reason: 'timeout' });

    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValueOnce(new Error('no fix'));
    expect(await captureLocation()).toMatchObject({
      ok: false,
      reason: 'unavailable',
      message: 'no fix',
    });
  });
  it('formats coordinates without a map', () => {
    expect(formatCoordinates({ latitude: 12.5, longitude: -77.25 })).toBe('12.50000° N, 77.25000° W');
  });
});

describe('TimerService (UNIT)', () => {
  const api = () => ({
    setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-1'),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  });

  it('remaining time is wall-clock based', () => {
    const t = { startedAt: '2026-11-19T10:00:00.000Z', durationS: 300 };
    expect(remainingSeconds(t, Date.parse('2026-11-19T10:00:00.000Z'))).toBe(300);
    expect(remainingSeconds(t, Date.parse('2026-11-19T10:04:59.500Z'))).toBe(1);
    expect(remainingSeconds(t, Date.parse('2026-11-19T11:00:00.000Z'))).toBe(0);
    expect(formatClock(605)).toBe('10:05');
    expect(formatClock(-3)).toBe('00:00');
  });

  it('schedules an OS notification at the end time and persists for restart recovery', async () => {
    const repos = await createTestRepos();
    const a = api();
    const svc = new TimerService(repos.timers, a as never, async () => 'granted');
    const now = Date.parse('2026-11-19T10:00:00.000Z');
    const { timer, notification } = await svc.start({
      parameter: 'cr6',
      sampleId: null,
      durationS: 300,
      alerts: true,
      vibrate: true,
      now,
    });
    expect(notification).toBe('scheduled');
    expect(a.setNotificationChannelAsync).toHaveBeenCalledWith('reaction-timer', expect.objectContaining({ enableVibrate: true }));
    expect(a.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: {
          type: 'date',
          date: new Date(now + 300_000),
          channelId: 'reaction-timer',
        },
      }),
    );
    // "Restart": a new service instance over the same DB
    const recovered = await new TimerService(repos.timers, a as never, async () => 'granted').recover(now + 120_000);
    expect(recovered).toEqual([{ timer: { ...timer, notificationId: 'notif-1' }, remainingS: 180 }]);
    await svc.cancel(recovered[0]!.timer);
    expect(a.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
    expect(await svc.recover()).toEqual([]);
    await repos.db.close();
  });

  it('notification permission denied → timer still runs, user informed', async () => {
    const repos = await createTestRepos();
    const a = api();
    const r = await new TimerService(repos.timers, a as never, async () => 'blocked').start({
      parameter: 'nitrite',
      sampleId: null,
      durationS: 60,
      alerts: true,
      vibrate: false,
    });
    expect(r.notification).toBe('blocked');
    expect(a.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(await repos.timers.list()).toHaveLength(1);
    await repos.db.close();
  });

  it('a native scheduling call that never settles does not block the timer', async () => {
    jest.useFakeTimers({
      doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
    });
    try {
      const repos = await createTestRepos();
      const a = api();
      a.scheduleNotificationAsync.mockReturnValue(new Promise(() => undefined));
      const p = new TimerService(repos.timers, a as never, async () => 'granted').start({
        parameter: 'cr6',
        sampleId: null,
        durationS: 300,
        alerts: true,
        vibrate: false,
      });
      await jest.advanceTimersByTimeAsync(NOTIFICATION_STEP_TIMEOUT_MS + 1);
      const r = await p;
      expect(r.notification).toBe('failed');
      expect(r.notificationError).toBe('Scheduling the alert did not respond');
      expect(r.timer.notificationId).toBeNull();
      expect(await repos.timers.list()).toHaveLength(1);
      await repos.db.close();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a native scheduling error is reported, timer still runs', async () => {
    const repos = await createTestRepos();
    const a = api();
    a.scheduleNotificationAsync.mockRejectedValue(new Error('org.json.JSONObject'));
    const r = await new TimerService(repos.timers, a as never, async () => 'granted').start({
      parameter: 'cr6',
      sampleId: null,
      durationS: 300,
      alerts: true,
      vibrate: false,
    });
    expect(r).toMatchObject({
      notification: 'failed',
      notificationError: 'org.json.JSONObject',
    });
    expect(await repos.timers.list()).toHaveLength(1);
    await repos.db.close();
  });

  it('rejects invalid durations', async () => {
    const repos = await createTestRepos();
    const svc = new TimerService(repos.timers, api() as never, async () => 'granted');
    await expect(
      svc.start({
        parameter: 'cr6',
        sampleId: null,
        durationS: 0,
        alerts: false,
        vibrate: false,
      }),
    ).rejects.toThrow(RangeError);
    await expect(
      svc.start({
        parameter: 'cr6',
        sampleId: null,
        durationS: 1.5,
        alerts: false,
        vibrate: false,
      }),
    ).rejects.toThrow(RangeError);
    await repos.db.close();
  });
});

describe('numeric text fields (UNIT)', () => {
  const { sanitizeNumber } = jest.requireActual<typeof import('@/components/forms/TextField')>('@/components/forms/TextField');
  it.each([
    ['1x2', {}, '12'],
    ['abc', {}, ''],
    ['1,5', {}, '1.5'],
    ['1.2.3', {}, '1.23'],
    ['-0.05', {}, '0.05'],
    ['-0.05', { negative: true }, '-0.05'],
    ['5-', { negative: true }, '5'],
    ['12.5', { integer: true }, '125'],
  ])('%s %o → %s', (input, opts, out) => {
    expect(sanitizeNumber(input, opts)).toBe(out);
  });
});
