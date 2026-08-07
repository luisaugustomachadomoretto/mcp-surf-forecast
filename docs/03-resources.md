# 03 — Resources

## Overview

Resources are **read-only data endpoints** exposed via MCP URI schemes. They follow the Repository pattern — resources act as the API surface over the data layer, never performing mutations or computation.

---

## Data Source APIs (Global Forecast)

These free/freemium APIs provide the raw marine + weather data that powers our forecast entries.

### Primary: Open-Meteo (Free, No API Key)

| API | Data Provided | Update Freq | Resolution |
|-----|--------------|-------------|------------|
| [Marine Weather](https://open-meteo.com/en/docs/marine-weather-api) | Wave height, period, direction, SST, currents, tides | 3-hourly | 5–8 km |
| [Weather Forecast](https://open-meteo.com/en/docs) | Wind, temp, rain, cloud, UV, sunrise/sunset | Hourly | 1–11 km |

Open-Meteo provides **all** the environmental data needed for this project, completely free for non-commercial use, no API key required. It covers:

- **Marine**: Wave height (mean + swell + wind waves), period, direction, SST, ocean currents, tides
- **Atmospheric**: Wind speed/gust/direction, air temp, precipitation, cloud cover, UV index, visibility
- **Solar**: Sunrise, sunset, solar radiation

### Secondary: Stormglass (Free tier: 10 requests/day)

| Feature | Value |
|---------|-------|
| URL | https://stormglass.io |
| Free tier | 10 requests/day |
| Data | Wave, wind, tide, water temp, UV, currents, bathymetry |
| Advantage | Higher resolution, multiple model sources per request |

### Surf Community Sources

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

### Data Parameter Map

All parameters available from our data sources and how they map to the forecast model:

| Category | Parameter | Source | Unit | Model Field |
|----------|-----------|--------|------|-------------|
| **Swell** | Primary swell height | Open-Meteo Marine | m | `swellHeightM` |
| | Primary swell period | Open-Meteo Marine | s | `swellPeriodS` |
| | Primary swell direction | Open-Meteo Marine | ° | `swellDirection` |
| | Secondary swell height | Open-Meteo Marine | m | `secondarySwellHeightM` |
| | Secondary swell period | Open-Meteo Marine | s | `secondarySwellPeriodS` |
| | Secondary swell direction | Open-Meteo Marine | ° | `secondarySwellDirection` |
| | Significant wave height | Open-Meteo Marine | m | `waveHeight` |
| | Wind wave height | Open-Meteo Marine | m | `windWaveHeightM` |
| **Tide** | Sea level height (MSL) | Open-Meteo Marine | m | `tideHeightM` |
| | High/low tide times | Computed from sea level | ISO | `nextHighTide`, `nextLowTide` |
| **Wind** | Wind speed | Open-Meteo Weather | kts | `windSpeedKts` |
| | Wind gust | Open-Meteo Weather | kts | `windGustKts` |
| | Wind direction | Open-Meteo Weather | ° | `windDirection` |
| **Temperature** | Air temperature | Open-Meteo Weather | °C | `airTempC` |
| | Sea surface temperature | Open-Meteo Marine | °C | `waterTempC` |
| **Weather** | Precipitation | Open-Meteo Weather | mm/h | `precipitation` |
| | Cloud cover | Open-Meteo Weather | % | `cloudCoverPercent` |
| | Visibility | Open-Meteo Weather | km | `visibility` |
| **Sun & UV** | UV Index | Open-Meteo Weather | 0-11 | `uvIndex` |
| | Sunrise | Open-Meteo Weather | HH:MM | `sunrise` |
| | Sunset | Open-Meteo Weather | HH:MM | `sunset` |
| **Ocean** | Current velocity | Open-Meteo Marine | kts | `currentSpeedKts` |
| | Current direction | Open-Meteo Marine | ° | `currentDirection` |

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
