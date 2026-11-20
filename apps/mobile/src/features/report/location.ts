import * as Location from 'expo-location';
import type { GpsFix } from './draft';

export type LocationResult =
  | { kind: 'found'; fix: GpsFix }
  | { kind: 'permission_denied' }
  | { kind: 'services_off' }
  | { kind: 'failed' };

const TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** One GPS reading for the report. Never throws; slow or failed GPS falls back to a landmark. */
export async function getCurrentFix(): Promise<LocationResult> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { kind: 'permission_denied' };
    if (!(await Location.hasServicesEnabledAsync())) return { kind: 'services_off' };

    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      TIMEOUT_MS,
    );
    const last = position ?? (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }));
    if (!last) return { kind: 'failed' };
    return {
      kind: 'found',
      fix: {
        latitude: Number(last.coords.latitude.toFixed(6)),
        longitude: Number(last.coords.longitude.toFixed(6)),
        accuracyM: last.coords.accuracy === null ? null : Math.round(last.coords.accuracy),
      },
    };
  } catch {
    return { kind: 'failed' };
  }
}
