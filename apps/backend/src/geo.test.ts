import { describe, it, expect } from 'vitest';
import { distanceMeters, isInsideZone } from './geo.js';

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
