import { describe, it, expect } from 'vitest'
import {
  calcSwellScore,
  calcWindScore,
  calcDirectionMatch,
  calcWqi,
  wqiLabel,
} from '../../src/tools/wqi.ts'
import type { ForecastHour } from '../../src/providers/forecast.ts'

const beach = {
  id: 'test',
  name: 'Test Spot',
  bestSwellDir: 'NW', // 315°
  bestWindDir: 'E', // 90°
  bestTide: 'mid',
  waveType: ['beach-break'],
  skillLevel: ['intermediate'],
}

function hour(overrides: Partial<ForecastHour>): ForecastHour {
  return {
    time: '2026-10-22T09:00',
    swellHeightM: 0,
    swellPeriodS: 0,
    swellDirectionDeg: 0,
    waveHeightM: 0,
    waterTempC: 17,
    windSpeedKts: 0,
    windGustKts: 0,
    windDirectionDeg: 0,
    airTempC: 18,
    uvIndex: 0,
    cloudCoverPercent: 0,
    precipitationMm: 0,
    ...overrides,
  }
}

describe('WQI Engine', () => {
  it('returns near-zero for flat conditions', () => {
    const r = calcWqi(beach, hour({ swellHeightM: 0, swellPeriodS: 0 }))
    expect(r.wqi).toBeLessThanOrEqual(3)
  })

  it('returns high score for overhead + long period, offshore, aligned swell', () => {
    const r = calcWqi(
      beach,
      hour({
        swellHeightM: 2.0,
        swellPeriodS: 14,
        swellDirectionDeg: 315, // matches NW
        windSpeedKts: 3, // glassy
        windDirectionDeg: 90, // offshore (E)
      }),
    )
    expect(r.wqi).toBeGreaterThanOrEqual(7)
  })

  it('caps at 10', () => {
    const r = calcWqi(
      beach,
      hour({ swellHeightM: 5, swellPeriodS: 20, swellDirectionDeg: 315, windSpeedKts: 2 }),
    )
    expect(r.wqi).toBeLessThanOrEqual(10)
    expect(r.breakdown.swellScore).toBeLessThanOrEqual(10)
  })

  it('penalizes onshore wind', () => {
    // Onshore = opposite of bestWindDir (E=90 → onshore ~270 W)
    const onshore = calcWindScore(18, 270, 'E')
    const offshore = calcWindScore(18, 90, 'E')
    expect(onshore).toBeLessThan(offshore)
    expect(onshore).toBeLessThan(3)
  })

  it('rewards offshore wind (glassy)', () => {
    expect(calcWindScore(3, 999, 'E')).toBeGreaterThanOrEqual(9)
  })

  it('accounts for swell direction match', () => {
    expect(calcDirectionMatch(315, 'NW')).toBe(10) // dead on
    expect(calcDirectionMatch(135, 'NW')).toBeLessThanOrEqual(1) // opposite (SE)
  })

  it('swell score increases with height and period', () => {
    expect(calcSwellScore(2.0, 14)).toBeGreaterThan(calcSwellScore(0.5, 7))
  })

  it('assigns correct labels', () => {
    expect(wqiLabel(0.5)).toBe('Flat')
    expect(wqiLabel(2.5)).toBe('Poor')
    expect(wqiLabel(4.5)).toBe('Fair')
    expect(wqiLabel(6.5)).toBe('Good')
    expect(wqiLabel(8.5)).toBe('Very Good')
    expect(wqiLabel(9.5)).toBe('Epic')
  })

  it('degrades gracefully with a null sample', () => {
    const r = calcWqi(beach, null)
    expect(r.wqi).toBeGreaterThanOrEqual(0)
    expect(r.label).toBeTruthy()
  })
})
