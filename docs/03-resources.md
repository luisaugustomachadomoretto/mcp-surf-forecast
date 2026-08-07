# 03 — Resources

## Overview

Resources are **read-only data endpoints** exposed via MCP URI schemes. They follow the Repository pattern — resources act as the API surface over the data layer, never performing mutations or computation.

---

## Provider Registry

| Region | Provider | URL | Data Type |
|--------|----------|-----|-----------|
| Global | Surfline | https://www.surfline.com | Forecast, cams, reports |
| Global | Surf-Forecast.com | https://www.surf-forecast.com | Multi-day swell models |
| Global | Magicseaweed (MSW) | https://magicseaweed.com | Forecast, star ratings |
| Europe | MeoSurf (Portugal) | https://www.meobeachcam.com | Live cams, conditions |
| Europe | Windguru | https://www.windguru.cz | Wind/swell models |
| Brazil | Waves.com.br | https://www.waves.com.br | Forecast, reports |
| Australia | Coastalwatch | https://www.coastalwatch.com | Cams, forecast |
| Australia | Swellnet | https://www.swellnet.com | Reports, forecast |
| Hawaii | Surfnewsnetwork | https://surfnewsnetwork.com | Reports, alerts |
| Indonesia | Bali Surf Report | https://www.baliwaves.com | Bali/Indo forecast |
| Africa | Wavescape (South Africa) | https://wavescape.co.za | ZA forecast, cams |
| Africa | Magic Seaweed Africa | https://magicseaweed.com/Africa-Surf-Forecast/2/ | African coast |

---

## URI Scheme

All resources use the `surf://` scheme:

```
surf://providers              → List all providers
surf://providers/{providerId} → Single provider details
surf://beaches                → List all beaches
surf://beaches/{beachId}      → Full beach profile
surf://forecast/{beachId}     → Current forecast for a beach
surf://cams/{beachId}         → Live cam URL/snapshot
```

---

## Resource Definitions

```typescript
import { FastMCP } from '@prefecthq/fastmcp-ts/server'
import type { BeachRepository, ForecastProvider } from '../models'

export function registerResources(
  server: FastMCP,
  beachRepo: BeachRepository,
  forecastProvider: ForecastProvider,
  providers: Provider[]
): void {

  // --- Static collections ---

  server.resource(
    { uri: 'surf://providers', description: 'All available surf data providers with metadata' },
    () => JSON.stringify(providers)
  )

  server.resource(
    { uri: 'surf://beaches', description: 'All indexed beaches (id, name, region, coords)' },
    () => JSON.stringify(beachRepo.getAll())
  )

  // --- Templated (parameterized) ---

  server.resource(
    { uri: 'surf://providers/{providerId}', description: 'Details and capabilities of a specific provider' },
    ({ providerId }) => {
      const provider = providers.find(p => p.id === providerId)
      if (!provider) throw new Error(`Provider not found: ${providerId}`)
      return JSON.stringify(provider)
    }
  )

  server.resource(
    { uri: 'surf://beaches/{beachId}', description: 'Full beach profile: location, wave type, skill level, tides' },
    ({ beachId }) => {
      const beach = beachRepo.getById(beachId)
      if (!beach) throw new Error(`Beach not found: ${beachId}`)
      return JSON.stringify(beach)
    }
  )

  server.resource(
    { uri: 'surf://forecast/{beachId}', description: 'Current multi-day forecast with WQI scores' },
    async ({ beachId }) => {
      const forecast = await forecastProvider.getForecast(beachId)
      return JSON.stringify(forecast)
    }
  )

  server.resource(
    { uri: 'surf://cams/{beachId}', description: 'Live cam URL and snapshot (if available)' },
    ({ beachId }) => {
      const beach = beachRepo.getById(beachId)
      if (!beach) throw new Error(`Beach not found: ${beachId}`)
      if (!beach.camUrl) return JSON.stringify({ beachId, available: false })
      return JSON.stringify({ beachId, available: true, camUrl: beach.camUrl })
    }
  )
}
```

---

## Design Decisions

1. **Resources are passive** — They read from the `BeachRepository` and `ForecastProvider` abstractions. No scoring, no filtering, no computation.

2. **Error handling via throw** — FastMCP converts thrown errors into proper MCP error responses. Invalid IDs surface clearly to the client.

3. **Dependency injection** — `registerResources` receives its dependencies. It doesn't import concrete data files directly. This enables testing with mock data and future swaps to real APIs.

4. **JSON serialization** — Resources return `string` (JSON). The schemas in `02-data-models.md` define the shape; clients can parse accordingly.

5. **Templated URIs** — `{beachId}` and `{providerId}` are extracted by FastMCP and passed as handler arguments. Type-safe and declarative.
