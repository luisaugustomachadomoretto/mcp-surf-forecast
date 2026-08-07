# 05 — Wave Quality Index (WQI) Specification

## Overview

The Wave Quality Index is a unified **0–10 scale** that scores wave quality at any given moment. It condenses multiple environmental factors into a single actionable number that surfers and LLMs can reason about.

The WQI engine is a **pure function** — given forecast data and beach characteristics, it produces a deterministic score. No side effects, no network calls, no state.

---

## Scale Definition

| Score | Label | Description | Typical Conditions |
|-------|-------|-------------|-------------------|
| 0–1 | Flat | No surfable waves | < 0.3m, no period |
| 2–3 | Poor | Choppy, blown out, or too small | Onshore wind, short period, inconsistent |
| 4–5 | Fair | Rideable but inconsistent or onshore | Some sets, cross-shore wind, ok period |
| 6–7 | Good | Clean faces, decent size, fun for all levels | 1–1.5m, light wind, moderate period |
| 8–9 | Very Good | Overhead+, offshore wind, long rides | 1.5–2.5m, offshore, 12s+ period, consistent |
| 10 | Epic | Perfect alignment — rare session | Everything lined up, once-a-month conditions |

---

## Scoring Formula

```
WQI = (
    swellScore     × 0.30
  + windScore      × 0.25
  + consistency    × 0.15
  + tideAlignment  × 0.15
  + directionMatch × 0.15
)
```

Each sub-score is normalized to 0–10 independently, then weighted.

---

## Sub-Score Calculations

### Swell Score (weight: 0.30)

Combines wave height and period into a single quality signal.

```typescript
function calcSwellScore(heightM: number, periodS: number): number {
  // Height component: peaks at 1.5–2.5m for most spots
  const heightScore = clamp(heightM / 0.3, 0, 10)  // Linear up to 3m

  // Period component: longer period = better wave quality
  const periodScore = clamp((periodS - 5) / 1.2, 0, 10)  // 5s=0, 17s=10

  // Combined: height matters more than period
  return heightScore * 0.6 + periodScore * 0.4
}
```

| Height (m) | Period (s) | Swell Score |
|-----------|-----------|-------------|
| 0.2 | 6 | 1.0 |
| 0.8 | 9 | 4.3 |
| 1.5 | 12 | 7.3 |
| 2.0 | 14 | 8.7 |
| 3.0+ | 16+ | 10.0 |

### Wind Score (weight: 0.25)

Evaluates wind direction relative to the beach's ideal offshore direction.

```typescript
function calcWindScore(
  windSpeedKts: number,
  windDirection: string,
  bestWindDir: string
): number {
  // Glassy (< 5 kts): near-perfect regardless of direction
  if (windSpeedKts < 5) return 9.5

  // Calculate angle difference between wind and ideal offshore
  const angleDiff = angleBetween(windDirection, bestWindDir)

  // Offshore (0–30°): best
  // Cross-offshore (30–60°): good
  // Cross-shore (60–90°): fair
  // Cross-onshore (90–135°): poor
  // Onshore (135–180°): bad
  let dirScore: number
  if (angleDiff <= 30) dirScore = 10
  else if (angleDiff <= 60) dirScore = 7.5
  else if (angleDiff <= 90) dirScore = 5
  else if (angleDiff <= 135) dirScore = 2.5
  else dirScore = 1

  // Stronger wind amplifies direction impact
  const speedPenalty = clamp((windSpeedKts - 5) / 25, 0, 1)
  return dirScore * (1 - speedPenalty * 0.3)
}
```

| Wind | Direction vs Ideal | Wind Score |
|------|-------------------|------------|
| 3 kts | any | 9.5 |
| 10 kts | offshore | 9.1 |
| 15 kts | cross-shore | 4.1 |
| 20 kts | onshore | 0.7 |

### Consistency (weight: 0.15)

Measures set frequency and reliability. In the MVP (static data), this is estimated from swell period and height stability.

```typescript
function calcConsistency(periodS: number, heightVariance: number): number {
  // Longer period = more consistent (groundswell vs windswell)
  const periodFactor = clamp((periodS - 6) / 10, 0, 1)

  // Lower variance in height = more consistent sets
  const varianceFactor = clamp(1 - heightVariance / 0.5, 0, 1)

  return (periodFactor * 0.6 + varianceFactor * 0.4) * 10
}
```

### Tide Alignment (weight: 0.15)

How well the current tide matches what the spot needs.

```typescript
function calcTideAlignment(
  currentTideState: string,
  tideHeightM: number,
  bestTide: string
): number {
  // Parse bestTide: "low", "mid", "high", "low-to-mid", "all"
  if (bestTide === 'all') return 8 // Most tides work

  const tideMatch = matchesTidePreference(currentTideState, tideHeightM, bestTide)
  // Returns 10 for perfect match, 5 for acceptable, 2 for poor
  return tideMatch
}
```

| Current Tide | Spot Best Tide | Score |
|-------------|---------------|-------|
| low | low | 10 |
| low-rising | low-to-mid | 9 |
| high | low | 2 |
| mid | all | 8 |

### Direction Match (weight: 0.15)

How well the incoming swell direction matches the spot's optimal window.

```typescript
function calcDirectionMatch(
  swellDirection: string,
  bestSwellDir: string
): number {
  const angleDiff = angleBetween(swellDirection, bestSwellDir)

  if (angleDiff <= 15) return 10    // Dead on
  if (angleDiff <= 30) return 8     // Very close
  if (angleDiff <= 45) return 6     // Acceptable
  if (angleDiff <= 60) return 4     // Marginal
  if (angleDiff <= 90) return 2     // Shadow/refraction needed
  return 1                           // Wrong direction entirely
}
```

---

## Label Assignment

```typescript
function wqiToLabel(wqi: number): string {
  if (wqi <= 1) return 'Flat'
  if (wqi <= 3) return 'Poor'
  if (wqi <= 5) return 'Fair'
  if (wqi <= 7) return 'Good'
  if (wqi <= 9) return 'Very Good'
  return 'Epic'
}
```

---

## Engine Interface

```typescript
export interface WqiResult {
  beachId: string
  timestamp: string
  wqi: number
  label: string
  breakdown: WqiBreakdown
  summary: string
}

export interface WqiEngine {
  calculate(beachId: string, timestamp?: string): Promise<WqiResult>
}
```

The engine depends on:
- `BeachRepository` (to get `bestSwellDir`, `bestWindDir`, `bestTide`)
- `ForecastProvider` (to get conditions at the requested time)

It owns the scoring logic exclusively. Nothing else computes WQI scores.

---

## Utility Functions

```typescript
// Clamp a value between min and max
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// Calculate angle between two compass directions (0–180)
function angleBetween(dir1: string, dir2: string): number {
  const deg1 = compassToDegrees(dir1)
  const deg2 = compassToDegrees(dir2)
  const diff = Math.abs(deg1 - deg2)
  return diff > 180 ? 360 - diff : diff
}

// Convert compass direction to degrees
function compassToDegrees(dir: string): number {
  const map: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
    E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
    W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  }
  return map[dir.toUpperCase()] ?? 0
}
```

---

## Test Cases

| Scenario | Expected WQI | Label |
|----------|-------------|-------|
| Flat lake, no swell, no wind | 0.5 | Flat |
| 0.5m, 7s, 15kts onshore, wrong direction | 2.1 | Poor |
| 1.0m, 10s, 10kts cross, ok tide | 5.2 | Fair |
| 1.5m, 12s, 8kts offshore, good tide, good dir | 7.4 | Good |
| 2.0m, 14s, 5kts offshore, perfect tide & dir | 8.9 | Very Good |
| 2.5m, 16s, glassy, perfect everything | 9.8 | Epic |

---

## Design Decisions

1. **Pure function** — WQI calculation has zero side effects. Given the same input, always the same output. This makes it trivially testable.

2. **Weights are constants, not config** — The formula is part of the domain model. Changing weights is a deliberate design decision, not a runtime toggle.

3. **Sub-scores visible** — The breakdown is always returned alongside the total. This enables LLMs to explain *why* a score is what it is.

4. **Spot-relative scoring** — The same conditions score differently at different spots (a NW swell is perfect for some, useless for others). This is the key insight that makes WQI useful.

5. **Extensible** — Future factors (crowd, water temp, hazards) can be added as new sub-scores with minimal weight redistribution.

---

## Environmental Data Impact on WQI

The enriched forecast data from Open-Meteo influences the WQI sub-scores:

| Environmental Factor | Affects Sub-Score | How |
|---------------------|-------------------|-----|
| Heavy rain (> 5mm/h) | Consistency −2 pts | Choppy surface, poor visibility |
| Secondary swell (cross-swell) | Consistency −1 to −3 pts | Confused sea state, unpredictable sets |
| Strong currents (> 2 kts) | Not in WQI, but in safety | Flagged in tool responses |
| Poor visibility (fog) | Not in WQI, but in safety | Hard blocker — unsafe conditions |
| Lightning risk | Not in WQI, but in safety | **Overrides all** — do not surf |
| UV index > 8 | Not in WQI | Informational — sunscreen reminder |
| Wind gusts vs sustained | Wind score | Gusty wind penalizes more than steady wind |

> WQI remains focused on **wave quality**. Environmental/safety factors are surfaced alongside the score in `surf_conditions_full` and tool responses, but don't pollute the core 0–10 scoring. A beach can have WQI 9 but still carry a "strong current warning" — both facts are presented to the user.
