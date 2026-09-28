import type { Zone } from '@manhunt/types';

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(
  lat: number,
  lng: number,
  polygon: { latitude: number; longitude: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude, yi = polygon[i].latitude;
    const xj = polygon[j].longitude, yj = polygon[j].latitude;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isInsideZone(lat: number, lng: number, zone: Zone): boolean {
  if (zone.type === 'cercle' && zone.centre && zone.rayon != null) {
    const d = distanceMeters(lat, lng, zone.centre.latitude, zone.centre.longitude);
    return d <= zone.rayon;
  }
  if (zone.type === 'polygone' && zone.polygone && zone.polygone.length >= 3) {
    return pointInPolygon(lat, lng, zone.polygone);
  }
  return true;
}
