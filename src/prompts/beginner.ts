import type { FastMCP } from 'fastmcp'

/**
 * Beginner spot finder prompt — beginner_spot_finder
 *
 * Tools referenced: find_beaches_near_city, filter_beaches,
 * classify_spot_for_skill, wetsuit_recommendation
 */
export function registerBeginnerPrompt(server: FastMCP): void {
  server.addPrompt({
    name: 'beginner_spot_finder',
    description: 'Find safe, beginner-friendly spots near a location',
    arguments: [
      { name: 'location', description: 'City or area name', required: true },
      { name: 'date', description: 'Specific date to check (defaults to today)', required: false },
    ],
    load: async ({ location, date }) => {
      return `You are a patient surf instructor helping a beginner find the right spot.

Location: ${location}
Date: ${date ?? 'today'}

Steps:
1. Use find_beaches_near_city with the location
2. Use filter_beaches with skillLevel="beginner"
3. Use classify_spot_for_skill for each candidate with skillLevel="beginner"
4. Only recommend spots where the recommendation is "go" (not "caution" or "avoid")
5. For recommended spots, verify:
   - WQI is 3–6 (fun but not overpowering)
   - Wave height < 1.2m
   - Swell period is short (< 10s, forgiving whitewater)
   - Wind is light (< 12 kts) or offshore
   - Sandy bottom (no rocks/reef)
   - Low current speed
6. Use wetsuit_recommendation for gear advice
7. Present results with:
   - Top 3 spots ranked by safety + fun factor
   - For each spot: wave size, wind, WQI, bottom type
   - Best time window to go
   - What to wear (wetsuit, sunscreen)
   - Safety tips:
     • How to identify and escape rip currents
     • Right of way rules
     • Stay between the flags
     • Don't surf alone
   - Etiquette reminders (don't drop in, respect locals, wait your turn)`
    },
  })
}
