/**
 * Wave Quality Index (WQI) — scoring engine.
 * See docs/05-wqi-spec.md for the full algorithm specification.
 *
 * Pure function: given a forecast sample + beach profile, produces a
 * deterministic 0–10 score. No network calls, no state.
 */

import { clamp, angleBetween, compassToDegrees } from '../utils/math.js'
import type { ForecastHour } from '../providers/forecast.js'

export interface BeachProfile {
  id: string
  name: string
  bestSwellDir: string
  bestWindDir: string
  bestTide: string
  waveType: string[]
  skillLevel: string[]
}

export interface WqiBreakdown {
  swellScore: number
  windScore: number
  consistency: number
  tideAlignment: number
  directionMatch: number
}

export interface WqiResult {
  wqi: number
  label: string
  breakdown: WqiBreakdown
  summary: string
}

const WQI_WEIGHTS = {
  swellScore: 0.30,
  windScore: 0.25,
  consistency: 0.15,
  tideAlignment: 0.15,
  directionMatch: 0.15,
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Angle (0–180) between a degree bearing and a compass direction string. */
function angleDegToCompass(deg: number, compass: string): number {
  const diff = Math.abs(deg - compassToDegrees(compass))
  return diff > 180 ? 360 - diff : diff
}

/** Swell score: height (0.6) + period (0.4). */
export function calcSwellScore(heightM: number, periodS: number): number {
  const heightScore = clamp(heightM / 0.3, 0, 10) // linear up to 3m
  const periodScore = clamp((periodS - 5) / 1.2, 0, 10) // 5s=0, 17s=10
  return heightScore * 0.6 + periodScore * 0.4
}

/** Wind score: direction vs ideal offshore, amplified by speed. */
export function calcWindScore(
  windSpeedKts: number,
  windDirectionDeg: number,
  bestWindDir: string,
  gustKts?: number,
): number {
  if (windSpeedKts < 5) return 9.5 // glassy

  const angleDiff = angleDegToCompass(windDirectionDeg, bestWindDir)
  let dirScore: number
  if (angleDiff <= 30) dirScore = 10
  else if (angleDiff <= 60) dirScore = 7.5
  else if (angleDiff <= 90) dirScore = 5
  else if (angleDiff <= 135) dirScore = 2.5
  else dirScore = 1

  const speedPenalty = clamp((windSpeedKts - 5) / 25, 0, 1)
  let score = dirScore * (1 - speedPenalty * 0.3)

  // Gusty wind (gust >> sustained) penalizes more than steady wind.
  if (gustKts != null && gustKts - windSpeedKts > 8) score *= 0.9

  return clamp(score, 0, 10)
}

/**
 * Consistency: longer period = more groundswell-like = more consistent.
 * Heavy rain and confused seas reduce it (see spec).
 */
export function calcConsistency(periodS: number, precipitationMm?: number): number {
  const periodFactor = clamp((periodS - 6) / 10, 0, 1)
  let score = periodFactor * 10
  if (precipitationMm != null && precipitationMm > 5) score -= 2 // heavy rain → chop
  return clamp(score, 0, 10)
}

/**
 * Tide alignment between the live tide state and the spot's preference.
 *
 * `tideState` comes from the sea-level curve (Open-Meteo `sea_level_height_msl`):
 * 'high' | 'low' | 'rising' | 'falling'. `bestTide` is the spot preference:
 * 'low' | 'mid' | 'high' | 'low-to-mid' | 'mid-to-high' | 'all'.
 *
 * When no live tide state is available we fall back to a NEUTRAL PRIOR (not a
 * real match): 'all' → 8, otherwise 6. This prior is intentionally middling so
 * it neither rewards nor penalizes — callers can detect it via the absence of a
 * tideState on the sample. This is the main reason a spot without tide data
 * tends to cap around WQI 8.
 */
export function calcTideAlignment(
  bestTide: string,
  tideState?: 'rising' | 'falling' | 'high' | 'low' | null,
): number {
  if (!tideState) return bestTide === 'all' ? 8 : 6
  if (bestTide === 'all') return 9

  const want = bestTide.toLowerCase()
  // Map the live instantaneous state to the tide phases a spot can prefer.
  // 'rising' counts toward mid/high windows; 'falling' toward mid/low windows.
  const matches: Record<string, string[]> = {
    high: ['high', 'mid-to-high'],
    low: ['low', 'low-to-mid'],
    rising: ['mid', 'low-to-mid', 'mid-to-high'],
    falling: ['mid', 'low-to-mid', 'mid-to-high'],
  }
  if (matches[tideState]?.some(w => want.includes(w))) return 10
  // Partial credit when the state is adjacent (e.g. rising when spot wants high).
  if (tideState === 'rising' && want.includes('high')) return 7
  if (tideState === 'falling' && want.includes('low')) return 7
  return 4
}

/** Direction match: incoming swell bearing vs spot's optimal window. */
export function calcDirectionMatch(swellDirectionDeg: number, bestSwellDir: string): number {
  const angleDiff = angleDegToCompass(swellDirectionDeg, bestSwellDir)
  if (angleDiff <= 15) return 10
  if (angleDiff <= 30) return 8
  if (angleDiff <= 45) return 6
  if (angleDiff <= 60) return 4
  if (angleDiff <= 90) return 2
  return 1
}

export function wqiLabel(wqi: number): string {
  if (wqi <= 1) return 'Flat'
  if (wqi <= 3) return 'Poor'
  if (wqi <= 5) return 'Fair'
  if (wqi <= 7) return 'Good'
  if (wqi <= 9) return 'Very Good'
  return 'Epic'
}

function generateSummary(beach: BeachProfile, wqi: number): string {
  const type = beach.waveType[0] ?? 'break'
  if (wqi >= 8) return `Excellent conditions at this ${type} — offshore wind, consistent sets.`
  if (wqi >= 6) return `Good ${type} conditions — clean faces, fun waves.`
  if (wqi >= 4) return `Fair conditions — rideable but not ideal for this ${type}.`
  if (wqi >= 2) return `Poor conditions — choppy or too small.`
  return `Flat — no surfable waves at this ${type}.`
}

/**
 * Calculate WQI from a live forecast sample. Pure and synchronous.
 * Missing fields are treated as flat/neutral so the score degrades gracefully.
 */
export function calcWqi(beach: BeachProfile, sample: ForecastHour | null): WqiResult {
  const swellScore = round1(
    calcSwellScore(sample?.swellHeightM ?? 0, sample?.swellPeriodS ?? 0),
  )
  const windScore = round1(
    calcWindScore(
      sample?.windSpeedKts ?? 0,
      sample?.windDirectionDeg ?? 0,
      beach.bestWindDir,
      sample?.windGustKts ?? undefined,
    ),
  )
  const consistency = round1(
    calcConsistency(sample?.swellPeriodS ?? 0, sample?.precipitationMm ?? undefined),
  )
  const tideAlignment = round1(calcTideAlignment(beach.bestTide, sample?.tideState ?? null))
  const directionMatch = round1(
    calcDirectionMatch(sample?.swellDirectionDeg ?? 0, beach.bestSwellDir),
  )

  const wqi = round1(
    swellScore * WQI_WEIGHTS.swellScore +
    windScore * WQI_WEIGHTS.windScore +
    consistency * WQI_WEIGHTS.consistency +
    tideAlignment * WQI_WEIGHTS.tideAlignment +
    directionMatch * WQI_WEIGHTS.directionMatch,
  )

  // Flat gate: no rideable swell means no session, regardless of how clean the
  // wind or tide are. Glassy flat water still scores Flat/Poor, not Fair.
  const height = sample?.swellHeightM ?? 0
  const gated = height < 0.3 ? Math.min(wqi, 1) : height < 0.6 ? Math.min(wqi, 3.5) : wqi

  const label = wqiLabel(gated)
  return {
    wqi: gated,
    label,
    breakdown: { swellScore, windScore, consistency, tideAlignment, directionMatch },
    summary: generateSummary(beach, gated),
  }
}
