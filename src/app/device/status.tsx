import { router } from 'expo-router';
import { useState } from 'react';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { ListRow } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { ConnectionPill } from '@/components/domain';
import { PARAMETERS, PARAMETER_IDS } from '@/config/parameters';
import { useAsync } from '@/hooks/useAsync';
import { bleErrorMessage, useBle } from '@/hooks/useBle';
import { useServices } from '@/store/appStore';
import { formatDateTime, formatNumber } from '@/utils/format';

/** Screen 7 — Device status details (sync, reconnect, calibrations on device). */
export default function DeviceStatus() {
  const { repos } = useServices();
  const { manager, snap } = useBle();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const status = snap?.deviceStatus;
  const device = useAsync(async () => (status ? repos.devices.getById(status.device_id) : (await repos.devices.list())[0] ?? null), [repos, status?.device_id, snap?.lastSync]);
  const meta = useAsync(async () => (device.data ? repos.devices.getSyncMetadata(device.data.deviceId) : null), [device.data]);
  const connected = snap?.state === 'connected';

  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label);
    setMsg(null);
    try {
      setMsg({ tone: 'success', text: await fn() });
    } catch (e) {
      setMsg({ tone: 'danger', text: bleErrorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen title="Analyser status" back testID="device-status">
      <ConnectionPill state={snap?.state ?? 'idle'} attempt={snap?.reconnectAttempt} />
      {msg ? <Banner tone={msg.tone} message={msg.text} testID="status-msg" /> : null}
      {snap?.lastError && !msg ? <Banner tone="warning" message={bleErrorMessage(snap.lastError)} /> : null}
      {snap?.pendingMeasurement ? (
        <Banner tone="warning" title="Measurement in progress on analyser" message="The phone lost connection during a measurement. The analyser keeps the result; it is retrieved automatically on reconnect." />
      ) : null}
      <Card>
        <ListRow icon="hardware-chip-outline" title="Name" value={device.data?.deviceName ?? '—'} />
        <ListRow icon="finger-print-outline" title="Device ID" value={device.data?.deviceId ?? '—'} />
        <ListRow icon="code-slash-outline" title="Firmware" value={device.data?.firmwareVersion ?? '—'} onPress={() => router.push('/settings/firmware')} />
        <ListRow icon="link-outline" title="Last connected" value={formatDateTime(device.data?.lastConnected)} />
        <ListRow icon="sync-outline" title="Last sync" value={formatDateTime(meta.data?.lastSyncTimestamp)} />
        <ListRow icon="bookmark-outline" title="Last synced test ID" value={meta.data?.lastSyncedDeviceResultId ?? '—'} />
        {status?.stored_results !== undefined ? <ListRow icon="albums-outline" title="Results stored on analyser" value={String(status.stored_results)} /> : null}
        {snap?.lastSync ? (
          <ListRow icon="checkmark-done-outline" title="Last sync result" subtitle={`${snap.lastSync.inserted} new · ${snap.lastSync.duplicates} already stored · ${snap.lastSync.invalid.length} unreadable`} />
        ) : null}
      </Card>

      {status ? (
        <>
          <AppText variant="h2">Calibrations on analyser</AppText>
          <Card>
            {PARAMETER_IDS.map((p) => {
              const c = status.calibrations[p];
              return <ListRow key={p} title={PARAMETERS[p].shortLabel} subtitle={c ? `v${c.version ?? '?'} · m=${formatNumber(c.slope)} · c=${formatNumber(c.intercept)}` : 'None stored'} onPress={() => router.push(`/settings/calibration/${p}`)} />;
            })}
          </Card>
        </>
      ) : null}

      {connected ? (
        <>
          <Button label="Sync stored results" icon="sync" loading={busy === 'sync'} onPress={() => void run('sync', async () => {
            const r = await manager!.syncNow();
            return `Sync complete: ${r.inserted} new, ${r.duplicates} duplicates skipped${r.invalid.length ? `, ${r.invalid.length} unreadable` : ''}.`;
          })} testID="status-sync" />
          <Button label="Diagnostics" variant="secondary" icon="pulse" onPress={() => router.push('/device/diagnostics')} />
          <Button label="Disconnect" variant="ghost" icon="close-circle-outline" loading={busy === 'disc'} onPress={() => void run('disc', async () => {
            await manager!.disconnect();
            return 'Disconnected.';
          })} testID="status-disconnect" />
        </>
      ) : (
        <Button label={snap?.connectedBleId ? 'Reconnect' : 'Pair analyser'} icon="bluetooth" onPress={() => router.push('/device/pair')} testID="status-pair" />
      )}
    </Screen>
  );
}
