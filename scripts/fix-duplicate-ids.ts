/**
 * One-time (idempotent) fix for duplicate `id`s within a country dataset.
 *
 * Some spots share a name across different regions (e.g. "Luz" in Douro and
 * Minho vs Algarve). Because ids are derived from the name, these collided and
 * the Map-based merge in src/providers/beaches.ts silently dropped the second
 * record — losing a real, distinct break.
 *
 * This script keeps the FIRST occurrence of each id untouched and renames every
 * subsequent collision to `<base>-<regionSlug><countrySuffix>`, preserving the
 * trailing country suffix (-pt, -es, …) when present. Safe to re-run: ids that
 * are already unique are left as-is.
 *
 * ESM / TypeScript (run via tsx):
 *   FILES="portugal.json,spain.json" npx tsx scripts/fix-duplicate-ids.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'

const FILES = (process.env.FILES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (!FILES.length) {
  console.error('Missing env FILES (comma-separated, e.g. "portugal.json,spain.json")')
  process.exit(1)
}

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Split a trailing 2-letter country suffix (e.g. "-pt") off an id. */
function splitSuffix(id: string): { base: string; suffix: string } {
  const m = id.match(/^(.*)-([a-z]{2})$/)
  if (m) return { base: m[1], suffix: `-${m[2]}` }
  return { base: id, suffix: '' }
}

for (const file of FILES) {
  const url = new URL(`../src/data/${file}`, import.meta.url)
  const records: Array<Record<string, any>> = JSON.parse(readFileSync(url, 'utf8'))

  const used = new Set<string>()
  const renames: Array<{ from: string; to: string; region: string }> = []

  for (const rec of records) {
    if (!used.has(rec.id)) {
      used.add(rec.id)
      continue
    }
    // Collision: build a region-disambiguated id, preserving the suffix.
    const { base, suffix } = splitSuffix(rec.id)
    const regionSlug = slugify(rec.region ?? 'x')
    let candidate = `${base}-${regionSlug}${suffix}`
    if (used.has(candidate)) {
      let i = 2
      while (used.has(`${candidate}-${i}`)) i++
      candidate = `${candidate}-${i}`
    }
    renames.push({ from: rec.id, to: candidate, region: rec.region })
    rec.id = candidate
    used.add(candidate)
  }

  if (renames.length) {
    writeFileSync(url, JSON.stringify(records, null, 2) + '\n')
    console.log(`${file}: renamed ${renames.length} duplicate id(s):`)
    for (const r of renames) console.log(`  ${r.from} -> ${r.to}  [${r.region}]`)
  } else {
    console.log(`${file}: no duplicate ids (nothing to do).`)
  }
}
