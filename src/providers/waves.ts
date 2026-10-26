/**
 * Waves.com.br provider — Brazilian surf conditions & forecast.
 *
 * Source: https://www.waves.com.br/wavescheck/
 *
 * Waves.com.br is a WordPress site with no public JSON API, but every page
 * embeds structured JSON in <script type="application/json"> blocks:
 *   - The wavescheck landing page embeds a full spot catalog
 *     (`wpe__search-index`): id, name, country, state, city, canonical path.
 *   - Each spot page embeds an hourly forecast (`wf-chart__data`) and a
 *     per-day summary (`wf-chart__daily-summary`).
 *
 * This module scrapes those embedded payloads and normalizes them. Results are
 * cached in-memory. On any network/parse error the provider degrades
 * gracefully (returns a stale-flagged fallback or null) instead of throwing.
 */

const BASE = 'https://www.waves.com.br'
const WAVESCHECK_URL = `${BASE}/wavescheck/`
const UA = 'mcp-surf-forecast/1.0.0'
const FETCH_TIMEOUT_MS = 8000
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000 // 6h — catalog changes rarely
const CONDITIONS_TTL_MS = 30 * 60 * 1000 // 30min — conditions are live

/** A spot entry from the waves.com.br catalog. */
export interface WavesSpot {
  id: number
  /** Spot name, e.g. "Maresias". */
  name: string
  /** Country (always "Brasil" for this source). */
  country: string
  /** State code, e.g. "SP", "SC", "RJ". */
  state: string
  /** City / municipality, e.g. "São Sebastião". */
  city: string
  /** Canonical spot path on waves.com.br (relative). */
  path: string
}

/** One hourly forecast frame for a spot. */
export interface WavesHour {
  time: string // local ISO, e.g. "2026-10-26T00:00"
  waveHeightM: number | null
  periodS: number | null
  swellDirectionDeg: number | null
  swellCompass: string | null
  windSpeedKmh: number | null
  windDirectionDeg: number | null
  windCompass: string | null
  windType: string | null // onshore / offshore / cross
  /** waves.com.br quality score 0–10. */
  score: number | null
  scoreLabel: string | null
  tideHeightM: number | null
  tideDirection: string | null
  weatherSlug: string | null
  airTempC: number | null
  waterTempC: number | null
}

/** A per-day summary for a spot. */
export interface WavesDaySummary {
  date: string // YYYY-MM-DD
  airTempMinC: number | null
  airTempMaxC: number | null
  uvMax: number | null
  uvDescriptor: string | null
  waterTempC: number | null
  weatherSlug: string | null
  tideHeightM: number | null
  tideDirection: string | null
}

/** Full conditions payload for a spot. */
export interface WavesConditions {
  spotPath: string
  url: string
  generatedAt: string
  hours: WavesHour[]
  daily: WavesDaySummary[]
  stale: boolean
  note?: string
}

interface CacheEntry<T> {
  expires: number
  value: T
}

let catalogCache: CacheEntry<WavesSpot[]> | null = null
const conditionsCache = new Map<string, CacheEntry<WavesConditions>>()

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

/** Extract the inner text of a <script type="application/json" class="X"> block. */
function extractJsonScript(html: string, className: string): string | null {
  const re = new RegExp(
    `<script[^>]*class="${className}"[^>]*>([\\s\\S]*?)</script>`,
    'i',
  )
  const m = html.match(re)
  return m ? m[1].trim() : null
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * Fetch and cache the full Brazilian spot catalog from the wavescheck page.
 * Returns an empty array on failure (never throws).
 */
export async function getWavesCatalog(): Promise<WavesSpot[]> {
  const now = Date.now()
  if (catalogCache && catalogCache.expires > now) return catalogCache.value

  try {
    const html = await fetchText(WAVESCHECK_URL)
    const raw = extractJsonScript(html, 'wpe__search-index')
    if (!raw) throw new Error('search index not found')
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>
    const spots: WavesSpot[] = parsed
      .filter((x) => x && typeof x.h === 'string')
      .map((x) => ({
        id: Number(x.id),
        name: String(x.n ?? ''),
        country: String(x.c ?? 'Brasil'),
        state: String(x.s ?? ''),
        city: String(x.ct ?? ''),
        path: String(x.h ?? ''),
      }))
    catalogCache = { expires: now + CATALOG_TTL_MS, value: spots }
    return spots
  } catch {
    // Serve a stale cache if we have one, otherwise empty.
    return catalogCache?.value ?? []
  }
}

function parseHours(raw: string | null): WavesHour[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as Array<Record<string, any>>
    return arr.map((h) => ({
      time: String(h.time ?? ''),
      waveHeightM: num(h.height),
      periodS: num(h.period),
      swellDirectionDeg: num(h.swellDir),
      swellCompass: h.swellCompass ?? null,
      windSpeedKmh: num(h.windSpeed),
      windDirectionDeg: num(h.windDir),
      windCompass: h.windCompass ?? null,
      windType: h.windType ?? null,
      score: num(h.score),
      scoreLabel: h.scoreLabel ?? null,
      tideHeightM: num(h.tide?.height),
      tideDirection: h.tide?.direction ?? null,
      weatherSlug: h.weather?.slug ?? null,
      airTempC: num(h.weather?.tempC),
      waterTempC: num(h.weather?.waterTempC),
    }))
  } catch {
    return []
  }
}

function parseDaily(raw: string | null): WavesDaySummary[] {
  if (!raw) return []
  try {
    const obj = JSON.parse(raw) as Record<string, any>
    return Object.entries(obj).map(([date, d]) => ({
      date,
      airTempMinC: num(d.tempMin),
      airTempMaxC: num(d.tempMax),
      uvMax: num(d.uvMax),
      uvDescriptor: d.uvDescriptor ?? null,
      waterTempC: num(d.waterTemp),
      weatherSlug: d.conditionSlug ?? null,
      tideHeightM: num(d.tide?.height),
      tideDirection: d.tide?.direction ?? null,
    }))
  } catch {
    return []
  }
}

/**
 * Fetch live conditions for a spot by its canonical waves.com.br path
 * (e.g. "/surf/ondas/picos/sp/sao-sebastiao/maresias/"). Cached per path.
 * Returns a stale-flagged payload on failure (never throws).
 */
export async function getWavesConditions(spotPath: string): Promise<WavesConditions> {
  const path = spotPath.startsWith('/') ? spotPath : `/${spotPath}`
  const url = `${BASE}${path}`
  const now = Date.now()
  const cached = conditionsCache.get(path)
  if (cached && cached.expires > now) return cached.value

  try {
    const html = await fetchText(url)
    const hours = parseHours(extractJsonScript(html, 'wf-chart__data'))
    const daily = parseDaily(extractJsonScript(html, 'wf-chart__daily-summary'))
    if (hours.length === 0 && daily.length === 0) {
      throw new Error('no forecast data in page')
    }
    const value: WavesConditions = {
      spotPath: path,
      url,
      generatedAt: new Date().toISOString(),
      hours,
      daily,
      stale: false,
    }
    conditionsCache.set(path, { expires: now + CONDITIONS_TTL_MS, value })
    return value
  } catch (err) {
    if (cached) return cached.value
    return {
      spotPath: path,
      url,
      generatedAt: new Date().toISOString(),
      hours: [],
      daily: [],
      stale: true,
      note: `Could not load live conditions from waves.com.br (${(err as Error).message}).`,
    }
  }
}
