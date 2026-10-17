/** Device compass heading in degrees clockwise from north, or null if unavailable. */
export const orientation = $state<{ heading: number | null; permission: 'unknown' | 'granted' | 'denied' | 'unsupported' }>({
  heading: null,
  permission: 'unknown',
});

let listening = false;
let smoothed: number | null = null;
let lastEmit = 0;

function screenAngle(): number {
  return screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
}

function update(raw: number) {
  const value = (raw + screenAngle() + 360) % 360;
  if (smoothed == null) {
    smoothed = value;
  } else {
    // Low-pass filter on the circle to avoid jitter.
    const delta = ((value - smoothed + 540) % 360) - 180;
    smoothed = (smoothed + delta * 0.25 + 360) % 360;
  }
  const now = performance.now();
  const prev = orientation.heading;
  const moved = prev == null || Math.abs(((smoothed - prev + 540) % 360) - 180) > 1;
  if (moved && now - lastEmit > 50) {
    lastEmit = now;
    orientation.heading = smoothed;
  }
}

function onOrientation(e: DeviceOrientationEvent) {
  const iosHeading = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
  if (typeof iosHeading === 'number' && !Number.isNaN(iosHeading)) {
    update(iosHeading);
  } else if (e.absolute && e.alpha != null) {
    update(360 - e.alpha);
  }
}

function onAbsoluteOrientation(e: DeviceOrientationEvent) {
  if (e.alpha != null) update(360 - e.alpha);
}

function listen() {
  if (listening) return;
  listening = true;
  if ('ondeviceorientationabsolute' in (window as object)) {
    window.addEventListener('deviceorientationabsolute', onAbsoluteOrientation as EventListener);
  } else {
    window.addEventListener('deviceorientation', onOrientation);
  }
}

/**
 * Start listening to the compass. On iOS this must be called from a user
 * gesture (click/touchend) because of DeviceOrientationEvent.requestPermission.
 */
export async function enableOrientation(): Promise<boolean> {
  if (listening) return true;
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (!DOE) {
    orientation.permission = 'unsupported';
    return false;
  }
  if (typeof DOE.requestPermission === 'function') {
    try {
      const result = await DOE.requestPermission();
      if (result !== 'granted') {
        orientation.permission = 'denied';
        return false;
      }
    } catch {
      // Not called from a gesture: leave as unknown so a later tap can retry.
      return false;
    }
  }
  orientation.permission = 'granted';
  listen();
  return true;
}

/** True when the browser needs an explicit permission prompt (iOS). */
export function orientationNeedsGesture(): boolean {
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent;
  return typeof DOE?.requestPermission === 'function';
}

export function stopOrientation() {
  if (!listening) return;
  listening = false;
  smoothed = null;
  window.removeEventListener('deviceorientationabsolute', onAbsoluteOrientation as EventListener);
  window.removeEventListener('deviceorientation', onOrientation);
  orientation.heading = null;
}
