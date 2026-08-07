import { describe, it, expect } from 'vitest'

describe('Tools', () => {
  describe('find_beaches_in_radius', () => {
    it.todo('returns beaches sorted by distance')
    it.todo('respects limit parameter')
    it.todo('rejects invalid coordinates')
  })

  describe('filter_beaches', () => {
    it.todo('filters by region')
    it.todo('filters by skill level')
    it.todo('combines multiple criteria')
  })

  describe('wave_quality_index', () => {
    it.todo('returns score with breakdown')
    it.todo('defaults to current time when no timestamp given')
  })

  describe('classify_best_spot_nearby', () => {
    it.todo('returns ranked results by WQI')
    it.todo('filters by minimum WQI')
  })

  describe('wetsuit_recommendation', () => {
    it.todo('recommends boardshorts for warm water')
    it.todo('recommends hooded fullsuit for cold water')
    it.todo('adjusts for wind chill')
  })
})
