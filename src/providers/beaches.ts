/**
 * Beach repository — single source of truth for beach data.
 *
 * Merges the curated global database (beaches.json) with the enriched scraped
 * datasets (portugal.json, france.json), normalizing all to the Beach shape
 * the tools/resources expect. Curated entries win on id collisions.
 */

import globalBeaches from '../data/beaches.json' with { type: 'json' }
import portugal from '../data/portugal.json' with { type: 'json' }
import france from '../data/france.json' with { type: 'json' }

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
}

/** Normalize a scraped record to the Beach shape; drop ones without coords. */
function fromScraped(p: any): Beach | null {
  if (p.lat == null || p.lon == null) return null
  return {
    id: p.id,
    name: p.name,
    region: p.region,
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
  }
}

function buildBeaches(): Beach[] {
  const byId = new Map<string, Beach>()

  // Curated global DB first — these take precedence.
  for (const b of globalBeaches as Beach[]) {
    byId.set(b.id, b)
  }

  // Scraped datasets fill in everything not already curated.
  for (const p of [...portugal, ...france]) {
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
