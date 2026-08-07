/**
 * Wave Quality Index (WQI) — scoring engine.
 * See docs/05-wqi-spec.md for the full algorithm specification.
 *
 * MVP: Returns mock/simulated scores based on beach characteristics.
 * Production: Will use real-time forecast data from Open-Meteo.
 */

import { clamp } from '../utils/math.js'

interface BeachProfile {
  id: string
  name: string
  bestSwellDir: string
  bestWindDir: string
  bestTide: string
  waveType: string[]
  skillLevel: string[]
}

interface WqiResult {
  wqi: number
  label: string
  breakdown: {
    swellScore: number
    windScore: number
    consistency: number
    tideAlignment: number
    directionMatch: number
  }
  summary: string
}

const WQI_WEIGHTS = {
  swellScore: 0.30,
  windScore: 0.25,
  consistency: 0.15,
  tideAlignment: 0.15,
  directionMatch: 0.15,
}

/**
 * Calculate WQI for a beach.
 * MVP: Generates a deterministic pseudo-score based on beach characteristics.
 * TODO: Replace with real forecast-based calculation.
 */
export function calcWqi(beach: BeachProfile): WqiResult {
  // Deterministic seed from beach id for consistent placeholder scores
  const seed = hashCode(beach.id)

  // Generate sub-scores (deterministic but varied per beach)
  const swellScore = clamp(5 + (seed % 5), 0, 10)
  const windScore = clamp(6 + ((seed >> 4) % 4), 0, 10)
  const consistency = clamp(4 + ((seed >> 8) % 5), 0, 10)
  const tideAlignment = clamp(5 + ((seed >> 12) % 4), 0, 10)
  const directionMatch = clamp(5 + ((seed >> 16) % 5), 0, 10)

  const wqi = Math.round((
    swellScore * WQI_WEIGHTS.swellScore +
    windScore * WQI_WEIGHTS.windScore +
    consistency * WQI_WEIGHTS.consistency +
    tideAlignment * WQI_WEIGHTS.tideAlignment +
    directionMatch * WQI_WEIGHTS.directionMatch
  ) * 10) / 10

  const label = wqiLabel(wqi)
  const summary = generateSummary(beach, wqi, label)

  return {
    wqi,
    label,
    breakdown: { swellScore, windScore, consistency, tideAlignment, directionMatch },
    summary,
  }
}

export function wqiLabel(wqi: number): string {
  if (wqi <= 1) return 'Flat'
  if (wqi <= 3) return 'Poor'
  if (wqi <= 5) return 'Fair'
  if (wqi <= 7) return 'Good'
  if (wqi <= 9) return 'Very Good'
  return 'Epic'
}

function generateSummary(beach: BeachProfile, wqi: number, label: string): string {
  const type = beach.waveType[0] ?? 'break'
  if (wqi >= 8) return `Excellent conditions at this ${type} — offshore wind, consistent sets.`
  if (wqi >= 6) return `Good ${type} conditions — clean faces, fun waves.`
  if (wqi >= 4) return `Fair conditions — rideable but not ideal for this ${type}.`
  if (wqi >= 2) return `Poor conditions — choppy or too small.`
  return `Flat — no surfable waves at this ${type}.`
}

function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0 // Convert to 32-bit integer
  }
  return Math.abs(hash)
}
