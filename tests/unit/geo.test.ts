import { describe, it, expect } from 'vitest'
import { clamp, angleBetween, compassToDegrees } from '../../src/utils/math.js'

describe('Math Utils', () => {
  describe('clamp', () => {
    it('clamps value below min', () => {
      expect(clamp(-5, 0, 10)).toBe(0)
    })

    it('clamps value above max', () => {
      expect(clamp(15, 0, 10)).toBe(10)
    })

    it('returns value within range', () => {
      expect(clamp(5, 0, 10)).toBe(5)
    })
  })

  describe('compassToDegrees', () => {
    it('converts N to 0', () => {
      expect(compassToDegrees('N')).toBe(0)
    })

    it('converts E to 90', () => {
      expect(compassToDegrees('E')).toBe(90)
    })

    it('converts SW to 225', () => {
      expect(compassToDegrees('SW')).toBe(225)
    })

    it('is case insensitive', () => {
      expect(compassToDegrees('nw')).toBe(315)
    })
  })

  describe('angleBetween', () => {
    it('returns 0 for same direction', () => {
      expect(angleBetween('N', 'N')).toBe(0)
    })

    it('returns 180 for opposite directions', () => {
      expect(angleBetween('N', 'S')).toBe(180)
    })

    it('returns 90 for perpendicular directions', () => {
      expect(angleBetween('N', 'E')).toBe(90)
    })

    it('handles wrap-around correctly', () => {
      expect(angleBetween('NNW', 'NNE')).toBe(45)
    })
  })
})
