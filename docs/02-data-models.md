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

A single forecast data point for a beach at a moment in time.

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
  swellHeightM: z.number().nonnegative(),
  swellPeriodS: z.number().positive(),
  swellDirection: z.string(),
  windSpeedKts: z.number().nonnegative(),
  windDirection: z.string(),
  tideHeightM: z.number(),
  tideState: z.enum(['rising', 'falling', 'high', 'low']),
  waterTempC: z.number().nullable(),
  wqi: z.number().min(0).max(10),
  wqiLabel: z.enum(['Flat', 'Poor', 'Fair', 'Good', 'Very Good', 'Epic']),
  wqiBreakdown: WqiBreakdownSchema,
  humanSummary: z.string(),
})

export type ForecastEntry = z.infer<typeof ForecastEntrySchema>
```

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
