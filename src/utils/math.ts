/**
 * Math utilities — clamp, angle calculations, compass conversions.
 */

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Calculate angle between two compass directions (0–180 degrees).
 */
export function angleBetween(dir1: string, dir2: string): number {
  const deg1 = compassToDegrees(dir1)
  const deg2 = compassToDegrees(dir2)
  const diff = Math.abs(deg1 - deg2)
  return diff > 180 ? 360 - diff : diff
}

/**
 * Convert compass direction string to degrees.
 */
export function compassToDegrees(dir: string): number {
  const map: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
    E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
    W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  }
  return map[dir.toUpperCase()] ?? 0
}
