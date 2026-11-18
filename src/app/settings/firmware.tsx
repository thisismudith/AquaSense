import Constants from 'expo-constants';

import { Banner } from '@/components/common/Banner';
import { Card } from '@/components/common/Card';
import { ListRow } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { BLE_PROTOCOL } from '@/config/ble';
import { useAsync } from '@/hooks/useAsync';
import { useBle } from '@/hooks/useBle';
import { useServices } from '@/store/appStore';
import { formatDateTime } from '@/utils/format';

/** Screen 37 — Firmware information. OTA update protocol is not specified (U4), so no update action is offered. */
export default function Firmware() {
  const { repos } = useServices();
  const { snap } = useBle();
  const devices = useAsync(() => repos.devices.list(), [repos]);
  const live = snap?.deviceStatus;
  return (
    <Screen title="Firmware" back testID="firmware">
      <Card>
        <ListRow title="Connected analyser" value={live ? live.name : 'Not connected'} />
        <ListRow title="Firmware (live)" value={live?.firmware ?? '—'} testID="fw-live" />
        <ListRow title="App version" value={Constants.expoConfig?.version ?? '—'} />
        <ListRow title="BLE protocol" value={`v${BLE_PROTOCOL.protocolVersion} (${BLE_PROTOCOL.status})`} />
      </Card>
      <Card>
        {devices.data?.map((d) => <ListRow key={d.deviceId} title={d.deviceName} subtitle={`${d.deviceId} · last connected ${formatDateTime(d.lastConnected)}`} value={d.firmwareVersion ?? '—'} />)}
      </Card>
      <Banner tone="info" title="Firmware updates" message="Over-the-air update is not available yet (the update protocol has not been specified). Update the analyser over USB-C using the tool provided by the hardware team." />
    </Screen>
  );
}
