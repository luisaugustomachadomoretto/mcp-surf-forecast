# 04 — Tools

## Overview

Tools are **invocable functions** that perform computation, data transformation, or orchestration. Unlike resources (read-only), tools actively process input and produce derived results.

Each tool has a single responsibility and depends on abstractions (repository, provider) rather than concrete data sources.

---

## Tool Registry

| Tool | Category | Description |
|------|----------|-------------|
| `find_beaches_in_radius` | Geo | Find beaches within radius from coordinates |
| `find_beaches_near_city` | Geo | Geocode city, then radius search |
| `filter_beaches` | Filter | Multi-criteria beach filtering |
| `best_sessions_today` | Session | Optimal surf windows for a beach |
| `compare_beaches` | Comparison | Side-by-side forecast comparison |
| `wave_quality_index` | WQI | Calculate 0–10 score for a beach/time |
| `classify_best_spot_nearby` | Classification | Ranked spots by WQI within radius |
| `classify_spot_for_skill` | Classification | Skill-level suitability check |
| `check_swell_alert` | Alert | Future swell detection |
| `wetsuit_recommendation` | Gear | Wetsuit type/thickness based on water temp + wind chill |
| `surf_conditions_full` | Environment | Complete conditions: marine, wind, weather, UV, gear, safety |

---

## 1. Geo-based Search

```typescript
import { z } from 'zod'
import type { FastMCP } from '@prefecthq/fastmcp-ts/server'
import type { BeachRepository } from '../models'

export function registerGeoTools(server: FastMCP, beachRepo: BeachRepository): void {

  server.tool(
    {
      name: 'find_beaches_in_radius',
      description: 'Find beaches within a given radius (km) from GPS coordinates, sorted by distance (closest first)',
      input: z.object({
        lat: z.number().min(-90).max(90).describe('Latitude'),
        lon: z.number().min(-180).max(180).describe('Longitude'),
        radiusKm: z.number().positive().default(50).describe('Search radius in kilometers'),
        limit: z.number().int().positive().default(10).describe('Max results to return'),
      }),
    },
    ({ lat, lon, radiusKm, limit }) => {
      const results = beachRepo.findInRadius({ lat, lon }, radiusKm)
      return results.slice(0, limit)
    }
  )

  server.tool(
    {
      name: 'find_beaches_near_city',
      description: 'Find beaches near a city name. Geocodes the city first, then searches by radius.',
      input: z.object({
        city: z.string().describe('City name'),
        country: z.string().optional().describe('Country (helps disambiguation)'),
        radiusKm: z.number().positive().default(100).describe('Search radius in km'),
        limit: z.number().int().positive().default(10).describe('Max results'),
      }),
    },
    async ({ city, country, radiusKm, limit }) => {
      const coords = await geocodeCity(city, country)
      if (!coords) throw new Error(`Could not geocode city: ${city}`)
      const results = beachRepo.findInRadius(coords, radiusKm)
      return results.slice(0, limit)
    }
  )
}
```

---

## 2. Filtering & Ranking

```typescript
export function registerFilterTools(server: FastMCP, beachRepo: BeachRepository, forecastProvider: ForecastProvider): void {

  server.tool(
    {
      name: 'filter_beaches',
      description: 'Filter beaches by region, wave type, skill level, and minimum WQI score',
      input: z.object({
        region: z.string().optional().describe('Region filter (e.g. "Europe", "Australia")'),
        country: z.string().optional().describe('Country filter'),
        waveType: z.string().optional().describe('Wave type (e.g. "beach-break", "reef-break")'),
        skillLevel: z.string().optional().describe('Skill level (beginner/intermediate/advanced/expert)'),
        minWqi: z.number().min(0).max(10).default(0).describe('Minimum WQI score'),
        maxResults: z.number().int().positive().default(20).describe('Max results'),
      }),
    },
    async (params) => {
      const beaches = beachRepo.filter(params)
      // If minWqi > 0, enrich with current WQI and filter
      if (params.minWqi > 0) {
        return enrichAndFilterByWqi(beaches, params.minWqi, forecastProvider)
      }
      return beaches.slice(0, params.maxResults)
    }
  )

  server.tool(
    {
      name: 'best_sessions_today',
      description: 'Return the best time windows to surf today, considering swell, wind, and tide alignment',
      input: z.object({
        beachId: z.string().describe('Beach identifier'),
      }),
    },
    async ({ beachId }) => {
      return computeBestSessions(beachId, forecastProvider)
    }
  )

  server.tool(
    {
      name: 'compare_beaches',
      description: 'Side-by-side forecast and WQI comparison for multiple beaches on a given date',
      input: z.object({
        beachIds: z.array(z.string()).min(2).max(5).describe('Beach IDs to compare (2–5)'),
        date: z.string().optional().describe('ISO date (defaults to today)'),
      }),
    },
    async ({ beachIds, date }) => {
      return compareForecastsForDate(beachIds, date, forecastProvider)
    }
  )
}
```

---

## 3. Wave Quality Index

> Full algorithm specification in [05-wqi-spec.md](./05-wqi-spec.md)

```typescript
export function registerWqiTools(server: FastMCP, wqiEngine: WqiEngine): void {

  server.tool(
    {
      name: 'wave_quality_index',
      description: 'Calculate the Wave Quality Index (0–10) for a beach at a given time. Returns score, label, and factor breakdown.',
      input: z.object({
        beachId: z.string().describe('Beach identifier'),
        timestamp: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
      }),
    },
    async ({ beachId, timestamp }) => {
      return wqiEngine.calculate(beachId, timestamp)
    }
  )
}

// Return shape:
// {
//   beachId: "supertubos-peniche",
//   timestamp: "2026-08-07T08:00:00Z",
//   wqi: 7.8,
//   label: "Very Good",
//   breakdown: { swellScore: 8.5, windScore: 9.0, consistency: 6.5, tideAlignment: 7.0, directionMatch: 7.5 },
//   summary: "Overhead sets at 14s, light offshore — pumping."
// }
```

---

## 4. Classification

```typescript
export function registerClassifyTools(
  server: FastMCP,
  beachRepo: BeachRepository,
  wqiEngine: WqiEngine
): void {

  server.tool(
    {
      name: 'classify_best_spot_nearby',
      description: 'Find and rank the best surf spots nearby by WQI. Combines geo-search with quality scoring to return a ranked list.',
      input: z.object({
        lat: z.number().min(-90).max(90).describe('Latitude'),
        lon: z.number().min(-180).max(180).describe('Longitude'),
        radiusKm: z.number().positive().default(50).describe('Search radius in km'),
        topN: z.number().int().positive().default(5).describe('Number of top spots to return'),
        skillLevel: z.string().optional().describe('Filter by skill level'),
        minWqi: z.number().min(0).max(10).default(4).describe('Minimum WQI threshold'),
      }),
    },
    async ({ lat, lon, radiusKm, topN, skillLevel, minWqi }) => {
      // 1. Find beaches in radius
      let candidates = beachRepo.findInRadius({ lat, lon }, radiusKm)

      // 2. Filter by skill level if specified
      if (skillLevel) {
        candidates = candidates.filter(b => b.skillLevel.includes(skillLevel))
      }

      // 3. Score each with WQI
      const scored = await Promise.all(
        candidates.map(async (beach) => ({
          ...beach,
          ...(await wqiEngine.calculate(beach.id)),
        }))
      )

      // 4. Filter by minimum WQI, sort descending, take topN
      return scored
        .filter(s => s.wqi >= minWqi)
        .sort((a, b) => b.wqi - a.wqi)
        .slice(0, topN)
        .map((s, i) => ({
          rank: i + 1,
          beachId: s.beachId,
          name: s.name,
          distanceKm: s.distanceKm,
          wqi: s.wqi,
          label: s.label,
          waveType: s.waveType,
          recommendedFor: s.skillLevel,
          bestWindow: s.bestWindow,
          highlights: s.summary,
        }))
    }
  )

  server.tool(
    {
      name: 'classify_spot_for_skill',
      description: 'Classify a spot\'s suitability for a skill level RIGHT NOW. Returns go/caution/avoid with reasoning and alternatives.',
      input: z.object({
        beachId: z.string().describe('Beach identifier'),
        skillLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).describe('Surfer skill level'),
      }),
    },
    async ({ beachId, skillLevel }) => {
      return classifyForSkill(beachId, skillLevel, beachRepo, wqiEngine)
    }
  )
}

// classify_best_spot_nearby returns:
// [
//   {
//     rank: 1,
//     beachId: "coxos-ericeira",
//     name: "Coxos",
//     distanceKm: 12.3,
//     wqi: 8.2,
//     label: "Very Good",
//     waveType: ["point-break", "hollow"],
//     recommendedFor: ["advanced"],
//     bestWindow: "07:00–10:30 (dropping tide, offshore holds)",
//     highlights: "Long right walls, 6ft+ sets, light NE wind"
//   }
// ]

// classify_spot_for_skill returns:
// {
//   beachId: "supertubos-peniche",
//   skillLevel: "intermediate",
//   recommendation: "caution",    // "go" | "caution" | "avoid"
//   wqi: 7.8,
//   reasons: [
//     "Wave size (6ft) is at upper limit for intermediate",
//     "Hollow, fast barrels — better suited for advanced",
//     "Strong currents on dropping tide"
//   ],
//   alternative: {
//     beachId: "baleal-north",
//     name: "Baleal North",
//     wqi: 6.2,
//     why: "Mellower walls, sandy bottom, similar size but less power"
//   }
// }
```

---

## 5. Alerts & Monitoring

```typescript
export function registerAlertTools(server: FastMCP, forecastProvider: ForecastProvider): void {

  server.tool(
    {
      name: 'check_swell_alert',
      description: 'Check if significant swell is forecasted for a beach in the next N days. Returns matching forecast windows.',
      input: z.object({
        beachId: z.string().describe('Beach identifier'),
        minSwellHeightM: z.number().positive().default(1.5).describe('Minimum swell height in meters'),
        daysAhead: z.number().int().positive().default(7).describe('Days to look ahead'),
      }),
    },
    async ({ beachId, minSwellHeightM, daysAhead }) => {
      const forecast = await forecastProvider.getForecast(beachId, daysAhead)
      return forecast.filter(f => f.swellHeightM >= minSwellHeightM)
    }
  )
}
```

---

## 6. Environmental & Gear Recommendations

```typescript
export function registerEnvironmentTools(server: FastMCP, forecastProvider: ForecastProvider): void {

  server.tool(
    {
      name: 'wetsuit_recommendation',
      description: 'Recommend wetsuit type and thickness based on current water temperature, wind chill, and conditions at a beach. Includes boots/gloves/hood advice.',
      input: z.object({
        beachId: z.string().describe('Beach identifier'),
        timestamp: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
        sessionDurationMin: z.number().positive().default(90).describe('Planned session duration in minutes'),
      }),
    },
    async ({ beachId, timestamp, sessionDurationMin }) => {
      return getWetsuitRecommendation(beachId, timestamp, sessionDurationMin, forecastProvider)
    }
  )

  // Returns:
  // {
  //   beachId: "coxos-ericeira",
  //   waterTempC: 16.5,
  //   airTempC: 19.0,
  //   windSpeedKts: 12,
  //   windChillFactor: "mild",
  //   recommendation: "4/3mm fullsuit",
  //   thickness: "4/3mm",
  //   type: "fullsuit",
  //   boots: false,
  //   gloves: false,
  //   hood: false,
  //   notes: "Wind chill mild — standard fullsuit sufficient. Water warming through summer.",
  //   uvIndex: 7,
  //   uvRisk: "high",
  //   sunscreenReminder: true,
  //   sunrise: "06:42",
  //   sunset: "20:38"
  // }

  server.tool(
    {
      name: 'surf_conditions_full',
      description: 'Get complete environmental conditions for a surf session: marine, wind, weather, UV, visibility, currents, and gear recommendations all in one call.',
      input: z.object({
        beachId: z.string().describe('Beach identifier'),
        timestamp: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
      }),
    },
    async ({ beachId, timestamp }) => {
      return getFullConditions(beachId, timestamp, forecastProvider)
    }
  )

  // Returns:
  // {
  //   beachId: "supertubos-peniche",
  //   timestamp: "2026-08-07T08:00:00Z",
  //   marine: {
  //     swellHeightM: 1.8,
  //     swellPeriodS: 14,
  //     swellDirection: "NW",
  //     secondarySwell: { heightM: 0.4, periodS: 8, direction: "W" },
  //     waveHeight: 2.0,
  //     windWaveHeightM: 0.3,
  //     tideHeightM: 1.2,
  //     tideState: "falling",
  //     nextLowTide: "2026-08-07T10:30:00Z",
  //     currentSpeedKts: 0.8,
  //     currentDirection: "S"
  //   },
  //   wind: {
  //     speedKts: 8,
  //     gustKts: 14,
  //     direction: "NE",
  //     quality: "offshore — clean faces"
  //   },
  //   weather: {
  //     airTempC: 22,
  //     feelsLikeC: 20,
  //     precipitation: 0,
  //     cloudCoverPercent: 15,
  //     visibility: "excellent"
  //   },
  //   sun: {
  //     uvIndex: 8,
  //     uvRisk: "very-high",
  //     sunrise: "06:42",
  //     sunset: "20:38",
  //     sunscreenReminder: true
  //   },
  //   ocean: {
  //     waterTempC: 17,
  //     currentSpeedKts: 0.8,
  //     currentDirection: "S"
  //   },
  //   gear: {
  //     wetsuit: "4/3mm fullsuit",
  //     boots: false,
  //     gloves: false,
  //     hood: false,
  //     sunscreen: "SPF 50+ recommended (UV 8)"
  //   },
  //   safety: {
  //     lightningRisk: false,
  //     fogWarning: false,
  //     strongCurrentWarning: false,
  //     notes: []
  //   },
  //   wqi: 8.2,
  //   wqiLabel: "Very Good",
  //   summary: "Pumping overhead NW groundswell, light offshore, dropping tide — epic morning ahead."
  // }
}
```

### Wetsuit Thickness Logic

```typescript
function recommendWetsuit(
  waterTempC: number,
  windSpeedKts: number,
  airTempC: number,
  sessionDurationMin: number
): WetsuitRecommendation {

  // Wind chill adjustment: strong wind = feels colder on exit
  const windChillFactor = windSpeedKts > 25 ? 'severe'
    : windSpeedKts > 20 ? 'moderate'
    : windSpeedKts > 12 ? 'mild'
    : 'none'

  // Effective temp considers wind chill
  const effectiveTemp = windChillFactor === 'none' ? waterTempC
    : windChillFactor === 'mild' ? waterTempC - 1
    : windChillFactor === 'moderate' ? waterTempC - 2
    : waterTempC - 3

  // Long sessions (> 2h) shift one category thicker
  const longSession = sessionDurationMin > 120

  // Determine gear based on effective temp
  if (effectiveTemp > 24) return { type: 'boardshorts', thickness: '—', ... }
  if (effectiveTemp > 21) return { type: 'spring-suit', thickness: '2mm', ... }
  if (effectiveTemp > 18) return { type: 'fullsuit', thickness: '3/2mm', ... }
  if (effectiveTemp > 15) return { type: 'fullsuit', thickness: '4/3mm', boots: longSession, ... }
  if (effectiveTemp > 12) return { type: 'fullsuit', thickness: '5/4mm', boots: true, gloves: true, ... }
  return { type: 'hooded-fullsuit', thickness: '6/5/4mm', boots: true, gloves: true, hood: true, ... }
}
```

---

## Design Decisions

1. **Function registration pattern** — Each category (`registerGeoTools`, `registerFilterTools`, etc.) receives only the dependencies it needs. This enforces Interface Segregation.

2. **Dependency injection** — Tools receive `BeachRepository`, `ForecastProvider`, and `WqiEngine` as arguments. No global state, no direct file imports in tool logic.

3. **Composition in server.ts** — The server entry point wires dependencies together. Tools don't know about each other.

4. **Zod `.describe()`** — Every field has a description that surfaces in MCP tool schemas, helping LLMs understand parameters.

5. **Async-ready** — Handlers are `async` where they touch forecast data (future API calls), synchronous for pure computation (geo math).
