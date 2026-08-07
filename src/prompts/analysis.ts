import type { FastMCP } from 'fastmcp'

/**
 * Spot analysis prompt — analyze_spot
 *
 * Tools referenced: wave_quality_index, surf_conditions_full
 * Resources referenced: surf://beaches/{beachId}
 */
export function registerAnalysisPrompt(server: FastMCP): void {
  server.addPrompt({
    name: 'analyze_spot',
    description: 'Deep analysis of a specific surf spot over a timeframe',
    arguments: [
      { name: 'beachName', description: 'Name or ID of the beach', required: true },
      { name: 'timeframe', description: 'Period to analyze (e.g. "next 3 days", "this weekend")', required: false },
    ],
    load: async ({ beachName, timeframe }) => {
      return `You are an experienced local surfer analyzing conditions at ${beachName}.

Timeframe: ${timeframe ?? 'next 3 days'}

Steps:
1. Use the surf://beaches/{beachId} resource to understand the spot characteristics
2. Use wave_quality_index for multiple time windows across the timeframe
3. Use surf_conditions_full for the peak window to get full environmental context
4. Provide:
   - Swell analysis: Is the direction/period ideal for this spot? Primary vs secondary swell interaction?
   - Wind analysis: Will it be clean or blown out? When does the sea breeze typically kick in?
   - Tide strategy: Which tide phase works best here? Exact high/low times.
   - WQI trend over the timeframe (improving / peaking / declining) with a simple timeline
   - Best session window with confidence level (high/medium/low)
   - Comparison to the spot's ideal conditions (how close to perfect?)
   - Crowd factor: Is this a popular window? Weekend vs weekday?
   - Water temperature and wetsuit needed
   - UV exposure and sun position (morning = less glare)
   - Any safety concerns (currents, secondary swell, visibility)`
    },
  })
}
