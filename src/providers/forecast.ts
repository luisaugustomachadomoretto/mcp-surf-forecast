/**
 * Forecast provider — live marine + weather data from Open-Meteo.
 *
 * Two free, keyless Open-Meteo endpoints are combined:
 *   - Marine API:  swell height/period/direction, wave height, sea surface temp
 *   - Forecast API: wind speed/direction/gusts, air temp, UV index, clouds, precip
 *
 * Docs:
 *   https://open-meteo.com/en/docs/marine-weather-api
 *   https://open-meteo.com/en/docs
 *
 * Robustness:
 *   - Results are cached in-memory per (lat,lon) for CACHE_TTL_MS.
 *   - On any network/parse error the provider returns a clearly-flagged
 *     fallback (stale: true) so tools degrade gracefully instead of throwing.
 */

const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine'
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast'
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes
const FETCH_TIMEOUT_MS = 8000

/** A single hourly forecast sample. */
export interface ForecastHour {
  time: string // ISO 8601
  swellHeightM: number | null
  swellPeriodS: number | null
  swellDirectionDeg: number | null
  waveHeightM: number | null
  waterTempC: number | null
  windSpeedKts: number | null
  windGustKts: number | null
  windDirectionDeg: number | null
  airTempC: number | null
  uvIndex: number | null
  cloudCoverPercent: number | null
  precipitationMm: number | null
  /** Sea level height incl. tides, relative to global mean sea level (m). */
  seaLevelM: number | null
  /** Derived tide state at this hour (see deriveTideState). */
  tideState: 'rising' | 'falling' | 'high' | 'low' | null
  oceanCurrentKts: number | null
  oceanCurrentDirectionDeg: number | null
}

/** A full forecast result for a location. */
export interface Forecast {
  lat: number
  lon: number
  generatedAt: string
  /** IANA timezone resolved by Open-Meteo for this location (e.g. Europe/Lisbon). */
  timezone: string
  /** UTC offset in seconds for the resolved timezone (e.g. 3600 for UTC+1). */
  utcOffsetSeconds: number
  /** Hourly samples (next ~7 days depending on API). */
  hours: ForecastHour[]
  /**
   * Per-date daylight bounds keyed by local date (YYYY-MM-DD). sunrise/sunset
   * are naïve local ISO strings (no offset), matching the hourly `time` format.
   */
  daylight: Record<string, { sunrise: string; sunset: string }>
  /** True when data came from the fallback (API unavailable). */
  stale: boolean
  /** Human-readable note when stale. */
  note?: string
}

interface CacheEntry {
  expires: number
  value: Forecast
}

const cache = new Map<string, CacheEntry>()

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`
}

const KMH_TO_KTS = 0.539957

async function fetchJson(url: string): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'mcp-surf-forecast/1.0.0' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function buildMarineUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: [
      'wave_height',
      'swell_wave_height',
      'swell_wave_period',
      'swell_wave_direction',
      'sea_surface_temperature',
      'sea_level_height_msl',
      'ocean_current_velocity',
      'ocean_current_direction',
    ].join(','),
    forecast_days: '7',
    timezone: 'auto',
  })
  return `${MARINE_URL}?${params.toString()}`
}

function buildWeatherUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: [
      'wind_speed_10m',
      'wind_gusts_10m',
      'wind_direction_10m',
      'temperature_2m',
      'uv_index',
      'cloud_cover',
      'precipitation',
    ].join(','),
    wind_speed_unit: 'kn',
    forecast_days: '7',
    daily: ['sunrise', 'sunset'].join(','),
    timezone: 'auto',
  })
  return `${WEATHER_URL}?${params.toString()}`
}

function num(arr: unknown, i: number): number | null {
  if (!Array.isArray(arr)) return null
  const v = arr[i]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function mergeHourly(marine: any, weather: any): ForecastHour[] {
  const mTimes: string[] = marine?.hourly?.time ?? []
  const wTimes: string[] = weather?.hourly?.time ?? []

  // Index weather samples by timestamp for alignment with marine times.
  const wIndex = new Map<string, number>()
  wTimes.forEach((t, i) => wIndex.set(t, i))

  const times = mTimes.length ? mTimes : wTimes
  const mh = marine?.hourly ?? {}
  const wh = weather?.hourly ?? {}

  const hours = times.map((time, i) => {
    const wi = wIndex.has(time) ? (wIndex.get(time) as number) : i
    const currentKmh = num(mh.ocean_current_velocity, i)
    return {
      time,
      swellHeightM: num(mh.swell_wave_height, i),
      swellPeriodS: num(mh.swell_wave_period, i),
      swellDirectionDeg: num(mh.swell_wave_direction, i),
      waveHeightM: num(mh.wave_height, i),
      waterTempC: num(mh.sea_surface_temperature, i),
      windSpeedKts: num(wh.wind_speed_10m, wi),
      windGustKts: num(wh.wind_gusts_10m, wi),
      windDirectionDeg: num(wh.wind_direction_10m, wi),
      airTempC: num(wh.temperature_2m, wi),
      uvIndex: num(wh.uv_index, wi),
      cloudCoverPercent: num(wh.cloud_cover, wi),
      precipitationMm: num(wh.precipitation, wi),
      seaLevelM: num(mh.sea_level_height_msl, i),
      tideState: null as ForecastHour['tideState'],
      oceanCurrentKts: currentKmh == null ? null : Math.round(currentKmh * KMH_TO_KTS * 100) / 100,
      oceanCurrentDirectionDeg: num(mh.ocean_current_direction, i),
    }
  })

  deriveTideState(hours)
  return hours
}

/**
 * Parse Open-Meteo `daily.sunrise`/`daily.sunset` (naïve local ISO strings)
 * into a per-date lookup keyed by local date. Returns {} when absent.
 */
function parseDaylight(weather: any): Record<string, { sunrise: string; sunset: string }> {
  const dates: string[] = weather?.daily?.time ?? []
  const sunrise: string[] = weather?.daily?.sunrise ?? []
  const sunset: string[] = weather?.daily?.sunset ?? []
  const out: Record<string, { sunrise: string; sunset: string }> = {}
  dates.forEach((d, i) => {
    if (typeof sunrise[i] === 'string' && typeof sunset[i] === 'string') {
      out[d] = { sunrise: sunrise[i], sunset: sunset[i] }
    }
  })
  return out
}

/**
 * Derive a tide state for each hour from the sea-level curve.
 * - 'high'/'low' at local maxima/minima (turning points)
 * - 'rising'/'falling' in between, based on slope
 * Mutates the array in place. Requires >= 3 samples with seaLevelM.
 */
export function deriveTideState(hours: ForecastHour[]): void {
  const n = hours.length
  for (let i = 0; i < n; i++) {
    const cur = hours[i].seaLevelM
    if (cur == null) { hours[i].tideState = null; continue }
    const prev = i > 0 ? hours[i - 1].seaLevelM : null
    const next = i < n - 1 ? hours[i + 1].seaLevelM : null

    if (prev != null && next != null) {
      // Local extrema require a TRUE turning point: the hour must be at least
      // as high (low) as both neighbours AND strictly higher (lower) than at
      // least one. A monotonic ramp (e.g. 0,0.01,0.02) is NOT an extremum —
      // using an epsilon here would mislabel steady rises/falls as high/low.
      if (cur >= prev && cur >= next && (cur > prev || cur > next)) {
        hours[i].tideState = 'high'; continue
      }
      if (cur <= prev && cur <= next && (cur < prev || cur < next)) {
        hours[i].tideState = 'low'; continue
      }
    }
    // Slope between samples. At the final hour (next == null) or before a data
    // gap, fall back to the PREVIOUS reading so a falling curve ending in a
    // gap isn't reported as rising.
    if (next != null) {
      hours[i].tideState = next >= cur ? 'rising' : 'falling'
    } else if (prev != null) {
      hours[i].tideState = cur >= prev ? 'rising' : 'falling'
    } else {
      hours[i].tideState = null
    }
  }
}

function fallback(lat: number, lon: number, reason: string): Forecast {
  return {
    lat,
    lon,
    generatedAt: new Date().toISOString(),
    timezone: 'UTC',
    utcOffsetSeconds: 0,
    hours: [],
    daylight: {},
    stale: true,
    note: `Live forecast unavailable (${reason}). No hourly data returned.`,
  }
}

/**
 * Convert an Open-Meteo "naïve" local timestamp (e.g. "2026-10-23T09:00",
 * which carries NO timezone) into an absolute epoch-ms instant, using the
 * location's UTC offset. This is critical: `new Date("2026-10-23T09:00")`
 * would otherwise be interpreted in the PROCESS timezone (UTC in the
 * container), silently shifting every time by the local offset.
 */
export function localTimeToEpochMs(naiveIso: string, utcOffsetSeconds: number): number {
  // Treat the naïve string as UTC, then subtract the offset to get the true instant.
  const asUtc = Date.parse(naiveIso.endsWith('Z') ? naiveIso : `${naiveIso}Z`)
  return asUtc - utcOffsetSeconds * 1000
}

/**
 * Get a forecast for a location. Cached for 30 min; never throws.
 *
 * Concurrent callers for the same (lat,lon) share a single in-flight request
 * (dedup) so burst fan-out from the ranking/filter tools doesn't launch
 * duplicate upstream fetches for the same spot.
 */
export async function getForecast(lat: number, lon: number): Promise<Forecast> {
  const key = cacheKey(lat, lon)
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expires > now) return cached.value

  const pending = inflight.get(key)
  if (pending) return pending

  const promise = fetchForecast(lat, lon, key).finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, promise)
  return promise
}

const inflight = new Map<string, Promise<Forecast>>()

async function fetchForecast(lat: number, lon: number, key: string): Promise<Forecast> {
  const now = Date.now()
  try {
    const [marine, weather] = await Promise.all([
      fetchJson(buildMarineUrl(lat, lon)),
      fetchJson(buildWeatherUrl(lat, lon)),
    ])

    const hours = mergeHourly(marine, weather)
    const daylight = parseDaylight(weather)
    // Both endpoints request timezone=auto, so offsets match; prefer marine.
    const utcOffsetSeconds = Number(
      marine?.utc_offset_seconds ?? weather?.utc_offset_seconds ?? 0,
    )
    const timezone = String(marine?.timezone ?? weather?.timezone ?? 'UTC')
    const value: Forecast = {
      lat,
      lon,
      generatedAt: new Date().toISOString(),
      timezone,
      utcOffsetSeconds,
      hours,
      daylight,
      stale: hours.length === 0,
      note: hours.length === 0 ? 'API returned no hourly samples.' : undefined,
    }
    cache.set(key, { expires: now + CACHE_TTL_MS, value })
    return value
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error'
    return fallback(lat, lon, reason)
  }
}

/**
 * Pick the hourly sample closest to a target time (defaults to now).
 * Returns null if the forecast has no hours.
 */
export function sampleAt(forecast: Forecast, target: Date = new Date()): ForecastHour | null {
  return sampleWithRange(forecast, target).sample
}

export interface SampledHour {
  sample: ForecastHour | null
  /** True when the target lies outside the forecast's covered window. */
  outOfRange: boolean
  /** Hours between the requested target and the returned sample (0 if exact-ish). */
  offsetHours: number
  /** Local-time bounds of the available window, plus the timezone they're in. */
  coverage: { from: string; to: string; timezone: string; utcOffsetSeconds: number } | null
}

/**
 * Like sampleAt, but reports whether the target is outside the covered window
 * instead of silently returning the nearest edge sample.
 */
export function sampleWithRange(forecast: Forecast, target: Date = new Date()): SampledHour {
  if (!forecast.hours.length) {
    return { sample: null, outOfRange: true, offsetHours: 0, coverage: null }
  }
  const targetMs = target.getTime()
  const off = forecast.utcOffsetSeconds
  let best = forecast.hours[0]
  let bestDiff = Math.abs(localTimeToEpochMs(best.time, off) - targetMs)
  for (const h of forecast.hours) {
    const diff = Math.abs(localTimeToEpochMs(h.time, off) - targetMs)
    if (diff < bestDiff) {
      best = h
      bestDiff = diff
    }
  }
  const from = forecast.hours[0].time
  const to = forecast.hours[forecast.hours.length - 1].time
  const fromMs = localTimeToEpochMs(from, off)
  const toMs = localTimeToEpochMs(to, off)
  const outOfRange = targetMs < fromMs - 3600_000 || targetMs > toMs + 3600_000
  return {
    sample: best,
    outOfRange,
    offsetHours: Math.round(bestDiff / 3600_000),
    coverage: { from, to, timezone: forecast.timezone, utcOffsetSeconds: off },
  }
}

export { KMH_TO_KTS }

/**
 * Daylight hour bounds (local clock hours) for a given local date, derived from
 * the forecast's sunrise/sunset. Falls back to a fixed 06:00–20:00 window when
 * the date has no sunrise/sunset data.
 *
 * `startHr` is floored to the sunrise hour and `endHr` is the ceil of the
 * sunset hour, so an hourly slot is included if any of it is in daylight.
 */
export function daylightHourBounds(
  forecast: Forecast,
  localDate: string,
): { startHr: number; endHr: number; source: 'sun' | 'default' } {
  const d = forecast.daylight[localDate]
  if (!d) return { startHr: 6, endHr: 20, source: 'default' }
  const sunriseHr = Number(d.sunrise.slice(11, 13))
  const sunsetMin = Number(d.sunset.slice(14, 16))
  const sunsetHr = Number(d.sunset.slice(11, 13)) + (sunsetMin > 0 ? 1 : 0)
  if (!Number.isFinite(sunriseHr) || !Number.isFinite(sunsetHr)) {
    return { startHr: 6, endHr: 20, source: 'default' }
  }
  return { startHr: sunriseHr, endHr: Math.min(sunsetHr, 23), source: 'sun' }
}
