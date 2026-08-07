/**
 * Geographic distance calculations using the Haversine formula.
 */

export interface GeoPoint {
  lat: number
  lon: number
}

const EARTH_RADIUS_KM = 6371

/**
 * Calculate the distance in km between two geographic points using Haversine.
 */
export function haversineDistance(point1: GeoPoint, point2: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(point2.lat - point1.lat)
  const dLon = toRad(point2.lon - point1.lon)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(point1.lat)) * Math.cos(toRad(point2.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_KM * c
}
