/** UNIT with mocked native permission modules. Device behaviour on Android 11–15 is NOT verified here. */
jest.mock('expo-image-picker', () => ({ getCameraPermissionsAsync: jest.fn(), requestCameraPermissionsAsync: jest.fn() }));
jest.mock('expo-location', () => ({ getForegroundPermissionsAsync: jest.fn(), requestForegroundPermissionsAsync: jest.fn() }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn() }));

import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { bluetoothPermissionsFor, combineResults, fromExpo, requestBluetooth, requestCamera, requestLocation } from '@/services/permissions/permissions';

const RESULTS = { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' } as const;
const PERMISSIONS = {
  BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
  BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
  ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
};
function fakePA(state: Record<string, string>) {
  return {
    RESULTS,
    PERMISSIONS,
    check: jest.fn(async (p: string) => state[p] === 'granted'),
    requestMultiple: jest.fn(async (ps: string[]) => Object.fromEntries(ps.map((p) => [p, state[`next:${p}`] ?? 'denied']))),
  } as never;
}

beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { get: () => 'android' });
});

describe('Bluetooth permissions by API level (UNIT)', () => {
  it.each([
    [30, ['android.permission.ACCESS_FINE_LOCATION']],
    [31, ['android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_CONNECT']],
    [34, ['android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_CONNECT']],
  ])('API %i → %o', (api, perms) => {
    expect(bluetoothPermissionsFor(api, fakePA({}))).toEqual(perms);
  });

  it('already granted → no prompt', async () => {
    const pa = fakePA({ [PERMISSIONS.BLUETOOTH_SCAN]: 'granted', [PERMISSIONS.BLUETOOTH_CONNECT]: 'granted' }) as { requestMultiple: jest.Mock };
    expect(await requestBluetooth(33, pa as never)).toBe('granted');
    expect(pa.requestMultiple).not.toHaveBeenCalled();
  });

  it('first request granted / denied / permanently denied', async () => {
    expect(await requestBluetooth(33, fakePA({ [`next:${PERMISSIONS.BLUETOOTH_SCAN}`]: 'granted', [`next:${PERMISSIONS.BLUETOOTH_CONNECT}`]: 'granted' }))).toBe('granted');
    expect(await requestBluetooth(33, fakePA({ [`next:${PERMISSIONS.BLUETOOTH_SCAN}`]: 'granted' }))).toBe('denied');
    expect(await requestBluetooth(30, fakePA({ [`next:${PERMISSIONS.ACCESS_FINE_LOCATION}`]: 'never_ask_again' }))).toBe('blocked');
  });

  it('combineResults precedence', () => {
    expect(combineResults(['granted', 'never_ask_again', 'denied'], fakePA({}))).toBe('blocked');
    expect(combineResults([], fakePA({}))).toBe('granted');
  });
});

describe('Expo permissions (UNIT)', () => {
  const r = (granted: boolean, canAskAgain: boolean) => ({ granted, canAskAgain, status: granted ? 'granted' : 'denied', expires: 'never' as const });

  it('fromExpo mapping', () => {
    expect(fromExpo(r(true, true))).toBe('granted');
    expect(fromExpo(r(false, true))).toBe('denied');
    expect(fromExpo(r(false, false))).toBe('blocked');
  });

  it('camera: does not prompt again after permanent denial', async () => {
    (ImagePicker.getCameraPermissionsAsync as jest.Mock).mockResolvedValue(r(false, false));
    expect(await requestCamera()).toBe('blocked');
    expect(ImagePicker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  });

  it('location: prompts when allowed, maps result; revoked later → asks again', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue(r(false, true));
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce(r(true, true)).mockResolvedValueOnce(r(false, true));
    expect(await requestLocation()).toBe('granted');
    expect(await requestLocation()).toBe('denied');
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
  });
});
