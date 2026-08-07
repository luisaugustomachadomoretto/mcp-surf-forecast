import type { FastMCP } from 'fastmcp'

/**
 * Trip planner prompt — plan_surf_trip
 *
 * Tools referenced: find_beaches_near_city, wave_quality_index,
 * best_sessions_today, compare_beaches, wetsuit_recommendation
 */
export function registerTripPrompt(server: FastMCP): void {
  server.addPrompt({
    name: 'plan_surf_trip',
    description:
      'Plan a surf trip with beach recommendations, forecast outlook, gear advice, and logistics',
    arguments: [
      { name: 'destination', description: 'City or region to visit', required: true },
      { name: 'travelDates', description: 'Date range (e.g. "Aug 10-17")', required: true },
      { name: 'skillLevel', description: 'beginner | intermediate | advanced | expert', required: false },
      { name: 'preferences', description: 'Wave type preference, crowd tolerance, etc.', required: false },
    ],
    load: async ({ destination, travelDates, skillLevel, preferences }) => {
      return `You are an expert surf trip planner.

Plan a surf trip to ${destination} for dates: ${travelDates}.

Surfer profile:
- Skill level: ${skillLevel ?? 'intermediate'}
- Preferences: ${preferences ?? 'no preference'}

Steps:
1. Use find_beaches_near_city to discover spots in the area
2. Use wave_quality_index for each candidate beach
3. Use best_sessions_today or compare_beaches to rank options
4. Use wetsuit_recommendation to advise on gear for the destination
5. Provide a day-by-day itinerary with:
   - Best beach for each day based on forecast
   - WQI score and conditions summary
   - Optimal session times (tide + wind windows)
   - Backup spots if conditions change
   - Wetsuit/gear recommendation for each day
   - Nearby amenities (board rentals, restaurants)
6. Include safety notes (currents, crowd level, local rules)
7. Add UV/sun protection advice based on forecast data`
    },
  })
}
