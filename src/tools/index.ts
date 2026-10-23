import type { FastMCP } from 'fastmcp'
import { z } from 'zod'
import { beaches } from '../providers/beaches.js'
import { haversineDistance } from '../utils/geo.js'
import { compassToDegrees } from '../utils/math.js'
import { mapWithConcurrency } from '../utils/concurrency.js'
import { calcWqi, wqiLabel } from './wqi.js'
import { getForecast, sampleAt, sampleWithRange, localTimeToEpochMs, daylightHourBounds } from '../providers/forecast.js'

/**
 * Resolve a user-supplied date/timestamp into an absolute target instant,
 * interpreted in the SPOT's local timezone.
 *
 * - A full timestamp (contains "T") is taken as-is (absolute instant).
 * - A date-only string ("2026-10-24") is anchored to local NOON on that date
 *   at the spot, so a single daytime sample is representative instead of
 *   midnight-UTC (which can land on the previous local day for -offset spots).
 * - Omitted → now.
 */
function resolveTarget(input: string | undefined, utcOffsetSeconds: number): Date {
  if (!input) return new Date()
  if (input.includes('T')) return new Date(input)
  // Date-only: local noon on that date = midnight-UTC + 12h − local offset.
  return new Date(localTimeToEpochMs(`${input}T12:00`, utcOffsetSeconds))
}

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
      const forecast = await getForecast(beach.lat, beach.lon)
      const picked = sampleWithRange(forecast, timestamp ? new Date(timestamp) : new Date())
      const result = calcWqi(beach, picked.sample)
      return JSON.stringify({
        beachId,
        timestamp: timestamp ?? new Date().toISOString(),
        sampleLocalTime: picked.sample?.time ?? null,
        timezone: forecast.timezone,
        utcOffsetSeconds: forecast.utcOffsetSeconds,
        dataStale: forecast.stale,
        outOfRange: picked.outOfRange,
        coverage: picked.coverage,
        tideState: picked.sample?.tideState ?? null,
        ...(picked.outOfRange ? { warning: `Requested time is outside the forecast window (${picked.coverage?.from} … ${picked.coverage?.to} ${forecast.timezone}); returned nearest available hour (${picked.offsetHours}h off).` } : {}),
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

      // Cap fan-out so a large radius doesn't launch hundreds of upstream
      // fetches at once (dedup in the provider shares repeats for same coords).
      const scored = (await mapWithConcurrency(candidates, 8, async (b) => {
        const forecast = await getForecast(b.lat, b.lon)
        const wqi = calcWqi(b, sampleAt(forecast))
        return { ...b, ...wqi }
      }))
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

      const forecast = await getForecast(beach.lat, beach.lon)
      const wqi = calcWqi(beach, sampleAt(forecast))
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
        results = (await mapWithConcurrency(results, 8, async (b) => {
          const forecast = await getForecast(b.lat, b.lon)
          return { ...b, wqi: calcWqi(b, sampleAt(forecast)).wqi }
        }))
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

      const forecast = await getForecast(beach.lat, beach.lon)
      if (forecast.stale || !forecast.hours.length) {
        return JSON.stringify({
          beachId, name: beach.name, date: new Date().toISOString().split('T')[0],
          dataStale: true, sessions: [],
          message: 'Live forecast unavailable — cannot compute session windows.',
        })
      }

      // "Today" in the SPOT's local timezone (not the server/UTC day).
      const off = forecast.utcOffsetSeconds
      const localNow = new Date(Date.now() + off * 1000)
      const today = localNow.toISOString().split('T')[0]
      const nowMs = Date.now()
      // Daylight bounds from the spot's sunrise/sunset for TODAY (falls back to
      // 06:00–20:00 when sun data is unavailable).
      const { startHr, endHr, source: daylightSource } = daylightHourBounds(forecast, today)
      // Score each remaining daylight hour today — skip hours that have already
      // passed so the windows are actionable.
      const hourly = forecast.hours
        .filter(h => h.time.startsWith(today))
        .filter(h => localTimeToEpochMs(h.time, off) >= nowMs - 3600_000)
        .map(h => {
          // Hour is the LOCAL clock hour — read it from the string, not Date().
          const hr = Number(h.time.slice(11, 13))
          return { time: h.time, hr, wqi: calcWqi(beach, h).wqi }
        })
        .filter(h => h.hr >= startHr && h.hr <= endHr)

      // Group consecutive hours with WQI >= 5 into session windows.
      const sessions: Array<{ startTime: string; endTime: string; wqi: number; confidence: string }> = []
      let run: typeof hourly = []
      const flush = () => {
        if (run.length) {
          const peak = Math.max(...run.map(r => r.wqi))
          const fmt = (iso: string) => iso.slice(11, 16)
          // Each qualifying hour is a 1-hour slot; the session ends at the NEXT
          // hourly boundary after the last good hour (a 07:00–08:00 run spans
          // 07:00→08:00, not a zero-length 07:00→07:00).
          const last = run[run.length - 1]
          const endHr = (last.hr + 1) % 24
          sessions.push({
            startTime: fmt(run[0].time),
            endTime: `${String(endHr).padStart(2, '0')}:00`,
            wqi: Math.round(peak * 10) / 10,
            confidence: peak >= 7 ? 'high' : peak >= 6 ? 'medium' : 'low',
          })
        }
        run = []
      }
      for (const h of hourly) {
        if (h.wqi >= 5) run.push(h)
        else flush()
      }
      flush()

      sessions.sort((a, b) => b.wqi - a.wqi)
      return JSON.stringify({
        beachId, name: beach.name, date: today, dataStale: false,
        timezone: forecast.timezone, utcOffsetSeconds: forecast.utcOffsetSeconds,
        timeNote: 'Session times are in the spot local timezone.',
        daylight: {
          from: `${String(startHr).padStart(2, '0')}:00`,
          to: `${String(endHr).padStart(2, '0')}:00`,
          source: daylightSource === 'sun' ? 'sunrise/sunset' : 'default (06:00–20:00)',
        },
        sessions,
      })
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
      const comparison = await Promise.all(beachIds.map(async (id) => {
        const beach = beaches.find(b => b.id === id)
        if (!beach) return { beachId: id, error: 'Not found' }
        const forecast = await getForecast(beach.lat, beach.lon)
        // Interpret the requested date in THIS beach's local timezone, and
        // report when it lands outside the covered window instead of silently
        // returning the nearest edge hour.
        const target = resolveTarget(date, forecast.utcOffsetSeconds)
        const picked = sampleWithRange(forecast, target)
        const sample = picked.sample
        const wqi = calcWqi(beach, sample)
        return {
          beachId: id,
          name: beach.name,
          wqi: wqi.wqi,
          label: wqi.label,
          sampleLocalTime: sample?.time ?? null,
          timezone: forecast.timezone,
          dataStale: forecast.stale,
          outOfRange: picked.outOfRange,
          swellHeightM: sample?.swellHeightM ?? null,
          swellPeriodS: sample?.swellPeriodS ?? null,
          windSpeedKts: sample?.windSpeedKts ?? null,
          waveType: beach.waveType,
          bestTide: beach.bestTide,
          bestSwellDir: beach.bestSwellDir,
          summary: wqi.summary,
          ...(picked.outOfRange ? { warning: `Requested date is outside this spot's forecast window (${picked.coverage?.from} … ${picked.coverage?.to} ${forecast.timezone}); using nearest hour (${picked.offsetHours}h off).` } : {}),
        }
      }))

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

      const forecast = await getForecast(beach.lat, beach.lon)
      if (forecast.stale || !forecast.hours.length) {
        return JSON.stringify({
          beachId, name: beach.name, alert: false, dataStale: true,
          message: 'Live forecast unavailable — cannot check swell.', windows: [],
        })
      }

      const off = forecast.utcOffsetSeconds
      const nowMs = Date.now()
      const cutoff = nowMs + daysAhead * 24 * 60 * 60 * 1000
      const windows = forecast.hours
        // Use the absolute instant (offset-aware) for both bounds so non-UTC
        // spots aren't shifted, and already-past hours don't trigger alerts.
        .filter(h => {
          const atMs = localTimeToEpochMs(h.time, off)
          return atMs >= nowMs && atMs <= cutoff
        })
        .filter(h => (h.swellHeightM ?? 0) >= minSwellHeightM)
        .map(h => ({
          timestamp: new Date(localTimeToEpochMs(h.time, off)).toISOString(),
          localTime: h.time,
          swellHeightM: h.swellHeightM,
          swellPeriodS: h.swellPeriodS,
          swellDirectionDeg: h.swellDirectionDeg,
        }))

      return JSON.stringify({
        beachId, name: beach.name,
        alert: windows.length > 0,
        message: windows.length
          ? `Swell >= ${minSwellHeightM}m found in ${windows.length} hourly window(s) over the next ${daysAhead} days.`
          : `No swell >= ${minSwellHeightM}m forecasted in the next ${daysAhead} days.`,
        peakSwellM: windows.length ? Math.max(...windows.map(w => w.swellHeightM ?? 0)) : null,
        timezone: forecast.timezone,
        utcOffsetSeconds: off,
        timeNote: 'timestamp is UTC (absolute); localTime is in the spot local timezone.',
        windows: windows.slice(0, 48),
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

      const forecast = await getForecast(beach.lat, beach.lon)
      const picked = sampleWithRange(forecast, resolveTarget(timestamp, forecast.utcOffsetSeconds))
      const sample = picked.sample

      // Fallback water temps by region if the live sample is missing.
      const waterTempMap: Record<string, number> = {
        'Europe': 17, 'Hawaii': 25, 'Indonesia': 28, 'Australia': 20,
        'Africa': 18, 'Brazil': 24, 'North America': 16, 'Pacific': 27,
      }
      const waterTempC = sample?.waterTempC ?? waterTempMap[beach.region] ?? 18
      const windSpeedKts = sample?.windSpeedKts ?? 10
      const airTempC = sample?.airTempC ?? waterTempC + 4

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
        beachId, name: beach.name,
        waterTempC: Math.round(waterTempC * 10) / 10,
        airTempC: Math.round(airTempC * 10) / 10,
        windSpeedKts: Math.round(windSpeedKts * 10) / 10,
        dataStale: forecast.stale,
        outOfRange: picked.outOfRange,
        sampleLocalTime: sample?.time ?? null,
        timezone: forecast.timezone,
        ...(picked.outOfRange ? { warning: `Requested time is outside the forecast window (${picked.coverage?.from} … ${picked.coverage?.to} ${forecast.timezone}); using nearest hour (${picked.offsetHours}h off) — recommendation may not reflect the requested time.` } : {}),
        windChillFactor, effectiveTemp: Math.round(adjusted * 10) / 10,
        recommendation: `${thickness} ${type}`,
        thickness, type, boots, gloves, hood,
        notes: windChillFactor !== 'none' ? `Wind chill ${windChillFactor} — feels ${Math.round((waterTempC - adjusted) * 10) / 10}°C colder` : null,
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

      const forecast = await getForecast(beach.lat, beach.lon)
      const picked = sampleWithRange(forecast, timestamp ? new Date(timestamp) : new Date())
      const sample = picked.sample
      const wqi = calcWqi(beach, sample)

      if (!sample || forecast.stale) {
        return JSON.stringify({
          beachId, name: beach.name,
          timestamp: timestamp ?? new Date().toISOString(),
          dataStale: true,
          message: 'Live forecast unavailable — conditions could not be retrieved.',
          wqi: wqi.wqi, wqiLabel: wqi.label,
        })
      }

      const windSpeed = sample.windSpeedKts ?? 0
      const windAngle = sample.windDirectionDeg != null
        ? (() => {
            const diff = Math.abs(sample.windDirectionDeg! - compassToDegrees(beach.bestWindDir))
            return diff > 180 ? 360 - diff : diff
          })()
        : null
      const windQuality = windAngle == null ? 'unknown'
        : windAngle <= 45 ? 'offshore — clean faces'
        : windAngle <= 90 ? 'cross-shore — some texture'
        : 'onshore — choppy/blown out'

      const uv = sample.uvIndex ?? 0
      const uvRisk = uv >= 8 ? 'very high' : uv >= 6 ? 'high' : uv >= 3 ? 'moderate' : 'low'

      // Derive wetsuit from live water temp.
      const waterTempC = sample.waterTempC ?? 17
      let wetsuit: string
      if (waterTempC > 24) wetsuit = 'boardshorts'
      else if (waterTempC > 21) wetsuit = '2mm spring-suit'
      else if (waterTempC > 18) wetsuit = '3/2mm fullsuit'
      else if (waterTempC > 15) wetsuit = '4/3mm fullsuit'
      else if (waterTempC > 12) wetsuit = '5/4mm fullsuit + boots'
      else wetsuit = '6/5/4mm hooded fullsuit + boots & gloves'

      // Safety heuristics from available data.
      const precip = sample.precipitationMm ?? 0
      const gust = sample.windGustKts ?? windSpeed
      const safetyNotes: string[] = []
      // Prefer the live ocean-current reading; fall back to swell-size heuristic.
      const currentKts = sample.oceanCurrentKts
      const strongCurrentWarning = (currentKts != null && currentKts >= 1.5) || (sample.swellHeightM ?? 0) > 2.5
      if (strongCurrentWarning) {
        safetyNotes.push(currentKts != null && currentKts >= 1.5
          ? `Strong ocean current (~${currentKts} kts) — mind the rips.`
          : 'Large swell — expect strong rips/currents.')
      }
      const fogWarning = (sample.cloudCoverPercent ?? 0) >= 98 && precip === 0 && windSpeed < 3
      if (fogWarning) safetyNotes.push('Possible fog / very low visibility (saturated, near-calm).')
      // Open-Meteo has no direct lightning field here; flag heavy rain + strong gusts as a proxy.
      const lightningRisk = precip > 5 && gust > 25
      if (lightningRisk) safetyNotes.push('Storm conditions (heavy rain + strong gusts) — lightning possible, do not surf.')

      return JSON.stringify({
        beachId, name: beach.name,
        timestamp: timestamp ?? new Date().toISOString(),
        sampleLocalTime: sample.time,
        timezone: forecast.timezone,
        utcOffsetSeconds: forecast.utcOffsetSeconds,
        timeNote: 'timestamp is UTC (absolute); sampleLocalTime and all forecast times are in the spot local timezone.',
        dataStale: false,
        outOfRange: picked.outOfRange,
        coverage: picked.coverage,
        ...(picked.outOfRange ? { warning: `Requested time is outside the forecast window (${picked.coverage?.from} … ${picked.coverage?.to}); showing nearest hour (${picked.offsetHours}h off).` } : {}),
        marine: {
          swellHeightM: sample.swellHeightM,
          swellPeriodS: sample.swellPeriodS,
          swellDirectionDeg: sample.swellDirectionDeg,
          waveHeightM: sample.waveHeightM,
        },
        tide: {
          state: sample.tideState,
          seaLevelM: sample.seaLevelM,
          note: sample.tideState == null
            ? 'No tide data for this location (Open-Meteo sea-level grid gap).'
            : 'Relative to global mean sea level (MSL), not a nautical chart datum. Coastal accuracy is limited (Open-Meteo ~8km grid) and unsuitable for navigation.',
        },
        wind: {
          speedKts: sample.windSpeedKts,
          gustKts: sample.windGustKts,
          directionDeg: sample.windDirectionDeg,
          quality: windQuality,
        },
        weather: {
          airTempC: sample.airTempC,
          precipitationMm: precip,
          cloudCoverPercent: sample.cloudCoverPercent,
        },
        sun: {
          uvIndex: uv,
          uvRisk,
          sunscreenReminder: uv >= 3,
          advice: uv >= 6 ? 'SPF 50+, zinc on face, reapply every 90 min' : uv >= 3 ? 'SPF 30+ recommended' : 'Low UV — minimal protection needed',
        },
        ocean: { waterTempC, currentKts: sample.oceanCurrentKts, currentDirectionDeg: sample.oceanCurrentDirectionDeg },
        gear: { wetsuit, sunscreen: uv >= 6 ? 'SPF 50+' : 'SPF 30+' },
        safety: { lightningRisk, fogWarning, strongCurrentWarning, notes: safetyNotes },
        wqi: wqi.wqi, wqiLabel: wqi.label, wqiBreakdown: wqi.breakdown,
        summary: wqi.summary,
      })
    },
  })

  // --- Forecast By Day ---

  server.addTool({
    name: 'forecast_by_day',
    description: 'Day-by-day surf outlook for the next N days (up to 7): daily WQI peak, best daylight window, swell/wind/tide summary. Use this instead of guessing hour offsets for the weekend.',
    parameters: z.object({
      beachId: z.string().describe('Beach identifier'),
      days: z.number().int().min(1).max(7).default(7).describe('How many days ahead to summarize (1–7)'),
    }),
    execute: async ({ beachId, days }) => {
      const beach = beaches.find(b => b.id === beachId)
      if (!beach) return JSON.stringify({ error: `Beach not found: ${beachId}` })

      const forecast = await getForecast(beach.lat, beach.lon)
      if (forecast.stale || !forecast.hours.length) {
        return JSON.stringify({
          beachId, name: beach.name, dataStale: true, days: [],
          message: 'Live forecast unavailable — cannot build daily outlook.',
        })
      }

      // Group hours by local date (the ISO time is already local via timezone=auto).
      const byDate = new Map<string, typeof forecast.hours>()
      for (const h of forecast.hours) {
        const date = h.time.slice(0, 10)
        if (!byDate.has(date)) byDate.set(date, [])
        byDate.get(date)!.push(h)
      }

      const nowMs = Date.now()
      const off = forecast.utcOffsetSeconds
      // Local "today" at the spot, so we don't spend a day slot on a past date.
      const localToday = new Date(nowMs + off * 1000).toISOString().slice(0, 10)
      const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
      const max = (xs: number[]) => xs.length ? Math.max(...xs) : null
      const r1 = (n: number | null) => n == null ? null : Math.round(n * 10) / 10

      const out = [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        // Drop past local dates BEFORE limiting, so `days` future days are kept
        // even if the API returned an earlier local date near midnight.
        .filter(([date]) => date >= localToday)
        .slice(0, days)
        .map(([date, hrs]) => {
          // Date-specific daylight bounds (sunrise/sunset); fixed 06–20 fallback.
          const { startHr, endHr } = daylightHourBounds(forecast, date)
          // Score daylight hours; for today, skip hours already passed.
          // Hour is read from the LOCAL time string; "passed" uses the real instant.
          const daylight = hrs.filter(h => {
            const hr = Number(h.time.slice(11, 13))
            if (hr < startHr || hr > endHr) return false
            return localTimeToEpochMs(h.time, off) >= nowMs - 3600_000
          })
          const scored = daylight.map(h => ({ time: h.time, wqi: calcWqi(beach, h).wqi, h }))

          // Best single daylight hour.
          let best = scored[0]
          for (const s of scored) if (!best || s.wqi > best.wqi) best = s

          const swellHeights = hrs.map(h => h.swellHeightM).filter((v): v is number => v != null)
          const winds = hrs.map(h => h.windSpeedKts).filter((v): v is number => v != null)
          const tideStates = [...new Set(hrs.map(h => h.tideState).filter(Boolean))]

          return {
            date,
            dayWqiPeak: best ? r1(best.wqi) : null,
            dayWqiAvg: r1(avg(scored.map(s => s.wqi))),
            label: best ? wqiLabel(best.wqi) : 'n/a',
            bestWindow: best ? best.time.slice(11, 16) : null,
            swellPeakM: r1(max(swellHeights)),
            swellAvgM: r1(avg(swellHeights)),
            windAvgKts: r1(avg(winds)),
            swellDirectionDeg: best?.h.swellDirectionDeg ?? null,
            tideStates,
            daylightHoursScored: scored.length,
          }
        })

      return JSON.stringify({
        beachId, name: beach.name,
        dataStale: false,
        timezone: forecast.timezone,
        utcOffsetSeconds: forecast.utcOffsetSeconds,
        timeNote: 'All dates/times are in the spot local timezone.',
        coverage: { from: forecast.hours[0].time, to: forecast.hours[forecast.hours.length - 1].time },
        days: out,
      })
    },
  })
}
