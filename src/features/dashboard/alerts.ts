import { PARAMETERS, PARAMETER_IDS } from '@/config/parameters';
import type { Repositories } from '@/database/repositories';
import { daysUntilExpiry, isExpired, isLowStock } from '@/database/repositories/ReagentRepository';
import type { BleSnapshot } from '@/services/bluetooth/BLEManager';
import { remainingSeconds } from '@/services/notifications/TimerService';

export type AlertTone = 'danger' | 'warning' | 'info';
export interface AppAlert {
  id: string;
  tone: AlertTone;
  title: string;
  message: string;
  route?: string;
}

export const EXPIRY_WARNING_DAYS = 30;

/** Screen 8 — in-app notification centre. Derived from local data only; nothing is fetched from a server. */
export async function computeAlerts(repos: Repositories, ble: BleSnapshot | null, now = new Date()): Promise<AppAlert[]> {
  const out: AppAlert[] = [];
  for (const r of await repos.reagents.list()) {
    const name = `${r.reagentName} (${PARAMETERS[r.parameter].shortLabel})`;
    if (isExpired(r, now)) {
      out.push({ id: `exp-${r.reagentId}`, tone: 'danger', title: 'Reagent expired', message: `${name} expired on ${r.expiryDate.slice(0, 10)} and is blocked from use.`, route: `/reagents/${r.reagentId}` });
    } else {
      const d = daysUntilExpiry(r, now);
      if (d <= EXPIRY_WARNING_DAYS) out.push({ id: `soon-${r.reagentId}`, tone: 'warning', title: 'Reagent expiring soon', message: `${name} expires in ${d} day${d === 1 ? '' : 's'}.`, route: `/reagents/${r.reagentId}` });
    }
    if (isLowStock(r)) out.push({ id: `low-${r.reagentId}`, tone: 'warning', title: 'Low reagent stock', message: `${name}: about ${r.testsRemaining} test${r.testsRemaining === 1 ? '' : 's'} left.`, route: `/reagents/${r.reagentId}` });
  }
  for (const { timer, remainingS } of (await repos.timers.list()).map((timer) => ({ timer, remainingS: remainingSeconds(timer, now.getTime()) }))) {
    out.push({
      id: `timer-${timer.timerId}`,
      tone: remainingS === 0 ? 'warning' : 'info',
      title: remainingS === 0 ? 'Reaction complete' : 'Reaction timer running',
      message: `${PARAMETERS[timer.parameter].shortLabel}: ${remainingS === 0 ? 'ready to measure' : `${Math.ceil(remainingS / 60)} min remaining`}.`,
      route: '/test/timer',
    });
  }
  for (const p of PARAMETER_IDS) {
    const active = await repos.calibrations.getActive(p);
    if (active && !active.sentToDeviceAt) {
      out.push({ id: `cal-${p}`, tone: 'info', title: 'Calibration not on analyser', message: `${PARAMETERS[p].shortLabel} v${active.calibrationVersion} has not been sent to the analyser yet.`, route: `/settings/calibration/${p}` });
    }
  }
  if (ble?.pendingMeasurement) {
    out.push({ id: 'pending-measure', tone: 'warning', title: 'Measurement awaiting result', message: 'A measurement was interrupted by a disconnect. Reconnect to retrieve the stored result.', route: '/device/status' });
  }
  if (ble?.lastSync?.invalid.length) {
    out.push({ id: 'sync-invalid', tone: 'warning', title: 'Unreadable device records', message: `${ble.lastSync.invalid.length} stored record(s) on the analyser could not be read and were skipped.`, route: '/device/status' });
  }
  const failing = Object.entries(ble?.deviceStatus?.self_test ?? {}).filter(([, v]) => v === 'fail');
  if (failing.length) out.push({ id: 'selftest', tone: 'danger', title: 'Analyser self-test failed', message: failing.map(([k]) => k).join(', '), route: '/device/diagnostics' });
  const order: Record<AlertTone, number> = { danger: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}
