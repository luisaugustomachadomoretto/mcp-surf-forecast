import { describe, it, expect } from 'vitest'
import { deriveTideState, localTimeToEpochMs, daylightHourBounds } from '../../src/providers/forecast.ts'
import type { ForecastHour, Forecast } from '../../src/providers/forecast.ts'

/** Build minimal ForecastHour stubs carrying only seaLevelM. */
function hoursFrom(levels: Array<number | null>): ForecastHour[] {
  return levels.map((seaLevelM, i) => ({
    time: `2026-10-24T${String(i).padStart(2, '0')}:00`,
    swellHeightM: null, swellPeriodS: null, swellDirectionDeg: null,
    waveHeightM: null, waterTempC: null, windSpeedKts: null, windGustKts: null,
    windDirectionDeg: null, airTempC: null, uvIndex: null, cloudCoverPercent: null,
    precipitationMm: null, seaLevelM, tideState: null,
    oceanCurrentKts: null, oceanCurrentDirectionDeg: null,
  }))
}

function states(levels: Array<number | null>) {
  const hours = hoursFrom(levels)
  deriveTideState(hours)
  return hours.map(h => h.tideState)
}

describe('deriveTideState', () => {
  it('does not mislabel a monotonic rising ramp as an extremum', () => {
    // Regression: epsilon-based turning points used to flag the middle hour as "high".
    expect(states([0, 0.5, 1, 1.5])).toEqual(['rising', 'rising', 'rising', 'rising'])
  })

  it('does not mislabel a monotonic falling ramp as an extremum', () => {
    expect(states([1.5, 1, 0.5, 0])).toEqual(['falling', 'falling', 'falling', 'falling'])
  })

  it('detects a true local maximum as high', () => {
    expect(states([0, 1, 2, 1, 0])).toEqual(['rising', 'rising', 'high', 'falling', 'falling'])
  })

  it('detects a true local minimum as low', () => {
    expect(states([2, 1, 0, 1, 2])).toEqual(['falling', 'falling', 'low', 'rising', 'rising'])
  })

  it('uses the previous reading for the final-hour slope (falling stays falling)', () => {
    // Regression: last hour used to compare cur>=cur and always returned "rising".
    const s = states([3, 2, 1])
    expect(s[s.length - 1]).toBe('falling')
  })

  it('returns null tideState for hours without sea-level data', () => {
    expect(states([null, null])).toEqual([null, null])
  })
})

describe('localTimeToEpochMs', () => {
  it('interprets a naive local time using the spot offset (UTC+1)', () => {
    const ms = localTimeToEpochMs('2026-10-24T12:00', 3600)
    expect(new Date(ms).toISOString()).toBe('2026-10-24T11:00:00.000Z')
  })

  it('interprets a naive local time using a negative offset (UTC-3)', () => {
    const ms = localTimeToEpochMs('2026-10-24T12:00', -3 * 3600)
    expect(new Date(ms).toISOString()).toBe('2026-10-24T15:00:00.000Z')
  })
})

describe('daylightHourBounds', () => {
  const base: Forecast = {
    lat: 0, lon: 0, generatedAt: '', timezone: 'Europe/Lisbon', utcOffsetSeconds: 3600,
    hours: [], daylight: {
      '2026-10-24': { sunrise: '2026-10-24T07:48', sunset: '2026-10-24T18:34' },
    }, stale: false,
  }

  it('uses sunrise/sunset bounds when available (ceil sunset to next hour)', () => {
    const b = daylightHourBounds(base, '2026-10-24')
    expect(b).toEqual({ startHr: 7, endHr: 19, source: 'sun' })
  })

  it('falls back to 06:00–20:00 when the date has no sun data', () => {
    const b = daylightHourBounds(base, '2026-10-25')
    expect(b).toEqual({ startHr: 6, endHr: 20, source: 'default' })
  })
})
