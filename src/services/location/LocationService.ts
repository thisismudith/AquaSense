import * as Location from 'expo-location';

import type { GeoLocation } from '@/types/domain';

import { requestLocation } from '../permissions/permissions';

export type LocationOutcome =
  | { ok: true; location: GeoLocation }
  | { ok: false; reason: 'denied' | 'blocked' | 'services_disabled' | 'timeout' | 'unavailable'; message?: string };

/**
 * A5 geotag: one foreground fix when the user asks for it. No background location, no map, no network service.
 */
export async function captureLocation(timeoutMs = 20_000): Promise<LocationOutcome> {
  const perm = await requestLocation();
  if (perm !== 'granted') return { ok: false, reason: perm };
  if (!(await Location.hasServicesEnabledAsync())) return { ok: false, reason: 'services_disabled' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<'timeout'>((r) => (timer = setTimeout(() => r('timeout'), timeoutMs))),
    ]);
    if (fix === 'timeout') return { ok: false, reason: 'timeout' };
    return { ok: true, location: toGeoLocation(fix) };
  } catch (e) {
    return { ok: false, reason: 'unavailable', message: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export function toGeoLocation(fix: Pick<Location.LocationObject, 'coords' | 'timestamp'>): GeoLocation {
  return {
    latitude: fix.coords.latitude,
    longitude: fix.coords.longitude,
    accuracy: fix.coords.accuracy ?? null,
    timestamp: new Date(fix.timestamp).toISOString(),
  };
}

export function formatCoordinates(l: Pick<GeoLocation, 'latitude' | 'longitude'>): string {
  const ns = l.latitude >= 0 ? 'N' : 'S';
  const ew = l.longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(l.latitude).toFixed(5)}° ${ns}, ${Math.abs(l.longitude).toFixed(5)}° ${ew}`;
}
