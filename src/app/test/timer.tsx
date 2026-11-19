import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { ProgressRing } from '@/components/charts/ProgressRing';
import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Chip } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { TextField } from '@/components/forms/TextField';
import { PermissionNotice } from '@/components/domain';
import { PARAMETERS, type ParameterId } from '@/config/parameters';
import { FlowGuard } from '@/features/testing/FlowGuard';
import { durationOptions } from '@/features/testing/steps';
import { WizardProgress } from '@/features/testing/WizardHeader';
import { formatClock, remainingSeconds, type StartedTimer } from '@/services/notifications/TimerService';
import { useAppStore, useServices } from '@/store/appStore';
import { useTestFlow } from '@/store/testFlowStore';
import type { ActiveTimer } from '@/types/domain';

function TimerBody({ parameter, sampleId }: { parameter: ParameterId; sampleId: string }) {
  const { timers } = useServices();
  const prefs = useAppStore((s) => s.settings.notificationPreferences);
  const patch = useTestFlow((s) => s.patch);
  const opts = durationOptions(parameter);
  const [duration, setDuration] = useState<number | null>(PARAMETERS[parameter].reactionTime?.defaultS ?? null);
  const [manual, setManual] = useState('');
  const [active, setActive] = useState<ActiveTimer | null>(null);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState<StartedTimer['notification'] | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restart recovery: pick up a persisted timer for this parameter/sample.
  useEffect(() => {
    void timers.recover().then((list) => {
      const mine = list.find((x) => x.timer.parameter === parameter && x.timer.sampleId === sampleId);
      if (mine) setActive(mine.timer);
    });
  }, [timers, parameter, sampleId]);

  const tick = useCallback(() => setNow(Date.now()), []);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(tick, 500);
    const sub = AppState.addEventListener('change', tick);
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [active, tick]);

  const remaining = active ? remainingSeconds(active, now) : duration ?? 0;
  const done = !!active && remaining === 0;

  useEffect(() => {
    if (done) patch({ timerDone: true });
  }, [done, patch]);

  const start = async () => {
    setError(null);
    const d = PARAMETERS[parameter].reactionTime ? duration : Math.round(Number(manual) * 60);
    if (!d || !Number.isFinite(d) || d <= 0 || d > 3 * 3600) return setError('Enter a reaction time between 1 second and 3 hours.');
    try {
      const r = await timers.start({ parameter, sampleId, durationS: d, alerts: prefs.timerAlerts, vibrate: prefs.vibration });
      setActive(r.timer);
      setNotice(r.notification);
      setNoticeError(r.notificationError ?? null);
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const cancel = async () => {
    if (active) await timers.cancel(active);
    setActive(null);
    patch({ timerDone: false });
  };

  const next = async () => {
    if (active) await timers.complete(active);
    router.push('/test/measure');
  };

  const total = active?.durationS ?? duration ?? 1;
  return (
    <Screen
      title="Reaction timer"
      back
      footer={
        <>
          {!active ? <Button label="Start timer" icon="timer-outline" onPress={() => void start()} testID="timer-start" /> : null}
          {active && !done ? <Button label="Cancel timer" variant="ghost" onPress={() => void cancel()} testID="timer-cancel" /> : null}
          <Button label={done ? 'Measure now' : 'Skip to measurement'} variant={done ? 'primary' : 'secondary'} onPress={() => void next()} testID="timer-next" />
        </>
      }
    >
      <WizardProgress step="Timer" />
      {notice === 'denied' || notice === 'blocked' ? (
        <PermissionNotice kind="notifications" outcome={notice} onRequest={() => void start()} />
      ) : notice === 'scheduled' ? (
        <Banner tone="success" message="You will be notified when the reaction is complete, even if the screen is off." testID="timer-scheduled" />
      ) : notice === 'failed' ? (
        <Banner
          tone="warning"
          title="Alert not scheduled"
          message={`The phone did not accept the reaction alert (${noticeError ?? 'unknown error'}). The countdown still runs — keep this screen open.`}
          testID="timer-alert-failed"
        />
      ) : null}
      {error ? <Banner tone="danger" message={error} testID="timer-error" /> : null}
      <View style={styles.center}>
        <ProgressRing progress={active ? 1 - remaining / total : 0}>
          <AppText variant="monoLarge" testID="timer-clock">
            {formatClock(remaining)}
          </AppText>
          <AppText color="muted">{done ? 'Reaction complete' : active ? 'Reacting…' : 'Ready'}</AppText>
        </ProgressRing>
      </View>
      {!active && opts.length ? (
        <View style={styles.chips}>
          {opts.map((s) => (
            <Chip key={s} label={formatClock(s)} selected={duration === s} onPress={() => setDuration(s)} testID={`dur-${s}`} />
          ))}
        </View>
      ) : null}
      {!active && !opts.length ? (
        <>
          <Banner tone="warning" message="Reaction time for this method is pending lab confirmation. Enter the time from your validated procedure." />
          <TextField label="Reaction time (minutes)" keyboardType="decimal-pad" value={manual} onChangeText={setManual} testID="timer-manual" />
        </>
      ) : null}
      {PARAMETERS[parameter].reactionTime ? (
        <AppText variant="caption" color="muted" align="center">
          Working window {PARAMETERS[parameter].reactionTime!.minS / 60}–{PARAMETERS[parameter].reactionTime!.maxS / 60} min (configurable until lab-confirmed).
        </AppText>
      ) : null}
    </Screen>
  );
}

/** Screen 15 — Reaction timer (A10: OS-scheduled notification, wall-clock based, restart recovery). */
export default function TimerStep() {
  return <FlowGuard>{(ctx) => <TimerBody {...ctx} />}</FlowGuard>;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
});
