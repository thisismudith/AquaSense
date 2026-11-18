import { ActiveTimerSchema, type ActiveTimer } from '@/types/domain';

import type { Database } from '../types';

interface TimerRow {
  timer_id: string;
  parameter: string;
  sample_id: string | null;
  started_at: string;
  duration_s: number;
  notification_id: string | null;
}

const fromRow = (r: TimerRow): ActiveTimer =>
  ActiveTimerSchema.parse({
    timerId: r.timer_id,
    parameter: r.parameter,
    sampleId: r.sample_id,
    startedAt: r.started_at,
    durationS: r.duration_s,
    notificationId: r.notification_id,
  });

/** Persists running reaction timers so they survive app restarts (A10). */
export class TimerRepository {
  constructor(private readonly db: Database) {}

  async save(t: ActiveTimer): Promise<void> {
    const v = ActiveTimerSchema.parse(t);
    await this.db.run(
      `INSERT INTO active_timers (timer_id, parameter, sample_id, started_at, duration_s, notification_id) VALUES (?,?,?,?,?,?)
       ON CONFLICT(timer_id) DO UPDATE SET notification_id=excluded.notification_id`,
      [v.timerId, v.parameter, v.sampleId, v.startedAt, v.durationS, v.notificationId],
    );
  }

  async list(): Promise<ActiveTimer[]> {
    return (await this.db.all<TimerRow>('SELECT * FROM active_timers ORDER BY started_at')).map(fromRow);
  }

  async remove(id: string): Promise<void> {
    await this.db.run('DELETE FROM active_timers WHERE timer_id=?', [id]);
  }
}
