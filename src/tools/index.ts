import type { FastMCP } from 'fastmcp'
import { z } from 'zod'
import beaches from '../data/beaches.json' with { type: 'json' }
import { haversineDistance } from '../utils/geo.js'
import { calcWqi } from './wqi.js'

/**
 * Register all MCP tools.
 */
export function registerTools(server: FastMCP): void {
  // --- Wave Quality Index ---

  server.addTool({
    name: 'wave_quality_index',
    description: 'Calculate the Wave Quality Index (0-10) for a beach at a given time. Returns score, label, and factor breakdown.',
    parameters: z.object({
      beachId: z.string().describe('Beach identifier (e.g. "supertubos-peniche")'),
      timestamp: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
    }),
    execute: async ({ beachId, timestamp }) => {
      const beach = beaches.find(b => b.id === beachId)
      if (!beach) return JSON.stringify({ error: `Beach not found: ${beachId}` })
      const result = calcWqi(beach)
      return JSON.stringify({
        beachId,
        timestamp: timestamp ?? new Date().toISOString(),
        ...result,
      })
    },
  })

  // --- Classify Best Spot Nearby ---

  server.addTool({
    name: 'classify_best_spot_nearby',
    description: 'Find and rank the best surf spots nearby using WQI. Combines geo-search with quality scoring.',
    parameters: z.object({
      lat: z.number().min(-90).max(90).describe('Latitude'),
      lon: z.number().min(-180).max(180).describe('Longitude'),
      radiusKm: z.number().positive().default(50).describe('Search radius in km'),
      topN: z.number().int().positive().default(5).describe('Number of top spots to return'),
      skillLevel: z.string().optional().describe('Filter by skill level (beginner/intermediate/advanced/expert)'),
      minWqi: z.number().min(0).max(10).default(4).describe('Minimum WQI threshold'),
    }),
    execute: async ({ lat, lon, radiusKm, topN, skillLevel, minWqi }) => {
      let candidates = beaches
        .map(b => ({ ...b, distanceKm: haversineDistance({ lat, lon }, { lat: b.lat, lon: b.lon }) }))
        .filter(b => b.distanceKm <= radiusKm)

      if (skillLevel) {
        candidates = candidates.filter(b => b.skillLevel.includes(skillLevel))
      }

      const scored = candidates.map((b, i) => {
        const wqi = calcWqi(b)
        return { ...b, ...wqi, rank: 0 }
      })
        .filter(s => s.wqi >= minWqi)
        .sort((a, b) => b.wqi - a.wqi)
        .slice(0, topN)
        .map((s, i) => ({
          rank: i + 1,
          beachId: s.id,
          name: s.name,
          distanceKm: Math.round(s.distanceKm * 10) / 10,
          wqi: s.wqi,
          label: s.label,
          waveType: s.waveType,
          recommendedFor: s.skillLevel,
          highlights: s.summary,
        }))

      return JSON.stringify(scored)
    },
  })

  // --- Classify Spot for Skill ---

  server.addTool({
    name: 'classify_spot_for_skill',
    description: "Classify a spot's suitability for a skill level RIGHT NOW. Returns go/caution/avoid.",
    parameters: z.object({
      beachId: z.string().describe('Beach identifier'),
      skillLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).describe('Surfer skill level'),
    }),
    execute: async ({ beachId, skillLevel }) => {
      const beach = beaches.find(b => b.id === beachId)
      if (!beach) return JSON.stringify({ error: `Beach not found: ${beachId}` })

      const wqi = calcWqi(beach)
      const suitable = beach.skillLevel.includes(skillLevel)

      let recommendation: 'go' | 'caution' | 'avoid'
      const reasons: string[] = []

      if (suitable && wqi.wqi <= 7) {
        recommendation = 'go'
        reasons.push(`Spot is rated for ${skillLevel} surfers`)
        reasons.push(`Current WQI ${wqi.wqi}/10 is manageable`)
      } else if (suitable && wqi.wqi > 7) {
        recommendation = 'caution'
        reasons.push(`Spot is rated for ${skillLevel} but conditions are powerful (WQI ${wqi.wqi})`)
      } else {
        recommendation = skillLevel === 'beginner' ? 'avoid' : 'caution'
        reasons.push(`Spot is rated for: ${beach.skillLevel.join(', ')}`)
        reasons.push(`Wave type: ${beach.waveType.join(', ')}`)
        if (skillLevel === 'beginner' && beach.waveType.includes('hollow')) {
          reasons.push('Hollow waves are dangerous for beginners')
        }
      }

      // Find alternative if not "go"
      let alternative = null
      if (recommendation !== 'go') {
        const alt = beaches.find(b => b.id !== beachId && b.skillLevel.includes(skillLevel))
        if (alt) {
          alternative = { beachId: alt.id, name: alt.name, why: `Suited for ${skillLevel} surfers` }
        }
      }

      return JSON.stringify({ beachId, skillLevel, recommendation, wqi: wqi.wqi, reasons, alternative })
    },
  })

  // --- Find Beaches in Radius ---

  server.addTool({
    name: 'find_beaches_in_radius',
    description: 'Find beaches within a given radius (km) from GPS coordinates, sorted by distance',
    parameters: z.object({
      lat: z.number().min(-90).max(90).describe('Latitude'),
      lon: z.number().min(-180).max(180).describe('Longitude'),
      radiusKm: z.number().positive().default(50).describe('Search radius in km'),
      limit: z.number().int().positive().default(10).describe('Max results to return'),
    }),
    execute: async ({ lat, lon, radiusKm, limit }) => {
      const results = beaches
        .map(b => ({
          id: b.id,
          name: b.name,
          region: b.region,
          country: b.country,
          waveType: b.waveType,
          skillLevel: b.skillLevel,
          distanceKm: Math.round(haversineDistance({ lat, lon }, { lat: b.lat, lon: b.lon }) * 10) / 10,
        }))
        .filter(b => b.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, limit)

      return JSON.stringify(results)
    },
  })

  // --- Find Beaches Near City ---

  server.addTool({
    name: 'find_beaches_near_city',
    description: 'Find beaches near a city name. Geocodes the city first, then searches by radius.',
    parameters: z.object({
      city: z.string().describe('City name'),
      country: z.string().optional().describe('Country (helps disambiguation)'),
      radiusKm: z.number().positive().default(100).describe('Search radius in km'),
      limit: z.number().int().positive().default(10).describe('Max results'),
    }),
    execute: async ({ city, country, radiusKm, limit }) => {
      // Geocode via Nominatim
      const query = country ? `${city}, ${country}` : city
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`
      const response = await fetch(url, {
        headers: { 'User-Agent': 'mcp-surf-forecast/1.0.0' },
      })
      const data = await response.json() as Array<{ lat: string; lon: string; display_name: string }>

      if (!data.length) return JSON.stringify({ error: `Could not geocode city: ${city}` })

      const { lat, lon } = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }

      const results = beaches
        .map(b => ({
          id: b.id,
          name: b.name,
          region: b.region,
          country: b.country,
          waveType: b.waveType,
          skillLevel: b.skillLevel,
          distanceKm: Math.round(haversineDistance({ lat, lon }, { lat: b.lat, lon: b.lon }) * 10) / 10,
        }))
        .filter(b => b.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, limit)

      return JSON.stringify({ geocoded: { city: data[0].display_name, lat, lon }, results })
    },
  })

  // --- Filter Beaches ---

  server.addTool({
    name: 'filter_beaches',
    description: 'Filter beaches by region, wave type, skill level, and minimum WQI score',
    parameters: z.object({
      region: z.string().optional().describe('Region filter (e.g. "Europe", "Australia")'),
      country: z.string().optional().describe('Country filter'),
      waveType: z.string().optional().describe('Wave type (e.g. "beach-break", "reef-break")'),
      skillLevel: z.string().optional().describe('Skill level (beginner/intermediate/advanced/expert)'),
      minWqi: z.number().min(0).max(10).default(0).describe('Minimum WQI score'),
      maxResults: z.number().int().positive().default(20).describe('Max results'),
    }),
    execute: async ({ region, country, waveType, skillLevel, minWqi, maxResults }) => {
      let results = [...beaches]

      if (region) results = results.filter(b => b.region.toLowerCase() === region.toLowerCase())
      if (country) results = results.filter(b => b.country.toLowerCase() === country.toLowerCase())
      if (waveType) results = results.filter(b => b.waveType.includes(waveType))
      if (skillLevel) results = results.filter(b => b.skillLevel.includes(skillLevel))

      if (minWqi > 0) {
        results = results
          .map(b => ({ ...b, wqi: calcWqi(b).wqi }))
          .filter(b => b.wqi >= minWqi)
      }

      return JSON.stringify(results.slice(0, maxResults).map(b => ({
        id: b.id, name: b.name, region: b.region, country: b.country,
        waveType: b.waveType, skillLevel: b.skillLevel,
      })))
    },
  })

  // --- Best Sessions Today ---

  server.addTool({
    name: 'best_sessions_today',
    description: 'Return the best time windows to surf today considering swell, wind, and tide alignment',
    parameters: z.object({
      beachId: z.string().describe('Beach identifier'),
    }),
    execute: async ({ beachId }) => {
      const beach = beaches.find(b => b.id === beachId)
      if (!beach) return JSON.stringify({ error: `Beach not found: ${beachId}` })

      // TODO: Replace with real hourly forecast data
      const sessions = [
        { startTime: '06:30', endTime: '09:00', wqi: 7.2, confidence: 'high', notes: 'Dawn patrol — light winds, dropping tide' },
        { startTime: '16:00', endTime: '18:30', wqi: 6.5, confidence: 'medium', notes: 'Evening glass-off possible if wind drops' },
      ]

      return JSON.stringify({ beachId, name: beach.name, date: new Date().toISOString().split('T')[0], sessions })
    },
  })

  // --- Compare Beaches ---

  server.addTool({
    name: 'compare_beaches',
    description: 'Side-by-side forecast and WQI comparison for multiple beaches',
    parameters: z.object({
      beachIds: z.array(z.string()).min(2).max(5).describe('Beach IDs to compare (2–5)'),
      date: z.string().optional().describe('ISO date (defaults to today)'),
    }),
    execute: async ({ beachIds, date }) => {
      const comparison = beachIds.map(id => {
        const beach = beaches.find(b => b.id === id)
        if (!beach) return { beachId: id, error: 'Not found' }
        const wqi = calcWqi(beach)
        return {
          beachId: id,
          name: beach.name,
          wqi: wqi.wqi,
          label: wqi.label,
          waveType: beach.waveType,
          bestTide: beach.bestTide,
          bestSwellDir: beach.bestSwellDir,
          summary: wqi.summary,
        }
      })

      return JSON.stringify({ date: date ?? new Date().toISOString().split('T')[0], comparison })
    },
  })

  // --- Check Swell Alert ---

  server.addTool({
    name: 'check_swell_alert',
    description: 'Check if significant swell is forecasted for a beach in the next N days',
    parameters: z.object({
      beachId: z.string().describe('Beach identifier'),
      minSwellHeightM: z.number().positive().default(1.5).describe('Minimum swell height in meters'),
      daysAhead: z.number().int().positive().default(7).describe('Days to look ahead'),
    }),
    execute: async ({ beachId, minSwellHeightM, daysAhead }) => {
      const beach = beaches.find(b => b.id === beachId)
      if (!beach) return JSON.stringify({ error: `Beach not found: ${beachId}` })

      // TODO: Replace with real multi-day forecast
      return JSON.stringify({
        beachId,
        name: beach.name,
        alert: false,
        message: `No swell >= ${minSwellHeightM}m forecasted in the next ${daysAhead} days (placeholder — real API pending)`,
        windows: [],
      })
    },
  })

  // --- Wetsuit Recommendation ---

  server.addTool({
    name: 'wetsuit_recommendation',
    description: 'Recommend wetsuit type and thickness based on water temperature, wind chill, and session duration.',
    parameters: z.object({
      beachId: z.string().describe('Beach identifier'),
      timestamp: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
      sessionDurationMin: z.number().positive().default(90).describe('Planned session duration in minutes'),
    }),
    execute: async ({ beachId, timestamp, sessionDurationMin }) => {
      const beach = beaches.find(b => b.id === beachId)
      if (!beach) return JSON.stringify({ error: `Beach not found: ${beachId}` })

      // Estimate water temp by region (placeholder until real API)
      const waterTempMap: Record<string, number> = {
        'Europe': 17, 'Hawaii': 25, 'Indonesia': 28, 'Australia': 20,
        'Africa': 18, 'Brazil': 24, 'North America': 16, 'Pacific': 27,
      }
      const waterTempC = waterTempMap[beach.region] ?? 18
      const windSpeedKts = 10 // placeholder
      const airTempC = waterTempC + 4

      // Wind chill factor
      const windChillFactor = windSpeedKts > 25 ? 'severe'
        : windSpeedKts > 20 ? 'moderate'
        : windSpeedKts > 12 ? 'mild'
        : 'none' as const

      const effectiveTemp = windChillFactor === 'none' ? waterTempC
        : windChillFactor === 'mild' ? waterTempC - 1
        : windChillFactor === 'moderate' ? waterTempC - 2
        : waterTempC - 3

      // Long session adjustment
      const adjusted = sessionDurationMin > 120 ? effectiveTemp - 1 : effectiveTemp

      let type: string, thickness: string, boots = false, gloves = false, hood = false
      if (adjusted > 24) { type = 'boardshorts'; thickness = '—' }
      else if (adjusted > 21) { type = 'spring-suit'; thickness = '2mm' }
      else if (adjusted > 18) { type = 'fullsuit'; thickness = '3/2mm' }
      else if (adjusted > 15) { type = 'fullsuit'; thickness = '4/3mm'; boots = sessionDurationMin > 120 }
      else if (adjusted > 12) { type = 'fullsuit'; thickness = '5/4mm'; boots = true; gloves = true }
      else { type = 'hooded-fullsuit'; thickness = '6/5/4mm'; boots = true; gloves = true; hood = true }

      return JSON.stringify({
        beachId, name: beach.name, waterTempC, airTempC, windSpeedKts,
        windChillFactor, effectiveTemp: adjusted,
        recommendation: `${thickness} ${type}`,
        thickness, type, boots, gloves, hood,
        notes: windChillFactor !== 'none' ? `Wind chill ${windChillFactor} — feels ${waterTempC - adjusted}°C colder` : null,
      })
    },
  })

  // --- Surf Conditions Full ---

  server.addTool({
    name: 'surf_conditions_full',
    description: 'Get complete conditions for a surf session: marine, wind, weather, UV, gear, safety — all in one call.',
    parameters: z.object({
      beachId: z.string().describe('Beach identifier'),
      timestamp: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
    }),
    execute: async ({ beachId, timestamp }) => {
      const beach = beaches.find(b => b.id === beachId)
      if (!beach) return JSON.stringify({ error: `Beach not found: ${beachId}` })

      const wqi = calcWqi(beach)

      // Placeholder conditions (would come from Open-Meteo in production)
      return JSON.stringify({
        beachId, name: beach.name,
        timestamp: timestamp ?? new Date().toISOString(),
        marine: { swellHeightM: 1.5, swellPeriodS: 12, swellDirection: beach.bestSwellDir, waveHeight: 1.7, tideState: 'mid' },
        wind: { speedKts: 8, gustKts: 14, direction: beach.bestWindDir, quality: 'offshore — clean faces' },
        weather: { airTempC: 22, precipitation: 0, cloudCoverPercent: 20, visibility: 'excellent' },
        sun: { uvIndex: 6, uvRisk: 'high', sunrise: '06:42', sunset: '20:38', sunscreenReminder: true },
        ocean: { waterTempC: 17, currentSpeedKts: 0.5, currentDirection: 'S' },
        gear: { wetsuit: '4/3mm fullsuit', boots: false, gloves: false, hood: false, sunscreen: 'SPF 50+ recommended' },
        safety: { lightningRisk: false, fogWarning: false, strongCurrentWarning: false, notes: [] },
        wqi: wqi.wqi, wqiLabel: wqi.label, wqiBreakdown: wqi.breakdown,
        summary: wqi.summary,
      })
    },
  })
}
