/**
 * Generic resumable enrichment for a country's spot file.
 * Mirrors scripts/enrich-france.ts but parameterized via FILE env.
 *
 * ESM / TypeScript (run via tsx).
 * Run:       FILE=uruguay.json npx tsx scripts/enrich-country.ts
 * Test run:  LIMIT=1 FILE=uruguay.json npx tsx scripts/enrich-country.ts
 * Force all: FORCE=1 FILE=uruguay.json npx tsx scripts/enrich-country.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILENAME = process.env.FILE
if (!FILENAME) { console.error('Missing env FILE (e.g. uruguay.json)'); process.exit(1) }
const FILE = new URL(`../src/data/${FILENAME}`, import.meta.url)
const UA = 'mcp-surf-forecast/1.0.0 (dev enrichment; contact: project maintainer)'
const DELAY_MS = 1200
const FORCE = process.env.FORCE === '1'
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : Infinity

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

function parseCoords(html) {
  const lat = html.match(/class="latitude"\s+title="(-?[0-9.]+)"/i)
  const lon = html.match(/class="longitude"\s+title="(-?[0-9.]+)"/i)
  if (!lat || !lon) return null
  const la = parseFloat(lat[1]); const lo = parseFloat(lon[1])
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
  return { lat: la, lon: lo }
}

function wordToDir(word) {
  const map = {
    north: 'N', northeast: 'NE', 'north-east': 'NE', east: 'E',
    southeast: 'SE', 'south-east': 'SE', south: 'S',
    southwest: 'SW', 'south-west': 'SW', west: 'W',
    northwest: 'NW', 'north-west': 'NW',
  }
  return map[word.toLowerCase()] ?? null
}

function textOf(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
}

function parseWaveType(text) {
  const t = text.toLowerCase()
  const types = []
  if (/beach break/.test(t)) types.push('beach-break')
  if (/reef break/.test(t)) types.push('reef-break')
  if (/point break/.test(t)) types.push('point-break')
  if (/rivermouth|river mouth/.test(t)) types.push('river-mouth')
  if (/jetty|groyne|groin/.test(t)) types.push('jetty')
  return [...new Set(types)]
}

function parseBestSwell(text) {
  const m = text.match(/best swell direction is from the ([a-z-]+)/i)
  return m ? wordToDir(m[1]) : null
}

function parseBestWind(text) {
  const m = text.match(/offshore winds? (?:are |blow |is |come )?from the ([a-z-]+)/i)
  return m ? wordToDir(m[1]) : null
}

function parseSkill(text) {
  const t = text.toLowerCase()
  const levels = []
  if (/beginner|grom|learner|easy wave|forgiving/.test(t)) levels.push('beginner')
  if (/intermediate/.test(t)) levels.push('intermediate')
  if (/advanced|experienced surfers/.test(t)) levels.push('advanced')
  if (/expert|experts only|heavy wave|dangerous|serious/.test(t)) levels.push('expert')
  return [...new Set(levels)]
}

async function main() {
  const spots = JSON.parse(readFileSync(FILE, 'utf8'))
  let done = 0; let coordsOk = 0; let failed = 0; let processed = 0
  const total = spots.length
  const failures = []

  for (const spot of spots) {
    done++
    if (!FORCE && spot.enriched && spot.lat != null) { coordsOk++; continue }
    if (processed >= LIMIT) break
    processed++

    const slug = spot.forecastSlug
    const fcUrl = `https://www.surf-forecast.com/breaks/${slug}/forecasts/latest/six_day`
    const guideUrl = `https://www.surf-forecast.com/breaks/${slug}`

    const fcHtml = await fetchText(fcUrl)
    await sleep(DELAY_MS)
    const coords = fcHtml ? parseCoords(fcHtml) : null

    const guideHtml = await fetchText(guideUrl)
    await sleep(DELAY_MS)
    const prose = guideHtml ? textOf(guideHtml) : ''

    const resolved = []
    if (coords) {
      spot.lat = coords.lat; spot.lon = coords.lon
      resolved.push('lat', 'lon'); coordsOk++
    } else {
      failed++; failures.push(`${spot.name} (${slug})`)
    }

    if (prose) {
      const wt = parseWaveType(prose)
      if (wt.length) { spot.waveType = wt; resolved.push('waveType') }
      const sw = parseBestSwell(prose)
      if (sw) { spot.bestSwellDir = sw; resolved.push('bestSwellDir') }
      const wind = parseBestWind(prose)
      if (wind) { spot.bestWindDir = wind; resolved.push('bestWindDir') }
      const sk = parseSkill(prose)
      if (sk.length) { spot.skillLevel = sk; resolved.push('skillLevel') }
    }

    spot.enriched = coords != null
    spot.enrichedFields = resolved
    spot.enrichedAt = new Date().toISOString()
    spot.source = 'surf-forecast.com'

    writeFileSync(FILE, JSON.stringify(spots, null, 2) + '\n')
    if (done % 10 === 0 || !coords) {
      console.log(`[${done}/${total}] ${spot.name} — ${coords ? `${coords.lat},${coords.lon}` : 'NO COORDS'} | ${resolved.join(',') || 'nothing'}`)
    }
  }

  console.log(`\nDone. coords ok: ${coordsOk}/${total}, failed this run: ${failed}, processed this run: ${processed}`)
  if (failures.length) {
    console.log('Failures:')
    for (const f of failures) console.log('  - ' + f)
  }
}

main()
