import * as Notifications from 'expo-notifications';

import { PARAMETERS, type ParameterId } from '@/config/parameters';
import type { TimerRepository } from '@/database/repositories/TimerRepository';
import type { ActiveTimer } from '@/types/domain';
import { createId } from '@/utils/id';

import { requestNotifications, type PermissionOutcome } from '../permissions/permissions';

export const TIMER_CHANNEL_ID = 'reaction-timer';

/** Remaining whole seconds (≥ 0) computed from wall-clock time — survives JS pauses, screen-off and restarts. */
export function remainingSeconds(t: Pick<ActiveTimer, 'startedAt' | 'durationS'>, now = Date.now()): number {
  const end = Date.parse(t.startedAt) + t.durationS * 1000;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export interface NotificationsApi {
  setNotificationChannelAsync: typeof Notifications.setNotificationChannelAsync;
  scheduleNotificationAsync: typeof Notifications.scheduleNotificationAsync;
  cancelScheduledNotificationAsync: typeof Notifications.cancelScheduledNotificationAsync;
}

export interface StartedTimer {
  timer: ActiveTimer;
  /** 'failed' = the OS alert could not be scheduled; the countdown still runs in the app. */
  notification: 'scheduled' | 'disabled' | 'failed' | PermissionOutcome;
  notificationError?: string;
}

/** Native notification calls have been observed never to settle on some devices; never let that block the timer. */
export const NOTIFICATION_STEP_TIMEOUT_MS = 8000;
export const NOTIFICATION_PERMISSION_TIMEOUT_MS = 120000; // the user may be reading the system dialog

function withTimeout<T>(p: Promise<T>, ms: number, step: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${step} did not respond`)), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * A10 reaction timer. The end time is persisted (restart recovery) and a local notification is scheduled
 * with the OS, so the alert fires with the screen off or the app killed — not a JS-only timer.
 */
export class TimerService {
  constructor(
    private readonly repo: TimerRepository,
    private readonly api: NotificationsApi = Notifications,
    private readonly requestPermission: () => Promise<PermissionOutcome> = requestNotifications,
  ) {}

  async ensureChannel(vibrate: boolean): Promise<void> {
    await this.api.setNotificationChannelAsync(TIMER_CHANNEL_ID, {
      name: 'Reaction timer',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: vibrate ? [0, 400, 200, 400] : null,
      enableVibrate: vibrate,
      sound: 'default',
    });
  }

  async start(opts: {
    parameter: ParameterId;
    sampleId: string | null;
    durationS: number;
    alerts: boolean;
    vibrate: boolean;
    now?: number;
  }): Promise<StartedTimer> {
    if (!Number.isInteger(opts.durationS) || opts.durationS <= 0) throw new RangeError('Timer duration must be a positive whole number of seconds');
    const startedAtMs = opts.now ?? Date.now();
    const timer: ActiveTimer = {
      timerId: createId(),
      parameter: opts.parameter,
      sampleId: opts.sampleId,
      startedAt: new Date(startedAtMs).toISOString(),
      durationS: opts.durationS,
      notificationId: null,
    };
    let notification: StartedTimer['notification'] = 'disabled';
    let notificationError: string | undefined;
    if (opts.alerts) {
      try {
        const perm = await withTimeout(this.requestPermission(), NOTIFICATION_PERMISSION_TIMEOUT_MS, 'Notification permission');
        if (perm === 'granted') {
          await withTimeout(this.ensureChannel(opts.vibrate), NOTIFICATION_STEP_TIMEOUT_MS, 'Notification channel setup');
          timer.notificationId = await withTimeout(
            this.api.scheduleNotificationAsync({
              content: {
                title: 'Reaction complete',
                body: `${PARAMETERS[opts.parameter].shortLabel}: the sample is ready to measure.`,
                data: { timerId: timer.timerId, parameter: opts.parameter, sampleId: opts.sampleId },
              },
              trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(startedAtMs + opts.durationS * 1000), channelId: TIMER_CHANNEL_ID },
            }),
            NOTIFICATION_STEP_TIMEOUT_MS,
            'Scheduling the alert',
          );
          notification = 'scheduled';
        } else notification = perm;
      } catch (e) {
        notification = 'failed';
        notificationError = e instanceof Error ? e.message : String(e);
      }
    }
    await this.repo.save(timer);
    return notificationError ? { timer, notification, notificationError } : { timer, notification };
  }

  async cancel(timer: ActiveTimer): Promise<void> {
    if (timer.notificationId) await this.api.cancelScheduledNotificationAsync(timer.notificationId);
    await this.repo.remove(timer.timerId);
  }

  /** Completes a timer (keeps the delivered notification; removes persisted state). */
  async complete(timer: ActiveTimer): Promise<void> {
    await this.repo.remove(timer.timerId);
  }

  /** Restart recovery: returns persisted timers with remaining time computed from the wall clock. */
  async recover(now = Date.now()): Promise<{ timer: ActiveTimer; remainingS: number }[]> {
    return (await this.repo.list()).map((timer) => ({ timer, remainingS: remainingSeconds(timer, now) }));
  }
}
