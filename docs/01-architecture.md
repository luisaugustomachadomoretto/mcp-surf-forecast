# 01 — Architecture

## System Overview

An MCP server built with **FastMCP** (`fastmcp` npm package v4.x) that provides surf forecast data, beach discovery, and session planning tools to LLM clients.

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
| Framework | `fastmcp` v4.x | FastMCP TypeScript framework (punkpeye/fastmcp) |
| Runtime | Node.js 22+ | Required by FastMCP |
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

---

## MCP Inspector (Development Tooling)

The FastMCP Inspector is a **development-time component** — it validates the server's MCP contract without requiring a real AI client. It lives outside the production dependency graph.

```
┌─────────────────────────────────────────────────┐
│              Development Workflow                 │
├─────────────────────────────────────────────────┤
│                                                  │
│  Developer                                       │
│     │                                            │
│     ├──► npm run dev ──► Inspector UI (browser)  │
│     │                        │                   │
│     │                        ▼                   │
│     │              ┌─────────────────┐           │
│     │              │  MCP Server     │           │
│     │              │  (hot reload)   │           │
│     │              └─────────────────┘           │
│     │                                            │
│     ├──► npx fastmcp inspect ──► Terminal list   │
│     │                                            │
│     └──► npx fastmcp call <tool> ──► JSON output │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Role in Architecture

| Concern | How Inspector helps |
|---------|-------------------|
| Contract validation | Confirms all resources, tools, prompts are registered and reachable |
| Schema correctness | Validates Zod schemas produce the right JSON Schema for MCP clients |
| Error boundaries | Tests that invalid inputs produce proper MCP error responses |
| Performance baseline | Shows response time per call — catch regressions early |
| Hot reload | File-watch mode reloads server on save — instant feedback loop |

The Inspector is bundled inside `fastmcp` — no extra dependency needed. It runs via the `fastmcp` CLI that ships with the package.

---

## npm Dependencies

### Production

| Package | Version | Purpose | Layer |
|---------|---------|---------|-------|
| `fastmcp` | `^4.12.7` | MCP server framework + Inspector CLI | Framework |
| `zod` | `^3.23.0` | Runtime schema validation | Models |
| `haversine` | `^1.1.1` | Geographic distance calculations | Utils |

### Development

| Package | Version | Purpose | Layer |
|---------|---------|---------|-------|
| `typescript` | `^5.5.0` | Language compiler | Build |
| `vitest` | `^2.0.0` | Test runner | Testing |
| `@vitest/coverage-v8` | `^2.0.0` | Coverage reporting (LCOV for SonarCloud) | Testing / CI |
| `@types/node` | `^22.0.0` | Node.js type definitions | Build |
| `@types/haversine` | `^1.1.0` | Haversine type definitions | Build |

### Install command

```bash
# Production deps
npm install fastmcp zod haversine

# Dev deps
npm install -D typescript vitest @vitest/coverage-v8 @types/node @types/haversine
```

> **Note**: The `fastmcp` CLI (Inspector, `run`, `call`, `inspect` commands) ships with the `fastmcp` package. No separate install needed.
