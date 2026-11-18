import { translate, type TranslationKey } from '@/i18n';
import type { BLEManager, BleSnapshot } from '@/services/bluetooth/BLEManager';
import { BleError } from '@/services/bluetooth/BLETypes';
import { useAppStore } from '@/store/appStore';

export function useBle(): { manager: BLEManager | null; snap: BleSnapshot | null; available: boolean; mock: boolean } {
  const services = useAppStore((s) => s.services);
  const snap = useAppStore((s) => s.ble);
  return { manager: services?.ble ?? null, snap, available: !!services?.ble, mock: services?.transportKind === 'mock' };
}

export function bleErrorMessage(e: unknown): string {
  if (e instanceof BleError) {
    const key = `ble.err.${e.code}` as TranslationKey;
    return translate(key, { msg: e.message });
  }
  return e instanceof Error ? e.message : String(e);
}
