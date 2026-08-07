# 08 — Project Setup

## Overview

Development environment setup, folder structure, dependencies, and build/run scripts.

---

## Folder Structure

```
mcp-surf-forecast/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── docs/
│   ├── INDEX.md                  # Documentation index (this system)
│   ├── 01-architecture.md
│   ├── 02-data-models.md
│   ├── 03-resources.md
│   ├── 04-tools.md
│   ├── 05-wqi-spec.md
│   ├── 06-prompts.md
│   ├── 07-inspector-testing.md
│   └── 08-project-setup.md      # This file
├── src/
│   ├── server.ts                 # Entry point: wires everything together
│   ├── resources/
│   │   ├── index.ts              # registerResources()
│   │   ├── providers.ts          # Provider resource handlers
│   │   ├── beaches.ts            # Beach resource handlers
│   │   ├── forecasts.ts          # Forecast resource handlers
│   │   └── cams.ts               # Cam resource handlers
│   ├── tools/
│   │   ├── index.ts              # registerAllTools()
│   │   ├── geo.ts                # find_beaches_in_radius, find_beaches_near_city
│   │   ├── filters.ts            # filter_beaches, best_sessions_today, compare_beaches
│   │   ├── wqi.ts                # wave_quality_index + WQI engine
│   │   ├── classify.ts           # classify_best_spot_nearby, classify_spot_for_skill
│   │   ├── sessions.ts           # Best session window computation
│   │   └── alerts.ts             # check_swell_alert
│   ├── prompts/
│   │   ├── index.ts              # registerAllPrompts()
│   │   ├── trip.ts               # plan_surf_trip
│   │   ├── report.ts             # daily_surf_report
│   │   ├── analysis.ts           # analyze_spot
│   │   └── beginner.ts           # beginner_spot_finder
│   ├── models/
│   │   ├── index.ts              # Re-exports all types + schemas
│   │   ├── beach.ts              # Beach interface + Zod schema
│   │   ├── forecast.ts           # ForecastEntry + WqiBreakdown schemas
│   │   └── provider.ts           # Provider schema
│   ├── providers/
│   │   ├── index.ts              # Provider factory
│   │   ├── static-forecast.ts    # MVP: reads from JSON
│   │   └── static-beach-repo.ts  # MVP: in-memory beach repository
│   ├── data/
│   │   ├── beaches.json          # Static beach database (~50-100 entries)
│   │   └── providers.json        # Provider metadata
│   └── utils/
│       ├── geo.ts                # Haversine distance, compass conversions
│       ├── geocode.ts            # Nominatim geocoding (free, no key)
│       └── math.ts               # clamp, angleBetween, etc.
├── tests/
│   ├── unit/
│   │   ├── wqi.test.ts
│   │   ├── geo.test.ts
│   │   ├── models.test.ts
│   │   └── classify.test.ts
│   ├── integration/
│   │   ├── helpers.ts            # Test server factory
│   │   ├── resources.test.ts
│   │   ├── tools.test.ts
│   │   └── prompts.test.ts
│   └── e2e/
│       └── server.test.ts
└── .github/
    └── workflows/
        └── ci.yml
```

---

## Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| `@prefecthq/fastmcp-ts` | `^1.0.0` | MCP server framework |
| `zod` | `^3.23.0` | Schema validation |
| `haversine` | `^1.1.1` | Geographic distance calculations |

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | `^5.5.0` | Language |
| `vitest` | `^2.0.0` | Test runner |
| `@vitest/coverage-v8` | `^2.0.0` | Coverage reporting (LCOV for SonarCloud) |
| `@types/node` | `^22.0.0` | Node.js type definitions |
| `@types/haversine` | `^1.1.0` | Haversine type defs |

---

## package.json

```json
{
  "name": "mcp-surf-forecast",
  "version": "1.0.0",
  "type": "module",
  "description": "MCP server for surf forecast data, WQI scoring, and beach discovery",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "dev": "npx fastmcp dev inspector src/server.ts",
    "start": "npx fastmcp run src/server.ts",
    "start:http": "npx fastmcp run src/server.ts --transport http --port 3000",
    "inspect": "npx fastmcp inspect --file src/server.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "tsc --noEmit"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],   // lcov for SonarCloud integration
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/data/**'],
    },
  },
})
```

---

## Server Entry Point (src/server.ts)

The server file is the **composition root** — it wires all dependencies together following Dependency Inversion. No business logic lives here.

```typescript
import { FastMCP } from '@prefecthq/fastmcp-ts/server'
import { StaticBeachRepository } from './providers/static-beach-repo'
import { StaticForecastProvider } from './providers/static-forecast'
import { WqiEngineImpl } from './tools/wqi'
import { registerResources } from './resources'
import { registerAllTools } from './tools'
import { registerAllPrompts } from './prompts'
import beachesData from './data/beaches.json'
import providersData from './data/providers.json'

// --- Composition Root ---

const server = new FastMCP({
  name: 'mcp-surf-forecast',
  version: '1.0.0',
  instructions: 'Surf forecast server. Use wave_quality_index for scoring, find_beaches_* for discovery, and classify_* for recommendations.',
})

// Infrastructure (Dependency Inversion: abstractions injected)
const beachRepo = new StaticBeachRepository(beachesData)
const forecastProvider = new StaticForecastProvider(beachesData)
const wqiEngine = new WqiEngineImpl(beachRepo, forecastProvider)

// Register MCP components
registerResources(server, beachRepo, forecastProvider, providersData)
registerAllTools(server, beachRepo, forecastProvider, wqiEngine)
registerAllPrompts(server)

// Run
await server.run()
```

---

## Quick Start Commands

```bash
# 1. Initialize project
npm init -y
npm install @prefecthq/fastmcp-ts zod haversine
npm install -D typescript vitest @vitest/coverage-v8 @types/node @types/haversine

# 2. Setup TypeScript
npx tsc --init  # then replace with tsconfig above

# 3. Run in dev mode (Inspector UI)
npm run dev

# 4. Run server (stdio — for Claude Desktop / Cursor)
npm start

# 5. Run server (HTTP — for network clients)
npm run start:http

# 6. Run tests
npm test

# 7. Type check
npm run typecheck
```

---

## MCP Client Configuration

### Claude Desktop (mcp.json)

```json
{
  "mcpServers": {
    "surf-forecast": {
      "command": "npx",
      "args": ["fastmcp", "run", "/path/to/mcp-surf-forecast/src/server.ts"]
    }
  }
}
```

### Cursor / Other HTTP Clients

```json
{
  "mcpServers": {
    "surf-forecast": {
      "url": "http://localhost:3000"
    }
  }
}
```

---

## Module Dependency Graph

```
server.ts (composition root)
├── providers/static-beach-repo.ts  → implements BeachRepository
├── providers/static-forecast.ts    → implements ForecastProvider
├── tools/wqi.ts                    → implements WqiEngine
│   ├── depends on: BeachRepository (interface)
│   └── depends on: ForecastProvider (interface)
├── resources/index.ts
│   ├── depends on: BeachRepository (interface)
│   └── depends on: ForecastProvider (interface)
├── tools/index.ts
│   ├── tools/geo.ts      → depends on: BeachRepository
│   ├── tools/filters.ts  → depends on: BeachRepository, ForecastProvider
│   ├── tools/classify.ts → depends on: BeachRepository, WqiEngine
│   └── tools/alerts.ts   → depends on: ForecastProvider
└── prompts/index.ts       → no dependencies (pure templates)
```

All arrows point toward abstractions, never toward concrete implementations.
