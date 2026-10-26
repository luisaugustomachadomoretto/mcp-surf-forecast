import { describe, it, expect } from 'vitest'
import {
  beaches,
  listCountries,
  countryCounts,
  getBeachesByCountry,
  getBeachIndexByCountry,
} from '../../src/providers/beaches.js'

describe('Beach repository — country blocks', () => {
  it('merges scraped datasets including Brazil', () => {
    expect(beaches.length).toBeGreaterThan(0)
    const countries = listCountries()
    expect(countries).toContain('Brazil')
    expect(countries).toContain('Portugal')
    expect(countries).toContain('Spain')
    expect(countries).toContain('France')
    expect(countries).toContain('Uruguay')
    expect(countries).toContain('Argentina')
    expect(countries).toContain('El Salvador')
  })

  it('countryCounts sums to total beach count', () => {
    const counts = countryCounts()
    const sum = counts.reduce((acc, c) => acc + c.count, 0)
    expect(sum).toBe(beaches.length)
    // sorted alphabetically by country
    const sorted = [...counts].sort((a, b) => a.country.localeCompare(b.country))
    expect(counts).toEqual(sorted)
  })

  it('getBeachesByCountry is case-insensitive and non-empty for Brazil', () => {
    const lower = getBeachesByCountry('brazil')
    const proper = getBeachesByCountry('Brazil')
    expect(lower.length).toBeGreaterThan(0)
    expect(lower.length).toBe(proper.length)
    expect(lower.every(b => b.country === 'Brazil')).toBe(true)
  })

  it('getBeachIndexByCountry returns compact entries only', () => {
    const idx = getBeachIndexByCountry('Brazil')
    expect(idx.length).toBeGreaterThan(0)
    const entry = idx[0]
    // compact index must not leak heavy fields
    expect(entry).not.toHaveProperty('waveType')
    expect(entry).not.toHaveProperty('providers')
    expect(entry).toHaveProperty('id')
    expect(entry).toHaveProperty('name')
    expect(entry).toHaveProperty('lat')
    expect(entry).toHaveProperty('lon')
  })

  it('returns empty for unknown country', () => {
    expect(getBeachesByCountry('Atlantis')).toEqual([])
    expect(getBeachIndexByCountry('Atlantis')).toEqual([])
  })
})
