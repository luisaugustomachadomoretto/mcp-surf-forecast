import type { FastMCP } from 'fastmcp'

/**
 * Daily surf report prompt — daily_surf_report
 *
 * Tools referenced: find_beaches_near_city, wave_quality_index,
 * surf_conditions_full, wetsuit_recommendation
 */
export function registerReportPrompt(server: FastMCP): void {
  server.addPrompt({
    name: 'daily_surf_report',
    description:
      'Generate a concise morning surf report for beaches near a location',
    arguments: [
      { name: 'location', description: 'City name or coordinates', required: true },
      { name: 'radiusKm', description: 'Search radius in km (default: 30)', required: false },
    ],
    load: async ({ location, radiusKm }) => {
      return `You are a surf forecaster delivering a concise morning report.

Location: ${location}
Search radius: ${radiusKm ?? '30'} km

Steps:
1. Use find_beaches_near_city to get nearby beaches
2. Use wave_quality_index for each beach
3. Use surf_conditions_full for the top pick to get detailed conditions
4. Produce a report with:
   - Overall conditions summary (1-2 sentences)
   - Top 3 picks ranked by WQI score
   - For each pick:
     • WQI score and label
     • Swell: height, period, direction
     • Wind: speed, direction, quality (offshore/onshore)
     • Tide: current state and best window
     • Best session time
   - Water temperature and wetsuit recommendation
   - UV index and sun protection advice
   - Any hazards or warnings (currents, visibility, lightning)

Keep it concise — this is a quick morning check before heading out.`
    },
  })
}
