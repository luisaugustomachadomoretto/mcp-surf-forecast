import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Forecast, ForecastHour } from '../../src/providers/forecast.js'

/**
 * Build a deterministic forecast around `now` so tool outputs are predictable.
 * `overrides` is merged into every hourly sample.
 */
function makeForecast(overrides: Partial<ForecastHour> = {}, opts: { stale?: boolean } = {}): Forecast {
  const off = 0 // UTC — keeps local time == UTC for simple assertions
  const base = new Date()
  base.setUTCMinutes(0, 0, 0)
  const hours: ForecastHour[] = []
  const daylight: Record<string, { sunrise: string; sunset: string }> = {}
  for (let i = -2; i < 48; i++) {
    const t = new Date(base.getTime() + i * 3600_000)
    const iso = t.toISOString().slice(0, 16) // YYYY-MM-DDTHH:mm
    hours.push({
      time: iso,
      swellHeightM: 1.5,
      swellPeriodS: 12,
      swellDirectionDeg: 270,
      waveHeightM: 1.6,
      waterTempC: 18,
      windSpeedKts: 8,
      windGustKts: 10,
      windDirectionDeg: 90,
      airTempC: 20,
      uvIndex: 5,
      cloudCoverPercent: 20,
      precipitationMm: 0,
      seaLevelM: 0.5,
      tideState: 'rising',
      oceanCurrentKts: 0.3,
      oceanCurrentDirectionDeg: 180,
      ...overrides,
    })
    const date = iso.slice(0, 10)
    daylight[date] = { sunrise: `${date}T06:00`, sunset: `${date}T20:00` }
  }
  return {
    lat: 0, lon: 0,
    generatedAt: new Date().toISOString(),
    timezone: 'UTC',
    utcOffsetSeconds: off,
    hours,
    daylight,
    stale: opts.stale ?? false,
  }
}

// Mutable holder so each test can swap the forecast the mock returns.
const state: { forecast: Forecast } = { forecast: makeForecast() }

vi.mock('../../src/providers/forecast.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/forecast.js')>(
    '../../src/providers/forecast.js',
  )
  return {
    ...actual,
    getForecast: vi.fn(async () => state.forecast),
  }
})

// Import AFTER the mock is registered.
const { registerTools } = await import('../../src/tools/index.js')
const { FakeServer, callTool } = await import('./helpers.js')

function buildServer() {
  const server = new FakeServer()
  registerTools(server as any)
  return server
}

describe('Tools (integration)', () => {
  beforeEach(() => {
    state.forecast = makeForecast()
  })

  it('registers all expected tools', () => {
    const server = buildServer()
    const names = server.tools.map(t => t.name)
    expect(names).toContain('wave_quality_index')
    expect(names).toContain('find_beaches_in_radius')
    expect(names).toContain('filter_beaches')
    expect(names).toContain('wetsuit_recommendation')
    expect(names.length).toBeGreaterThanOrEqual(10)
  })

  describe('find_beaches_in_radius', () => {
    it('returns beaches sorted by distance, respecting limit', async () => {
      const server = buildServer()
      // Lisbon-ish coords; plenty of PT spots nearby.
      const res = await callTool(server.tool('find_beaches_in_radius'), {
        lat: 38.7, lon: -9.14, radiusKm: 100, limit: 5,
      })
      expect(Array.isArray(res)).toBe(true)
      expect(res.length).toBeLessThanOrEqual(5)
      const dists = res.map((b: any) => b.distanceKm)
      const sorted = [...dists].sort((a, b) => a - b)
      expect(dists).toEqual(sorted)
    })

    it('returns empty array when nothing is in range', async () => {
      const server = buildServer()
      const res = await callTool(server.tool('find_beaches_in_radius'), {
        lat: 0, lon: 0, radiusKm: 1, limit: 5, // middle of the Atlantic
      })
      expect(res).toEqual([])
    })
  })

  describe('filter_beaches', () => {
    it('filters by country block', async () => {
      const server = buildServer()
      const res = await callTool(server.tool('filter_beaches'), {
        country: 'Brazil', minWqi: 0, maxResults: 10,
      })
      expect(res.length).toBeGreaterThan(0)
      expect(res.every((b: any) => b.country === 'Brazil')).toBe(true)
    })
  })

  describe('wave_quality_index', () => {
    it('returns a score with full breakdown', async () => {
      const server = buildServer()
      const res = await callTool(server.tool('wave_quality_index'), {
        beachId: 'supertubos-peniche',
      })
      expect(res.wqi).toBeGreaterThanOrEqual(0)
      expect(res.wqi).toBeLessThanOrEqual(10)
      expect(res.breakdown).toHaveProperty('swellScore')
      expect(res.breakdown).toHaveProperty('windScore')
      expect(typeof res.label).toBe('string')
    })

    it('errors for an unknown beach', async () => {
      const server = buildServer()
      const res = await callTool(server.tool('wave_quality_index'), { beachId: 'nope-xyz' })
      expect(res.error).toMatch(/not found/i)
    })

    it('gates to Flat when there is no swell', async () => {
      state.forecast = makeForecast({ swellHeightM: 0, waveHeightM: 0 })
      const server = buildServer()
      const res = await callTool(server.tool('wave_quality_index'), {
        beachId: 'supertubos-peniche',
      })
      expect(res.wqi).toBeLessThanOrEqual(1)
      expect(res.label).toBe('Flat')
    })
  })

  describe('wetsuit_recommendation', () => {
    it('recommends boardshorts for warm water', async () => {
      state.forecast = makeForecast({ waterTempC: 27, windSpeedKts: 5 })
      const server = buildServer()
      const res = await callTool(server.tool('wetsuit_recommendation'), {
        beachId: 'supertubos-peniche',
      })
      expect(res.type).toBe('boardshorts')
    })

    it('recommends a hooded fullsuit for cold water', async () => {
      state.forecast = makeForecast({ waterTempC: 8, windSpeedKts: 5 })
      const server = buildServer()
      const res = await callTool(server.tool('wetsuit_recommendation'), {
        beachId: 'supertubos-peniche',
      })
      expect(res.type).toBe('hooded-fullsuit')
      expect(res.hood).toBe(true)
      expect(res.boots).toBe(true)
    })

    it('applies a wind-chill adjustment', async () => {
      state.forecast = makeForecast({ waterTempC: 19, windSpeedKts: 30 })
      const server = buildServer()
      const res = await callTool(server.tool('wetsuit_recommendation'), {
        beachId: 'supertubos-peniche',
      })
      expect(res.windChillFactor).toBe('severe')
      expect(res.effectiveTemp).toBeLessThan(res.waterTempC)
    })
  })

  describe('classify_best_spot_nearby', () => {
    it('returns results ranked by WQI above the threshold', async () => {
      const server = buildServer()
      const res = await callTool(server.tool('classify_best_spot_nearby'), {
        lat: 38.7, lon: -9.14, radiusKm: 150, topN: 5, minWqi: 0,
      })
      expect(Array.isArray(res)).toBe(true)
      expect(res.length).toBeGreaterThan(0)
      const wqis = res.map((r: any) => r.wqi)
      const sortedDesc = [...wqis].sort((a, b) => b - a)
      expect(wqis).toEqual(sortedDesc)
    })
  })
})
