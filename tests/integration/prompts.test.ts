import { describe, it, expect } from 'vitest'
import { registerTripPrompt } from '../../src/prompts/trip.js'
import { registerReportPrompt } from '../../src/prompts/report.js'
import { registerAnalysisPrompt } from '../../src/prompts/analysis.js'
import { registerBeginnerPrompt } from '../../src/prompts/beginner.js'

describe('Prompts', () => {
  it('registerTripPrompt is a function', () => {
    expect(typeof registerTripPrompt).toBe('function')
  })

  it('registerReportPrompt is a function', () => {
    expect(typeof registerReportPrompt).toBe('function')
  })

  it('registerAnalysisPrompt is a function', () => {
    expect(typeof registerAnalysisPrompt).toBe('function')
  })

  it('registerBeginnerPrompt is a function', () => {
    expect(typeof registerBeginnerPrompt).toBe('function')
  })
})
