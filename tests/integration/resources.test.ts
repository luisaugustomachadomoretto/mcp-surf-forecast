import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Forecast } from '../../src/providers/forecast.js'

// Deterministic forecast so the forecast resource doesn't hit the network.
const forecast: Forecast = {
  lat: 0, lon: 0,
  generatedAt: new Date().toISOString(),
  timezone: 'UTC', utcOffsetSeconds: 0,
  hours: [{
    time: new Date().toISOString().slice(0, 16),
    swellHeightM: 1, swellPeriodS: 10, swellDirectionDeg: 270, waveHeightM: 1,
    waterTempC: 18, windSpeedKts: 8, windGustKts: 10, windDirectionDeg: 90,
    airTempC: 20, uvIndex: 5, cloudCoverPercent: 20, precipitationMm: 0,
    seaLevelM: 0.5, tideState: 'rising', oceanCurrentKts: 0.2, oceanCurrentDirectionDeg: 180,
  }],
  daylight: {},
  stale: false,
}

vi.mock('../../src/providers/forecast.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/forecast.js')>(
    '../../src/providers/forecast.js',
  )
  return { ...actual, getForecast: vi.fn(async () => forecast) }
})

// Mock the waves provider so the waves-br resources are offline + deterministic.
vi.mock('../../src/providers/waves.js', () => ({
  getWavesCatalog: vi.fn(async () => [
    { id: 1, name: 'Maresias', country: 'Brasil', state: 'SP', city: 'São Sebastião', path: '/surf/ondas/picos/sp/sao-sebastiao/maresias/' },
    { id: 2, name: 'Rosa', country: 'Brasil', state: 'SC', city: 'Imbituba', path: '/surf/ondas/picos/sc/imbituba/rosa/' },
  ]),
  getWavesConditions: vi.fn(async (spotPath: string) => ({
    spotPath, url: `https://www.waves.com.br${spotPath}`,
    generatedAt: new Date().toISOString(),
    hours: [{ time: '2026-10-26T00:00', waveHeightM: 1, periodS: 10, swellDirectionDeg: 170, swellCompass: 'S', windSpeedKmh: 10, windDirectionDeg: 40, windCompass: 'NE', windType: 'offshore', score: 7, scoreLabel: 'Bom', tideHeightM: 1, tideDirection: 'rising', weatherSlug: 'cloudy', airTempC: 20, waterTempC: 23 }],
    daily: [],
    stale: false,
  })),
}))

const { registerResources } = await import('../../src/resources/index.js')
const { FakeServer } = await import('./helpers.js')

function buildServer() {
  const server = new FakeServer()
  registerResources(server as any)
  return server
}

async function readResource(server: any, uri: string) {
  const r = server.resource(uri)
  const { text } = await r.load()
  return JSON.parse(text)
}

async function readTemplate(server: any, uriTemplate: string, args: any) {
  const t = server.template(uriTemplate)
  const { text } = await t.load(args)
  return JSON.parse(text)
}

describe('Resources (integration)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('surf://providers returns the provider list', async () => {
    const server = buildServer()
    const data = await readResource(server, 'surf://providers')
    expect(Array.isArray(data)).toBe(true)
    expect(data.some((p: any) => p.id === 'waves-com-br')).toBe(true)
  })

  it('surf://providers/{id} returns a single provider and errors on bad id', async () => {
    const server = buildServer()
    const data = await readTemplate(server, 'surf://providers/{providerId}', { providerId: 'surfline' })
    expect(data.id).toBe('surfline')
    await expect(
      server.template('surf://providers/{providerId}').load({ providerId: 'nope' }),
    ).rejects.toThrow(/not found/i)
  })

  it('surf://beaches returns a compact per-country summary (not the full list)', async () => {
    const server = buildServer()
    const data = await readResource(server, 'surf://beaches')
    expect(data.totalBeaches).toBeGreaterThan(0)
    expect(Array.isArray(data.countries)).toBe(true)
    const sum = data.countries.reduce((acc: number, c: any) => acc + c.count, 0)
    expect(sum).toBe(data.totalBeaches)
    // must NOT be the full array of beach records
    expect(Array.isArray(data)).toBe(false)
  })

  it('surf://beaches/country/{country} returns a compact block', async () => {
    const server = buildServer()
    const data = await readTemplate(server, 'surf://beaches/country/{country}', { country: 'brazil' })
    expect(data.country).toBe('brazil')
    expect(data.count).toBeGreaterThan(0)
    expect(data.beaches[0]).not.toHaveProperty('waveType') // compact
    await expect(
      server.template('surf://beaches/country/{country}').load({ country: 'Atlantis' }),
    ).rejects.toThrow(/No beaches/i)
  })

  it('surf://beaches/{beachId} returns a full profile and errors on bad id', async () => {
    const server = buildServer()
    const data = await readTemplate(server, 'surf://beaches/{beachId}', { beachId: 'supertubos-peniche' })
    expect(data.id).toBe('supertubos-peniche')
    expect(data).toHaveProperty('waveType')
    await expect(
      server.template('surf://beaches/{beachId}').load({ beachId: 'nope' }),
    ).rejects.toThrow(/not found/i)
  })

  it('surf://forecast/{beachId} returns forecast data', async () => {
    const server = buildServer()
    const data = await readTemplate(server, 'surf://forecast/{beachId}', { beachId: 'supertubos-peniche' })
    expect(data.beachId).toBe('supertubos-peniche')
    expect(Array.isArray(data.forecast)).toBe(true)
  })

  it('surf://waves-br/spots returns the catalog grouped by state', async () => {
    const server = buildServer()
    const data = await readResource(server, 'surf://waves-br/spots')
    expect(data.totalSpots).toBe(2)
    const states = data.states.map((s: any) => s.state)
    expect(states).toContain('SP')
    expect(states).toContain('SC')
  })

  it('surf://waves-br/conditions/{spotPath} returns hourly + daily conditions', async () => {
    const server = buildServer()
    const data = await readTemplate(server, 'surf://waves-br/conditions/{spotPath}', {
      spotPath: 'surf/ondas/picos/sp/sao-sebastiao/maresias',
    })
    expect(Array.isArray(data.hours)).toBe(true)
    expect(data.hours[0]).toHaveProperty('score')
    expect(data.stale).toBe(false)
  })
})
