import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Linking, PermissionsAndroid, Platform, type Permission } from 'react-native';

/**
 * Contextual runtime permissions (master prompt §8). Each is requested only when its feature is used:
 * Bluetooth when pairing, camera when taking a photo, location when geotagging, notifications when
 * enabling timer alerts. Nothing is requested at onboarding. Background location is never requested.
 */
export type PermissionOutcome = 'granted' | 'denied' | 'blocked';
export type PermissionKind = 'bluetooth' | 'camera' | 'location' | 'notifications';

type PA = Pick<typeof PermissionsAndroid, 'check' | 'requestMultiple' | 'RESULTS' | 'PERMISSIONS'>;

/** Android permissions needed for BLE on this API level. */
export function bluetoothPermissionsFor(apiLevel: number, pa: PA = PermissionsAndroid): Permission[] {
  if (apiLevel >= 31) return [pa.PERMISSIONS.BLUETOOTH_SCAN, pa.PERMISSIONS.BLUETOOTH_CONNECT];
  // Android 6–11: BLE scan results require location permission (fine on 10+).
  return [pa.PERMISSIONS.ACCESS_FINE_LOCATION];
}

export function combineResults(results: string[], pa: PA = PermissionsAndroid): PermissionOutcome {
  if (results.every((r) => r === pa.RESULTS.GRANTED)) return 'granted';
  if (results.some((r) => r === pa.RESULTS.NEVER_ASK_AGAIN)) return 'blocked';
  return 'denied';
}

export async function checkBluetooth(apiLevel = Number(Platform.Version), pa: PA = PermissionsAndroid): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const perms = bluetoothPermissionsFor(apiLevel, pa);
  const checks = await Promise.all(perms.map((p) => pa.check(p)));
  return checks.every(Boolean);
}

export async function requestBluetooth(apiLevel = Number(Platform.Version), pa: PA = PermissionsAndroid): Promise<PermissionOutcome> {
  if (Platform.OS !== 'android') return 'granted';
  if (await checkBluetooth(apiLevel, pa)) return 'granted';
  const perms = bluetoothPermissionsFor(apiLevel, pa);
  const res = await pa.requestMultiple(perms);
  return combineResults(perms.map((p) => res[p] ?? pa.RESULTS.DENIED), pa);
}

/** Maps Expo's permission response (status + canAskAgain) to our outcome. */
export function fromExpo(r: { status: string; canAskAgain: boolean; granted: boolean }): PermissionOutcome {
  if (r.granted || r.status === 'granted') return 'granted';
  return r.canAskAgain ? 'denied' : 'blocked';
}

async function checkThenRequest(
  get: () => Promise<{ status: string; canAskAgain: boolean; granted: boolean }>,
  request: () => Promise<{ status: string; canAskAgain: boolean; granted: boolean }>,
): Promise<PermissionOutcome> {
  const current = await get();
  if (current.granted) return 'granted';
  // Do not re-prompt once the system says we cannot ask again; caller offers Settings instead.
  if (!current.canAskAgain) return 'blocked';
  return fromExpo(await request());
}

export const requestCamera = () => checkThenRequest(ImagePicker.getCameraPermissionsAsync, ImagePicker.requestCameraPermissionsAsync);
export const requestLocation = () => checkThenRequest(Location.getForegroundPermissionsAsync, Location.requestForegroundPermissionsAsync);
export const requestNotifications = () => checkThenRequest(Notifications.getPermissionsAsync, Notifications.requestPermissionsAsync);

export async function checkPermission(kind: PermissionKind): Promise<PermissionOutcome> {
  switch (kind) {
    case 'bluetooth':
      return (await checkBluetooth()) ? 'granted' : 'denied';
    case 'camera':
      return fromExpo(await ImagePicker.getCameraPermissionsAsync());
    case 'location':
      return fromExpo(await Location.getForegroundPermissionsAsync());
    case 'notifications':
      return fromExpo(await Notifications.getPermissionsAsync());
  }
}

export function requestPermission(kind: PermissionKind): Promise<PermissionOutcome> {
  switch (kind) {
    case 'bluetooth':
      return requestBluetooth();
    case 'camera':
      return requestCamera();
    case 'location':
      return requestLocation();
    case 'notifications':
      return requestNotifications();
  }
}

/** Opens this app's page in Android Settings (path out of permanent denial). */
export function openAppSettings(): Promise<void> {
  return Linking.openSettings();
}
