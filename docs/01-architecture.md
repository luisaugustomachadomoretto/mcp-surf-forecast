# 01 — Architecture

## System Overview

An MCP server built with **FastMCP TypeScript** (`@prefecthq/fastmcp-ts`) that provides surf forecast data, beach discovery, and session planning tools to LLM clients.

The server aggregates resources from global surf data providers, exposes tools for location-based beach filtering and wave quality scoring, and offers parameterized prompts for common surf-planning workflows.

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│               MCP Surf Forecast Server                   │
│            (FastMCP TS + Node.js + Zod)                  │
├───────────────────┬──────────────────┬──────────────────┤
│    Resources      │     Tools        │     Prompts      │
│  ─────────────    │  ─────────────   │  ─────────────   │
│  surf://providers │  geo search      │  trip planner    │
│  surf://beaches   │  filter/rank     │  daily report    │
│  surf://forecast  │  WQI scoring     │  spot analysis   │
│  surf://cams      │  classify spot   │  beginner guide  │
│                   │  swell alerts    │                  │
├───────────────────┴──────────────────┴──────────────────┤
│                    Core Domain                           │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │ Beach Repo │  │  Forecast  │  │  WQI Engine      │  │
│  │  (static)  │  │  Provider  │  │  (scoring logic) │  │
│  └────────────┘  └────────────┘  └──────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                   Infrastructure                         │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────────┐ │
│  │  Geo    │  │  HTTP    │  │  Data (JSON / future   │ │
│  │  Utils  │  │  Fetcher │  │  provider adapters)    │ │
│  └─────────┘  └──────────┘  └────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         ▲                          ▲
         │                          │
    MCP Clients                FastMCP Inspector
  (Claude, Cursor, etc.)        (dev / debug)
```

---

## Design Principles (SOLID)

### Single Responsibility (S)

Each module has exactly one reason to change:

| Module | Responsibility | Changes when... |
|--------|---------------|-----------------|
| `models/beach.ts` | Beach entity shape | Beach schema evolves |
| `tools/wqi.ts` | Wave scoring algorithm | Scoring formula changes |
| `tools/geo.ts` | Geographic calculations | Geo logic improves |
| `resources/forecasts.ts` | Forecast data exposure | New forecast fields added |
| `prompts/trip.ts` | Trip planning template | LLM guidance changes |

### Open/Closed (O)

- **Adding a beach**: Drop a new entry into `data/beaches.json` — no code changes.
- **Adding a provider**: Implement the `ForecastProvider` interface; register in config.
- **Adding a tool**: Create a new file in `tools/`, register in `tools/index.ts`.
- **Existing code is never modified** to extend behavior.

### Liskov Substitution (L)

```typescript
// Any provider can replace another without breaking the system
interface ForecastProvider {
  id: string
  supports(beachId: string): boolean
  getForecast(beachId: string): Promise<ForecastEntry[]>
}

// Static JSON provider (MVP) and Surfline API provider (future)
// are interchangeable through this interface
```

### Interface Segregation (I)

Tools consume only what they need:

```typescript
// Geo tools only need coordinates, not the full Beach object
interface GeoPoint {
  lat: number
  lon: number
}

// WQI engine needs forecast data + beach characteristics, not cam URLs
interface WqiInput {
  forecast: ForecastEntry
  bestSwellDir: string
  bestWindDir: string
  bestTide: string
}
```

### Dependency Inversion (D)

```typescript
// High-level: WQI tool depends on abstraction
class WqiEngine {
  constructor(private forecastProvider: ForecastProvider) {}
}

// Low-level: Static JSON and API adapters implement the abstraction
class StaticForecastProvider implements ForecastProvider { ... }
class SurflineProvider implements ForecastProvider { ... }  // future
```

---

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | `@prefecthq/fastmcp-ts` | Official FastMCP TypeScript framework |
| Runtime | Node.js 22+ | Required by FastMCP TS |
| Language | TypeScript 5.x | Type safety, Zod integration |
| Schema validation | `zod` | Standard Schema compatible, first-class FastMCP support |
| Geo math | `haversine` | Lightweight distance calculations |
| Geocoding | Nominatim (via fetch) | Free, no API key for MVP |
| HTTP client | Built-in `fetch` | Node 22 native, no dependencies |
| Data (MVP) | Static JSON | No DB dependency for MVP |
| Testing | `vitest` | Fast, TypeScript-native test runner |
| Package mgmt | `npm` / `pnpm` | Standard Node.js tooling |

---

## MVP Scope & Boundaries

### In Scope
- Static database of ~50-100 beaches across all regions
- WQI scoring engine with weighted formula
- Basic forecast data (mock/static for MVP, hooks for real APIs)
- Haversine-based radius search
- All 4 prompts fully functional
- Inspector-verified resources, tools, and prompts

### Out of Scope (Future)
- Real-time API integrations (Surfline API, etc.)
- User accounts / favorites
- Push notifications
- Historical data analysis
- Image/cam frame analysis
- Authentication (OAuth for premium data sources)
- Persistent database (PostgreSQL/SQLite)
- Deployment to cloud (Prefect Horizon, etc.)
- FastMCP Apps (interactive UI components)

---

## Dependency Flow

```
prompts → tools → domain (models + WQI engine) → data providers → infrastructure (geo, fetch)
```

Dependencies point inward. Outer layers know about inner layers, never the reverse.
