/**
 * Generic generator for a country's spot list from a scraped raw TSV.
 * Mirrors scripts/gen-france.ts but parameterized so it serves several
 * countries (Uruguay, Argentina, …) without duplicating logic.
 *
 * ESM / TypeScript (run via tsx).
 * Run: COUNTRY="Uruguay" RAW=uruguay-raw.tsv OUT=uruguay.json SUFFIX=uy \
 *        npx tsx scripts/gen-country.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'

const COUNTRY = process.env.COUNTRY
const RAW = process.env.RAW
const OUT = process.env.OUT
const SUFFIX = process.env.SUFFIX
if (!COUNTRY || !RAW || !OUT || !SUFFIX) {
  console.error('Missing env: COUNTRY, RAW, OUT, SUFFIX are required.')
  process.exit(1)
}

const beaches = JSON.parse(
  readFileSync(new URL('../src/data/beaches.json', import.meta.url), 'utf8'),
)

const tsv = readFileSync(new URL(`./${RAW}`, import.meta.url), 'utf8')
const decode = (s) =>
  s.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
   .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))

const spots = []
const seenSlug = new Set()
let region = COUNTRY

for (const line of tsv.split('\n')) {
  if (!line.trim()) continue
  if (line.startsWith('##REGION## ')) {
    region = decode(line.slice('##REGION## '.length).trim())
    continue
  }
  if (line.startsWith('BREAK\t')) {
    const [, name, slug] = line.split('\t')
    if (!slug) continue
    if (seenSlug.has(slug)) continue
    seenSlug.add(slug)
    spots.push({ name: decode(name.trim()), slug: slug.trim(), region })
  }
}

const slugify = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const byName = new Map()
for (const b of beaches) {
  if (b.country === COUNTRY) byName.set(slugify(b.name), b)
}

const out = []
const usedIds = new Set()
for (const s of spots) {
  const existing = byName.get(slugify(s.name))
  let id = existing?.id ?? `${slugify(s.name)}-${SUFFIX}`
  if (usedIds.has(id)) {
    let i = 2
    while (usedIds.has(`${id}-${i}`)) i++
    id = `${id}-${i}`
  }
  usedIds.add(id)

  const base = {
    id,
    name: s.name,
    country: COUNTRY,
    region: s.region,
    forecastSlug: s.slug,
    forecastUrl: `https://www.surf-forecast.com/breaks/${s.slug}/forecasts/latest/six_day`,
    providers: ['surf-forecast', 'open-meteo'],
  }
  if (existing) {
    out.push({
      ...base,
      lat: existing.lat, lon: existing.lon,
      waveType: existing.waveType, skillLevel: existing.skillLevel,
      bestTide: existing.bestTide, bestSwellDir: existing.bestSwellDir,
      bestWindDir: existing.bestWindDir, camUrl: existing.camUrl ?? null,
      enriched: true,
    })
  } else {
    out.push({
      ...base,
      lat: null, lon: null, waveType: [], skillLevel: [],
      bestTide: null, bestSwellDir: null, bestWindDir: null, camUrl: null,
      enriched: false,
    })
  }
}

writeFileSync(new URL(`../src/data/${OUT}`, import.meta.url), JSON.stringify(out, null, 2) + '\n')
const regions = {}
out.forEach((o) => { regions[o.region] = (regions[o.region] || 0) + 1 })
console.log(`Wrote ${out.length} ${COUNTRY} spots to ${OUT}.`)
console.log('by region:', JSON.stringify(regions, null, 2))
