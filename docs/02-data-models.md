# 02 — Data Models

## Overview

Domain entities and their Zod schemas. Models are pure data definitions with no business logic — they represent the vocabulary of the surf forecast domain.

---

## Beach

The core entity representing a surf spot.

```typescript
import { z } from 'zod'

// --- Zod Schema (validation + type inference) ---

export const BeachSchema = z.object({
  id: z.string(),                             // slug: "supertubos-peniche"
  name: z.string(),                           // "Supertubos"
  region: z.string(),                         // "Europe"
  country: z.string(),                        // "Portugal"
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  waveType: z.array(z.string()),              // ["beach-break", "hollow"]
  skillLevel: z.array(z.string()),            // ["intermediate", "advanced"]
  bestTide: z.string(),                       // "low-to-mid"
  bestSwellDir: z.string(),                   // "NW"
  bestWindDir: z.string(),                    // "E"
  providers: z.array(z.string()),             // ["surfline", "windguru"]
  camUrl: z.string().url().nullable(),
})

export type Beach = z.infer<typeof BeachSchema>
```

### Field Semantics

| Field | Description | Example |
|-------|-------------|---------|
| `id` | URL-safe slug, unique identifier | `"pipeline-oahu"` |
| `waveType` | Break characteristics | `["reef-break", "hollow", "left"]` |
| `skillLevel` | Who should surf here | `["advanced", "expert"]` |
| `bestTide` | Optimal tide phase | `"mid"`, `"low-to-mid"`, `"all"` |
| `bestSwellDir` | Swell direction that lights this spot up | `"NW"`, `"S"`, `"SW"` |
| `bestWindDir` | Offshore wind direction | `"E"`, `"NE"` |
| `providers` | Which data sources cover this beach | `["surfline", "coastalwatch"]` |

---

## Forecast Entry

A single forecast data point for a beach at a moment in time. Includes full marine + atmospheric conditions relevant to surfing.

```typescript
export const WqiBreakdownSchema = z.object({
  swellScore: z.number().min(0).max(10),
  windScore: z.number().min(0).max(10),
  consistency: z.number().min(0).max(10),
  tideAlignment: z.number().min(0).max(10),
  directionMatch: z.number().min(0).max(10),
})

export type WqiBreakdown = z.infer<typeof WqiBreakdownSchema>

export const ForecastEntrySchema = z.object({
  beachId: z.string(),
  timestamp: z.string().datetime(),

  // --- Marine / Swell ---
  swellHeightM: z.number().nonnegative(),         // Primary swell height (meters)
  swellPeriodS: z.number().positive(),            // Primary swell period (seconds)
  swellDirection: z.string(),                     // Primary swell direction (compass)
  secondarySwellHeightM: z.number().nullable(),   // Secondary swell (if present)
  secondarySwellPeriodS: z.number().nullable(),
  secondarySwellDirection: z.string().nullable(),
  waveHeight: z.number().nonnegative(),           // Combined significant wave height
  windWaveHeightM: z.number().nonnegative(),      // Wind-generated chop height

  // --- Tide ---
  tideHeightM: z.number(),
  tideState: z.enum(['rising', 'falling', 'high', 'low']),
  nextHighTide: z.string().datetime().nullable(), // Next high tide timestamp
  nextLowTide: z.string().datetime().nullable(),  // Next low tide timestamp

  // --- Wind ---
  windSpeedKts: z.number().nonnegative(),
  windGustKts: z.number().nonnegative(),          // Gust speed
  windDirection: z.string(),

  // --- Atmospheric ---
  airTempC: z.number(),                           // Air temperature
  precipitation: z.number().nonnegative(),        // Precipitation mm/h
  cloudCoverPercent: z.number().min(0).max(100),  // Cloud cover %
  visibility: z.enum(['excellent', 'good', 'moderate', 'poor']),
  uvIndex: z.number().min(0).max(11),             // UV index (0-11+)
  sunrise: z.string(),                            // HH:MM local
  sunset: z.string(),                             // HH:MM local

  // --- Ocean ---
  waterTempC: z.number().nullable(),              // Sea surface temperature
  currentSpeedKts: z.number().nullable(),         // Ocean current velocity
  currentDirection: z.string().nullable(),        // Ocean current direction

  // --- Computed ---
  wqi: z.number().min(0).max(10),
  wqiLabel: z.enum(['Flat', 'Poor', 'Fair', 'Good', 'Very Good', 'Epic']),
  wqiBreakdown: WqiBreakdownSchema,
  wetsuitRecommendation: WetsuitRecommendationSchema,
  humanSummary: z.string(),
})

export type ForecastEntry = z.infer<typeof ForecastEntrySchema>
```

---

## Wetsuit Recommendation

Based on water temperature, wind chill, and session duration. Provides actionable gear advice.

```typescript
export const WetsuitRecommendationSchema = z.object({
  waterTempC: z.number(),
  windChillFactor: z.enum(['none', 'mild', 'moderate', 'severe']),
  recommendation: z.string(),          // e.g. "3/2mm fullsuit"
  thickness: z.string(),               // e.g. "3/2mm"
  type: z.enum(['boardshorts', 'spring-suit', 'shorty', 'fullsuit', 'hooded-fullsuit']),
  boots: z.boolean(),
  gloves: z.boolean(),
  hood: z.boolean(),
  notes: z.string().nullable(),        // e.g. "Wind chill makes it feel colder"
})

export type WetsuitRecommendation = z.infer<typeof WetsuitRecommendationSchema>
```

### Wetsuit Thickness Chart

| Water Temp (°C) | Water Temp (°F) | Wetsuit Type | Thickness | Boots | Gloves | Hood |
|-----------------|-----------------|--------------|-----------|-------|--------|------|
| > 24°C | > 75°F | Boardshorts / Rashguard | — | No | No | No |
| 21–24°C | 70–75°F | Spring suit / Shorty | 2mm | No | No | No |
| 18–21°C | 64–70°F | Fullsuit | 3/2mm | No | No | No |
| 15–18°C | 59–64°F | Fullsuit | 4/3mm | Optional | No | No |
| 12–15°C | 54–59°F | Fullsuit | 5/4mm | Yes | Optional | Optional |
| 9–12°C | 48–54°F | Hooded fullsuit | 5/4mm | Yes | Yes | Yes |
| < 9°C | < 48°F | Hooded fullsuit | 6/5/4mm | Yes | Yes | Yes |

> Wind chill adjustment: If wind speed > 20 kts, shift one category colder. Dawn sessions may also feel 2-3°C colder than reported SST.

---

## Environmental Context

All environmental data that influences surf quality beyond the core swell/wind/tide:

```typescript
export interface EnvironmentalContext {
  // Sun & UV
  uvIndex: number               // 0-11+ (WHO scale)
  uvRisk: 'low' | 'moderate' | 'high' | 'very-high' | 'extreme'
  sunrise: string               // HH:MM local
  sunset: string                // HH:MM local
  daylightHours: number         // Available surf daylight

  // Weather
  airTempC: number
  feelsLikeC: number            // Wind chill adjusted
  precipitationMmH: number     // Rain intensity
  cloudCoverPercent: number
  visibility: 'excellent' | 'good' | 'moderate' | 'poor'

  // Ocean extras
  waterTempC: number
  currentSpeedKts: number
  currentDirection: string

  // Safety implications
  lightningRisk: boolean        // Thunderstorm nearby
  fogWarning: boolean           // Low visibility
  strongCurrentWarning: boolean // Dangerous rip/current
}
```

### How each field affects surfing decisions

| Field | Surf Impact | Used in |
|-------|-------------|---------|
| `uvIndex` | Sunburn risk → sunscreen reminder, session duration | Tool responses, safety notes |
| `sunrise` / `sunset` | Available surf window, dawn patrol timing | `best_sessions_today` |
| `airTempC` + `windSpeedKts` | Wind chill → wetsuit recommendation | `wetsuitRecommendation` |
| `precipitationMmH` | Heavy rain = poor visibility, choppy surface | WQI consistency factor |
| `cloudCoverPercent` | Overcast = lower UV, but also less glare | UV risk calculation |
| `visibility` | Fog = dangerous, can't see sets or other surfers | Safety warnings |
| `waterTempC` | Wetsuit thickness, session endurance | `wetsuitRecommendation` |
| `currentSpeedKts` | Paddle difficulty, drift hazard | Skill classification |
| `currentDirection` | Rip current risk, paddle-out strategy | Safety notes |
| `lightningRisk` | **No surfing** — exit water immediately | Hard blocker |
| `secondarySwellHeightM` | Cross-swells = confused sea state | WQI consistency |

---

## Provider

Metadata about a surf data source.

```typescript
export const ProviderSchema = z.object({
  id: z.string(),                             // "surfline"
  name: z.string(),                           // "Surfline"
  url: z.string().url(),                      // "https://www.surfline.com"
  region: z.string(),                         // "Global" | "Europe" | "Brazil" ...
  dataTypes: z.array(z.string()),             // ["forecast", "cams", "reports"]
  description: z.string(),
})

export type Provider = z.infer<typeof ProviderSchema>
```

---

## Focused Interfaces (Interface Segregation)

These narrow interfaces are consumed by specific modules, avoiding coupling to full entities.

```typescript
// Used by geo tools — only needs coordinates
export interface GeoPoint {
  lat: number
  lon: number
}

// Used by WQI engine — only what scoring needs
export interface WqiInput {
  forecast: ForecastEntry
  bestSwellDir: string
  bestWindDir: string
  bestTide: string
}

// Used by classification tools — beach + current score
export interface ClassifiedBeach {
  beach: Beach
  distanceKm: number
  wqi: number
  wqiLabel: string
}

// Used by session planner — time windows
export interface SessionWindow {
  startTime: string
  endTime: string
  wqi: number
  tideState: string
  windCondition: string
  confidence: 'high' | 'medium' | 'low'
}
```

---

## Abstractions (Dependency Inversion)

High-level modules depend on these interfaces, not concrete implementations.

```typescript
// Data access abstraction — MVP uses static JSON, future uses APIs
export interface ForecastProvider {
  id: string
  supports(beachId: string): boolean
  getForecast(beachId: string, days?: number): Promise<ForecastEntry[]>
}

// Beach repository abstraction
export interface BeachRepository {
  getAll(): Beach[]
  getById(id: string): Beach | undefined
  findInRadius(center: GeoPoint, radiusKm: number): Array<Beach & { distanceKm: number }>
  filter(criteria: BeachFilterCriteria): Beach[]
}

export interface BeachFilterCriteria {
  region?: string
  country?: string
  waveType?: string
  skillLevel?: string
}
```

---

## Enum Constants

```typescript
export const REGIONS = [
  'Global', 'Europe', 'Brazil', 'Australia',
  'Hawaii', 'Indonesia', 'Africa',
] as const

export const SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const

export const WAVE_TYPES = [
  'beach-break', 'point-break', 'reef-break',
  'hollow', 'mellow', 'left', 'right', 'a-frame',
] as const

export const WQI_LABELS = ['Flat', 'Poor', 'Fair', 'Good', 'Very Good', 'Epic'] as const

export const TIDE_STATES = ['rising', 'falling', 'high', 'low'] as const
```
