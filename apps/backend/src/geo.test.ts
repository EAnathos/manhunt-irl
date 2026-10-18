import { describe, it, expect } from 'vitest';
import { distanceMeters, isInsideZone, currentZoneRadius } from './geo.js';

describe('distanceMeters', () => {
  it('returns 0 for same point', () => {
    expect(distanceMeters(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0);
  });

  it('computes Paris to Lyon (~390 km)', () => {
    const d = distanceMeters(48.8566, 2.3522, 45.7640, 4.8357);
    expect(d).toBeGreaterThan(380_000);
    expect(d).toBeLessThan(400_000);
  });
});

describe('isInsideZone', () => {
  it('circle: inside', () => {
    expect(
      isInsideZone(48.8566, 2.3522, {
        type: 'cercle',
        centre: { latitude: 48.8566, longitude: 2.3522 },
        rayon: 100,
      }),
    ).toBe(true);
  });

  it('circle: outside', () => {
    expect(
      isInsideZone(45.0, 2.0, {
        type: 'cercle',
        centre: { latitude: 48.8566, longitude: 2.3522 },
        rayon: 100,
      }),
    ).toBe(false);
  });

  it('polygon: inside', () => {
    const polygon = [
      { latitude: 48.0, longitude: 2.0 },
      { latitude: 49.0, longitude: 2.0 },
      { latitude: 49.0, longitude: 3.0 },
      { latitude: 48.0, longitude: 3.0 },
    ];
    expect(isInsideZone(48.5, 2.5, { type: 'polygone', polygone: polygon })).toBe(true);
  });

  it('polygon: outside', () => {
    const polygon = [
      { latitude: 48.0, longitude: 2.0 },
      { latitude: 49.0, longitude: 2.0 },
      { latitude: 49.0, longitude: 3.0 },
      { latitude: 48.0, longitude: 3.0 },
    ];
    expect(isInsideZone(50.0, 2.5, { type: 'polygone', polygone: polygon })).toBe(false);
  });
});

describe('currentZoneRadius', () => {
  const start = 1_000_000;
  const shrink = { finalRadius: 200, startDelay: 60, endDelay: 660 };

  it('keeps the full radius without shrink or before it starts', () => {
    expect(currentZoneRadius(800, undefined, start, 1800, start + 300_000)).toBe(800);
    expect(currentZoneRadius(800, shrink, start, 1800, start + 30_000)).toBe(800);
    expect(currentZoneRadius(800, shrink, undefined, 1800, start)).toBe(800);
  });

  it('shrinks linearly between startDelay and endDelay', () => {
    // halfway: 60s + 300s
    expect(currentZoneRadius(800, shrink, start, 1800, start + 360_000)).toBeCloseTo(500);
  });

  it('stays at the final radius after endDelay', () => {
    expect(currentZoneRadius(800, shrink, start, 1800, start + 1_000_000)).toBe(200);
  });

  it('never grows when the final radius exceeds the radius', () => {
    expect(currentZoneRadius(150, shrink, start, 1800, start + 1_000_000)).toBe(150);
  });

  it('caps endDelay to the game duration', () => {
    // game lasts 360s: shrink must be complete at 360s
    expect(currentZoneRadius(800, shrink, start, 360, start + 360_000)).toBe(200);
  });
});

describe('isInsideZone tolerance', () => {
  const zone = { type: 'cercle' as const, centre: { latitude: 48.8566, longitude: 2.3522 }, rayon: 100 };
  // ~111 m north of the centre
  const lat = 48.8566 + 0.001;

  it('is outside without tolerance and inside with enough tolerance', () => {
    expect(isInsideZone(lat, 2.3522, zone)).toBe(false);
    expect(isInsideZone(lat, 2.3522, zone, 20)).toBe(true);
  });
});
