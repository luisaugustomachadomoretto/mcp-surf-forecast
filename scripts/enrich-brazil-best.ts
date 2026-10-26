/**
 * Enrich src/data/brazil.json best* fields (bestSwellDir, bestWindDir,
 * bestTide) from waves.com.br/wavescheck.
 *
 * waves.com.br does not publish a stated "ideal direction" per spot, but every
 * spot page embeds a quality-scored hourly forecast. We DERIVE the best
 * conditions from it:
 *   - bestWindDir  : circular-mean wind direction over OFFSHORE hours (the
 *                    offshore wind is the favourable one), bucketed to 8-point.
 *   - bestSwellDir : circular-mean swell direction over the top-quality hours.
 *   - bestTide     : dominant tide state over the top-quality hours, where the
 *                    tide height relative to the spot's own range maps to
 *                    low / mid / high (+ rising/falling nuance -> *-to-* ranges).
 *
 * Matching: our beaches carry accurate lat/lon. We fetch each waves spot page
 * once (coords embedded), cache to /tmp, then match each beach to the nearest
 * waves spot within MAX_MATCH_KM. Only confident geo-matches are updated.
 *
 * ESM / TypeScript. Run via tsx (repo convention):
 *   Run:        npx tsx scripts/enrich-brazil-best.ts
 *   Rebuild cache (ignore /tmp): FRESH=1 npx tsx scripts/enrich-brazil-best.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const FILE = new URL('../src/data/brazil.json', import.meta.url)
const CACHE = '/tmp/waves-spots-cache.json'
const BASE = 'https://www.waves.com.br'
const WAVESCHECK = `${BASE}/wavescheck/`
const UA = 'mcp-surf-forecast/1.0.0'
const DELAY_MS = 1000
const MAX_MATCH_KM = 15
const FRESH = process.env.FRESH === '1'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchText(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function extractJson(html, cls) {
  const re = new RegExp(`<script[^>]*class="${cls}"[^>]*>([\\s\\S]*?)</script>`, 'i')
  const m = html.match(re)
  return m ? m[1].trim() : null
}

function parseCoords(html) {
  const m = html.match(/"lat"\s*:\s*(-?[0-9.]+)\s*,\s*"lon"\s*:\s*(-?[0-9.]+)/i)
  if (!m) return null
  const lat = parseFloat(m[1]); const lon = parseFloat(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { lat, lon }
}

// --- geometry ---
const toRad = (d) => (d * Math.PI) / 180
function haversineKm(a, b) {
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const la1 = toRad(a.lat); const la2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const COMPASS8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
function degToCompass(deg) {
  const i = Math.round(((deg % 360) + 360) % 360 / 45) % 8
  return COMPASS8[i]
}
/** Circular mean of a list of degrees; null if empty. */
function circularMeanDeg(degs) {
  if (!degs.length) return null
  let x = 0; let y = 0
  for (const d of degs) { x += Math.cos(toRad(d)); y += Math.sin(toRad(d)) }
  if (x === 0 && y === 0) return null
  let ang = Math.atan2(y, x) * 180 / Math.PI
  return (ang + 360) % 360
}

/**
 * Derive best conditions from a spot's hourly frames.
 * Returns { bestSwellDir, bestWindDir, bestTide } (any may be null).
 */
function deriveBest(hours) {
  const valid = hours.filter((h) => typeof h.score === 'number')
  if (!valid.length) return { bestSwellDir: null, bestWindDir: null, bestTide: null }

  const maxScore = Math.max(...valid.map((h) => h.score))
  // "top-quality" = within 1 point of the spot's best, and at least decent (>=4)
  const threshold = Math.max(4, maxScore - 1)
  const top = valid.filter((h) => h.score >= threshold)
  const sample = top.length >= 3 ? top : valid.slice().sort((a, b) => b.score - a.score).slice(0, 5)

  // bestSwellDir: circular mean swell dir over top hours
  const swellDegs = sample.map((h) => h.swellDir).filter((d) => typeof d === 'number')
  const swellMean = circularMeanDeg(swellDegs)
  const bestSwellDir = swellMean == null ? null : degToCompass(swellMean)

  // bestWindDir: offshore wind direction (circular mean over offshore hours;
  // fall back to offshore hours within the whole window).
  const offshore = valid.filter((h) => h.windType === 'offshore' && typeof h.windDir === 'number')
  const windMean = circularMeanDeg(offshore.map((h) => h.windDir))
  const bestWindDir = windMean == null ? null : degToCompass(windMean)

  // bestTide: classify tide height of top hours against the spot's observed
  // tide range -> low / mid / high; blend rising/falling into *-to-* buckets.
  const tideHeights = valid.map((h) => h.tide?.height).filter((v) => typeof v === 'number')
  let bestTide = null
  if (tideHeights.length && sample.length) {
    const lo = Math.min(...tideHeights); const hi = Math.max(...tideHeights)
    const span = hi - lo
    const bucketOf = (ht) => {
      if (span < 0.15) return 'all'
      const r = (ht - lo) / span
      if (r < 0.33) return 'low'
      if (r > 0.66) return 'high'
      return 'mid'
    }
    const counts = {}
    for (const h of sample) {
      if (typeof h.tide?.height !== 'number') continue
      const b = bucketOf(h.tide.height)
      counts[b] = (counts[b] || 0) + 1
    }
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => k)
    if (ranked.length) {
      const primary = ranked[0]
      // Merge adjacent buckets into the vocab used elsewhere.
      if (ranked.includes('low') && ranked.includes('mid') && primary !== 'high') bestTide = 'low-to-mid'
      else if (ranked.includes('mid') && ranked.includes('high') && primary !== 'low') bestTide = 'mid-to-high'
      else bestTide = primary
    }
  }

  return { bestSwellDir, bestWindDir, bestTide }
}

async function buildWavesSpots() {
  if (!FRESH && existsSync(CACHE)) {
    const cached = JSON.parse(readFileSync(CACHE, 'utf8'))
    if (Array.isArray(cached) && cached.length) {
      console.log(`Using cached waves spots (${cached.length}) from ${CACHE}`)
      return cached
    }
  }

  const home = await fetchText(WAVESCHECK)
  if (!home) throw new Error('could not load wavescheck landing page')
  const idx = JSON.parse(extractJson(home, 'wpe__search-index'))
  console.log(`Catalog: ${idx.length} spots. Fetching each page for coords + forecast...`)

  const out = []
  let done = 0
  for (const s of idx) {
    done++
    const html = await fetchText(`${BASE}${s.h}`)
    await sleep(DELAY_MS)
    if (!html) { continue }
    const coords = parseCoords(html)
    let best = { bestSwellDir: null, bestWindDir: null, bestTide: null }
    try {
      const hours = JSON.parse(extractJson(html, 'wf-chart__data') || '[]')
      best = deriveBest(hours)
    } catch { /* ignore */ }
    if (coords) {
      out.push({ id: s.id, name: s.n, state: s.s, city: s.ct, path: s.h, ...coords, ...best })
    }
    if (done % 25 === 0) {
      console.log(`  [${done}/${idx.length}] cached ${out.length} with coords`)
      writeFileSync(CACHE, JSON.stringify(out, null, 2))
    }
  }
  writeFileSync(CACHE, JSON.stringify(out, null, 2))
  console.log(`Fetched ${out.length}/${idx.length} spots with coords.`)
  return out
}

async function main() {
  const spots = await buildWavesSpots()
  const beaches = JSON.parse(readFileSync(FILE, 'utf8'))

  let updated = 0; let noMatch = 0; let noData = 0
  for (const b of beaches) {
    if (b.lat == null || b.lon == null) { noMatch++; continue }
    // nearest waves spot
    let best = null; let bestKm = Infinity
    for (const s of spots) {
      const km = haversineKm({ lat: b.lat, lon: b.lon }, { lat: s.lat, lon: s.lon })
      if (km < bestKm) { bestKm = km; best = s }
    }
    if (!best || bestKm > MAX_MATCH_KM) { noMatch++; continue }

    const fields = []
    if (best.bestSwellDir) { b.bestSwellDir = best.bestSwellDir; fields.push('bestSwellDir') }
    if (best.bestWindDir) { b.bestWindDir = best.bestWindDir; fields.push('bestWindDir') }
    if (best.bestTide) { b.bestTide = best.bestTide; fields.push('bestTide') }

    if (!fields.length) { noData++; continue }

    b.bestConditionsSource = 'waves.com.br'
    b.bestConditionsMatch = { spot: best.name, city: best.city, state: best.state, distanceKm: Math.round(bestKm * 10) / 10 }
    b.enrichedFields = [...new Set([...(b.enrichedFields || []), ...fields])]
    b.enrichedAt = new Date().toISOString()
    updated++
  }

  writeFileSync(FILE, JSON.stringify(beaches, null, 2) + '\n')
  console.log(`\nUpdated ${updated} beaches. No nearby waves spot: ${noMatch}. Matched but no derivable data: ${noData}.`)
}

main()
