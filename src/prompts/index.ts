import type { FastMCP } from 'fastmcp'
import { registerTripPrompt } from './trip.js'
import { registerReportPrompt } from './report.js'
import { registerAnalysisPrompt } from './analysis.js'
import { registerBeginnerPrompt } from './beginner.js'

/**
 * Register all MCP prompts.
 * Prompts are reusable message templates that guide LLM interactions.
 */
export function registerPrompts(server: FastMCP): void {
  registerTripPrompt(server)
  registerReportPrompt(server)
  registerAnalysisPrompt(server)
  registerBeginnerPrompt(server)
}
