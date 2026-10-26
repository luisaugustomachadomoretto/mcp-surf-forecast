# Data generation scripts

One-off tooling to build and enrich the per-country beach datasets in
`src/data/*.json`. These are **not** part of the runtime server — they only
produce the JSON the server imports.

All scripts are run with [`tsx`](https://github.com/privatenumber/tsx):
`npx tsx scripts/<name>.ts`.

## Pipeline

1. **Scrape** the surf-forecast.com country directory into a raw TSV
   (`<country>-raw.tsv`). Each line is either `##REGION## <name>` or
   `BREAK\t<name>\t<forecastSlug>`.
2. **Generate** the base dataset (`gen-country.ts`) — merges any curated
   entries from `beaches.json`, leaves coords/attributes null.
3. **Enrich** (`enrich-country.ts`) — reverse-geolocates each break via
   surf-forecast.com and parses wave type / swell / wind / skill from the page.

### Generic generator — `gen-country.ts`

```bash
COUNTRY="Uruguay" RAW=uruguay-raw.tsv OUT=uruguay.json SUFFIX=uy \
  npx tsx scripts/gen-country.ts
```

### Generic enricher — `enrich-country.ts`

Resumable (skips already-enriched rows). Env: `FILE` (required), `LIMIT`
(test a few), `FORCE=1` (re-enrich everything).

```bash
FILE=uruguay.json npx tsx scripts/enrich-country.ts
```

## Country-specific / special scripts

- `gen-portugal.ts`, `gen-spain.ts` — older generators that **embed** their
  raw break list inline (no `-raw.tsv`). Kept because they are the only record
  of that source data.
- `enrich-brazil-best.ts` — derives `bestSwellDir` / `bestWindDir` / `bestTide`
  for Brazil from waves.com.br's quality-scored forecast, matched by geo
  proximity. Brazil-only (waves.com.br covers only Brazil).
- `fix-duplicate-ids.ts` — idempotent fix for spots that share a name across
  regions and collide on `id`. Renames later collisions to
  `<base>-<regionSlug><suffix>` so no record is dropped by the merge.
  `FILES="portugal.json,spain.json" npx tsx scripts/fix-duplicate-ids.ts`

## Raw TSVs

`france-raw.tsv`, `brazil-raw.tsv`, `uruguay-raw.tsv`, `argentina-raw.tsv`,
`el-salvador-raw.tsv` — regenerate their datasets with `gen-country.ts`.
