import type { ZoneShrink } from '@manhunt/types';

export type GeoError = 'denied' | 'unavailable' | 'unsupported';

export interface GeoFix {
  latitude: number;
  longitude: number;
  /** Accuracy radius in meters */
  accuracy: number;
}

/** A coarse (cell / Wi-Fi) fix must not replace a precise GPS fix younger than this. */
const KEEP_PRECISE_FIX_MS = 20_000;
const COARSE_ACCURACY_M = 100;

interface GeoCallbacks {
  onPosition: (pos: GeoFix) => void;
  onError: (err: GeoError | null) => void;
}

const RESTART_DELAY_MS = 3_000;

/**
 * Resilient GPS watcher. iOS Safari often fails the first high-accuracy fix
 * (POSITION_UNAVAILABLE / TIMEOUT) and may silently stop the watch afterwards,
 * so we fall back to a coarse fix and restart the watch on transient errors.
 */
export function startGeoWatch({ onPosition, onError }: GeoCallbacks) {
  if (!('geolocation' in navigator)) {
    onError('unsupported');
    return { stop() {}, retry() {} };
  }

  let watchId: number | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let hasFix = false;
  let last: { accuracy: number; timestamp: number } | null = null;

  const success = (pos: GeolocationPosition) => {
    const { accuracy } = pos.coords;
    if (last) {
      // Out-of-order (cached) fix, or a coarse fallback fix replacing a recent precise one.
      if (pos.timestamp < last.timestamp) return;
      const preciseRecent = last.accuracy <= COARSE_ACCURACY_M && pos.timestamp - last.timestamp < KEEP_PRECISE_FIX_MS;
      if (preciseRecent && accuracy > COARSE_ACCURACY_M) return;
    }
    last = { accuracy, timestamp: pos.timestamp };
    hasFix = true;
    onError(null);
    onPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy });
  };

  const failure = (err: GeolocationPositionError) => {
    if (stopped) return;
    if (err.code === err.PERMISSION_DENIED) {
      onError('denied');
      clearWatch();
      return;
    }
    // Standing still can trigger timeouts on a healthy watch: nothing to do.
    if (hasFix && err.code === err.TIMEOUT) return;
    // Transient: only surface it if we never got a position.
    if (!hasFix) onError('unavailable');
    coarseFix();
    scheduleRestart();
  };

  function coarseFix() {
    navigator.geolocation.getCurrentPosition(success, () => {}, {
      enableHighAccuracy: false,
      maximumAge: 60_000,
      timeout: 20_000,
    });
  }

  function clearWatch() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  function startWatch() {
    clearWatch();
    watchId = navigator.geolocation.watchPosition(success, failure, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 15_000,
    });
  }

  function scheduleRestart() {
    if (restartTimer) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!stopped) startWatch();
    }, RESTART_DELAY_MS);
  }

  startWatch();
  coarseFix();

  return {
    stop() {
      stopped = true;
      clearWatch();
      if (restartTimer) clearTimeout(restartTimer);
    },
    /** Call from a user gesture: on iOS this can re-trigger the permission prompt. */
    retry() {
      if (stopped) return;
      coarseFix();
      startWatch();
    },
  };
}

/** Mirror of apps/backend/src/geo.ts currentZoneRadius — keep both in sync. */
export function currentZoneRadius(
  radius: number,
  shrink: ZoneShrink | undefined,
  startedAt: number | undefined,
  maxDurationS: number,
  now: number,
): number {
  if (!shrink || startedAt == null) return radius;
  const finalRadius = Math.min(shrink.finalRadius, radius);
  const start = startedAt + shrink.startDelay * 1000;
  const end = startedAt + Math.min(shrink.endDelay, maxDurationS) * 1000;
  if (now <= start || end <= start) return radius;
  const progress = Math.min(1, (now - start) / (end - start));
  return radius - (radius - finalRadius) * progress;
}

export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
