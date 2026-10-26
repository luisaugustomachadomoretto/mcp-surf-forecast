/**
 * Beach repository — single source of truth for beach data.
 *
 * Merges the curated global database (beaches.json) with the enriched scraped
 * datasets (portugal.json, spain.json, france.json, brazil.json, uruguay.json,
 * argentina.json, el-salvador.json), normalizing all to the Beach shape the
 * tools/resources expect. Curated entries win on id collisions.
 */

import globalBeaches from '../data/beaches.json' with { type: 'json' }
import portugal from '../data/portugal.json' with { type: 'json' }
import spain from '../data/spain.json' with { type: 'json' }
import france from '../data/france.json' with { type: 'json' }
import brazil from '../data/brazil.json' with { type: 'json' }
import uruguay from '../data/uruguay.json' with { type: 'json' }
import argentina from '../data/argentina.json' with { type: 'json' }
import elSalvador from '../data/el-salvador.json' with { type: 'json' }

export interface Beach {
  id: string
  name: string
  region: string
  country: string
  lat: number
  lon: number
  waveType: string[]
  skillLevel: string[]
  bestTide: string
  bestSwellDir: string
  bestWindDir: string
  providers: string[]
  camUrl: string | null
  /** Optional link to the external forecast page (scraped datasets). */
  forecastUrl?: string
  /** Source subregion (e.g. "Algarve", "Landes") when normalized from scraped data. */
  subregion?: string
}

/**
 * Map a country to the coarse region vocabulary used by the curated DB and the
 * filter_beaches tool. Scraped datasets store subregions (Algarve, Landes…) in
 * their region field, which would otherwise be excluded by an exact-match
 * region filter like region: 'Europe'.
 */
const COUNTRY_TO_REGION: Record<string, string> = {
  Portugal: 'Europe',
  Spain: 'Europe',
  France: 'Europe',
  Brazil: 'Brazil',
  Uruguay: 'South America',
  Argentina: 'South America',
  'El Salvador': 'North America',
}

/** Normalize a scraped record to the Beach shape; drop ones without coords. */
function fromScraped(p: any): Beach | null {
  if (p.lat == null || p.lon == null) return null
  // Normalize to the coarse region vocabulary (e.g. "Europe") so these records
  // are matched by filter_beaches; keep the source subregion separately.
  const normalizedRegion = COUNTRY_TO_REGION[p.country] ?? p.region
  const subregion = normalizedRegion !== p.region ? p.region : undefined
  return {
    id: p.id,
    name: p.name,
    region: normalizedRegion,
    country: p.country,
    lat: p.lat,
    lon: p.lon,
    waveType: Array.isArray(p.waveType) ? p.waveType : [],
    skillLevel: Array.isArray(p.skillLevel) ? p.skillLevel : [],
    // Fall back to neutral defaults when the source didn't state a value,
    // so the WQI engine and filters have something safe to work with.
    bestTide: p.bestTide ?? 'all',
    bestSwellDir: p.bestSwellDir ?? 'W',
    bestWindDir: p.bestWindDir ?? 'E',
    providers: Array.isArray(p.providers) ? p.providers : ['surf-forecast', 'open-meteo'],
    camUrl: p.camUrl ?? null,
    forecastUrl: p.forecastUrl,
    subregion,
  }
}

function buildBeaches(): Beach[] {
  const byId = new Map<string, Beach>()

  // Curated global DB first — these take precedence.
  for (const b of globalBeaches as Beach[]) {
    byId.set(b.id, b)
  }

  // Scraped datasets fill in everything not already curated.
  for (const p of [...portugal, ...spain, ...france, ...brazil, ...uruguay, ...argentina, ...elSalvador]) {
    const beach = fromScraped(p)
    if (beach && !byId.has(beach.id)) {
      byId.set(beach.id, beach)
    }
  }

  return [...byId.values()]
}

/** The merged, deduplicated beach list used across the server. */
export const beaches: Beach[] = buildBeaches()

export function getBeachById(id: string): Beach | undefined {
  return beaches.find(b => b.id === id)
}

/**
 * Compact index entry — the minimal fields needed to locate/choose a beach
 * without shipping the full profile. Used by list resources to avoid
 * overloading the model's context with hundreds of full records.
 */
export interface BeachIndexEntry {
  id: string
  name: string
  country: string
  region: string
  subregion?: string
  lat: number
  lon: number
}

function toIndexEntry(b: Beach): BeachIndexEntry {
  const e: BeachIndexEntry = {
    id: b.id,
    name: b.name,
    country: b.country,
    region: b.region,
    lat: b.lat,
    lon: b.lon,
  }
  if (b.subregion) e.subregion = b.subregion
  return e
}

/** Sorted list of distinct countries present in the merged dataset. */
export function listCountries(): string[] {
  return [...new Set(beaches.map(b => b.country))].sort((a, b) => a.localeCompare(b))
}

/**
 * Per-country counts — a tiny summary suitable as the default "all beaches"
 * payload so clients can drill down by country block instead of fetching
 * everything at once.
 */
export function countryCounts(): Array<{ country: string; count: number }> {
  const counts = new Map<string, number>()
  for (const b of beaches) counts.set(b.country, (counts.get(b.country) ?? 0) + 1)
  return [...counts.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => a.country.localeCompare(b.country))
}

/** Case-insensitive country match. */
function matchCountry(b: Beach, country: string): boolean {
  return b.country.toLowerCase() === country.toLowerCase()
}

/** Full profiles for a single country block. */
export function getBeachesByCountry(country: string): Beach[] {
  return beaches.filter(b => matchCountry(b, country))
}

/** Compact index entries for a single country block. */
export function getBeachIndexByCountry(country: string): BeachIndexEntry[] {
  return getBeachesByCountry(country).map(toIndexEntry)
}
