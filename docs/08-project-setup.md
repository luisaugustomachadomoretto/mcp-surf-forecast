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
│   ├── INDEX.md
│   ├── 01-architecture.md
│   ├── 02-data-models.md
│   ├── 03-resources.md
│   ├── 04-tools.md
│   ├── 05-wqi-spec.md
│   ├── 06-prompts.md
│   ├── 07-inspector-testing.md
│   └── 08-project-setup.md      # This file
├── src/
│   ├── server.ts                 # Entry point: composition root
│   ├── resources/
│   │   └── index.ts              # All resource registrations (static + templated)
│   ├── tools/
│   │   ├── index.ts              # All tool registrations (11 tools)
│   │   └── wqi.ts                # WQI scoring engine (pure logic)
│   ├── prompts/
│   │   ├── index.ts              # Prompt registration orchestrator
│   │   ├── trip.ts               # plan_surf_trip
│   │   ├── report.ts             # daily_surf_report
│   │   ├── analysis.ts           # analyze_spot
│   │   └── beginner.ts           # beginner_spot_finder
│   ├── data/
│   │   ├── beaches.json          # Static beach database (20 spots)
│   │   └── providers.json        # Provider metadata (12 sources)
│   └── utils/
│       ├── geo.ts                # Haversine distance calculation
│       └── math.ts               # clamp, angleBetween, compassToDegrees
├── tests/
│   ├── unit/
│   │   ├── geo.test.ts           # Math utils tests (passing)
│   │   └── wqi.test.ts           # WQI engine tests (todo)
│   └── integration/
│       ├── resources.test.ts     # Resource tests (todo)
│       ├── tools.test.ts         # Tool tests (todo)
│       └── prompts.test.ts       # Prompt registration tests (passing)
└── .github/
    └── workflows/
        └── ci.yml
```

---

## Dependencies

### Production

| Package | Version | Purpose |
|---------|---------|---------|
| `fastmcp` | `^4.12.7` | MCP server framework (was punkpeye/fastmcp) |
| `zod` | `^3.23.0` | Schema validation |
| `haversine` | `^1.1.1` | Geographic distance calculations |

> **Note**: The `haversine` npm package is listed as a dependency but we implemented our own Haversine in `utils/geo.ts` for zero-dependency geo math. The package can be removed if desired.

### Development

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | `^5.5.0` | Language |
| `vitest` | `^2.0.0` | Test runner |
| `@vitest/coverage-v8` | `^2.0.0` | Coverage reporting (LCOV) |
| `@types/node` | `^22.0.0` | Node.js type definitions |
| `@types/haversine` | `^1.1.6` | Haversine type defs |

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
    "dev": "npx fastmcp dev src/server.ts",
    "start": "npx fastmcp run src/server.ts",
    "start:http": "npx fastmcp run src/server.ts --transport http --port 3000",
    "inspect": "npx fastmcp inspect src/server.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
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
      reporter: ['text', 'lcov'],   // lcov for coverage reporting
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
