# 07 — Inspector & Testing

## Overview

Quality assurance strategy covering MCP Inspector usage (runtime validation) and automated testing (unit + integration). Testing follows the same SOLID boundaries as the code — each module is tested in isolation through its interface.

---

## MCP Inspector

FastMCP TS provides a built-in inspector for interactive validation during development.

### Commands

```bash
# Interactive Inspector UI with file-watch reload
npx fastmcp dev inspector src/server.ts

# Terminal inspection — list all registered components
npx fastmcp inspect --file src/server.ts

# Call a specific tool from terminal
npx fastmcp call wave_quality_index --file src/server.ts beachId=supertubos-peniche

# Call with multiple params
npx fastmcp call find_beaches_in_radius --file src/server.ts lat=38.7 lon=-9.4 radiusKm=50

# Run server for external client testing (HTTP)
npx fastmcp run src/server.ts --transport http --port 3000
```

### Verification Checklist

#### Resources
- [ ] `surf://providers` returns full provider list (valid JSON array)
- [ ] `surf://providers/{providerId}` returns correct provider for valid ID
- [ ] `surf://providers/{providerId}` throws clear error for invalid ID
- [ ] `surf://beaches` returns all beaches with correct schema
- [ ] `surf://beaches/{beachId}` returns full beach profile
- [ ] `surf://forecast/{beachId}` returns forecast array with WQI scores
- [ ] `surf://cams/{beachId}` returns cam info or `{ available: false }`
- [ ] URI templates extract parameters correctly

#### Tools
- [ ] `find_beaches_in_radius` returns beaches sorted by distance
- [ ] `find_beaches_in_radius` respects `limit` parameter
- [ ] `find_beaches_in_radius` rejects lat > 90 or lon > 180
- [ ] `find_beaches_near_city` geocodes correctly (test: "Lisbon" → ~38.7, -9.1)
- [ ] `filter_beaches` filters by each criteria independently
- [ ] `filter_beaches` combines multiple criteria correctly
- [ ] `wave_quality_index` returns 0–10 score with breakdown
- [ ] `wave_quality_index` handles missing timestamp (defaults to now)
- [ ] `classify_best_spot_nearby` returns ranked results
- [ ] `classify_spot_for_skill` returns go/caution/avoid
- [ ] `check_swell_alert` finds future swell windows
- [ ] All tools reject invalid input with Zod validation errors

#### Prompts
- [ ] `plan_surf_trip` renders with all args
- [ ] `plan_surf_trip` renders with only required args (defaults applied)
- [ ] `daily_surf_report` renders correctly
- [ ] `analyze_spot` renders correctly
- [ ] `beginner_spot_finder` renders correctly

#### Performance
- [ ] Geo search < 500ms with 100 beaches
- [ ] WQI calculation < 100ms per beach
- [ ] All tools respond < 2s total

---

## Automated Testing

### Framework

- **Runner**: `vitest`
- **Assertions**: built-in `expect`
- **Mocking**: `vi.mock` / `vi.fn` for providers

### Test Structure

```
tests/
├── unit/
│   ├── wqi.test.ts           # WQI engine in isolation
│   ├── geo.test.ts           # Haversine + geocoding
│   ├── models.test.ts        # Zod schema validation
│   └── classify.test.ts     # Classification logic
├── integration/
│   ├── resources.test.ts     # Resource handlers with mock data
│   ├── tools.test.ts         # Tool handlers with mock providers
│   └── prompts.test.ts       # Prompt rendering
└── e2e/
    └── server.test.ts        # Full server via MCP client
```

### Unit Test Examples

```typescript
// tests/unit/wqi.test.ts
import { describe, it, expect } from 'vitest'
import { calcSwellScore, calcWindScore, calcWqi } from '../src/tools/wqi'

describe('WQI Engine', () => {
  describe('calcSwellScore', () => {
    it('returns near-zero for flat conditions', () => {
      expect(calcSwellScore(0.1, 4)).toBeLessThan(1)
    })

    it('returns high score for overhead + long period', () => {
      expect(calcSwellScore(2.0, 14)).toBeGreaterThan(8)
    })

    it('caps at 10', () => {
      expect(calcSwellScore(5.0, 20)).toBeLessThanOrEqual(10)
    })
  })

  describe('calcWindScore', () => {
    it('gives 9.5 for glassy (< 5kts)', () => {
      expect(calcWindScore(3, 'NE', 'NE')).toBeCloseTo(9.5, 1)
    })

    it('penalizes onshore wind', () => {
      expect(calcWindScore(15, 'W', 'E')).toBeLessThan(3)
    })
  })

  describe('composite WQI', () => {
    it('flat conditions score Flat (0-1)', () => {
      const result = calcWqi({ swellHeightM: 0.1, swellPeriodS: 4, /* ... */ })
      expect(result.wqi).toBeLessThanOrEqual(1)
      expect(result.label).toBe('Flat')
    })

    it('epic conditions score Epic (9.5+)', () => {
      const result = calcWqi({ swellHeightM: 2.5, swellPeriodS: 16, /* ... */ })
      expect(result.wqi).toBeGreaterThan(9.5)
      expect(result.label).toBe('Epic')
    })
  })
})
```

### Integration Test Examples

```typescript
// tests/integration/tools.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createTestServer } from './helpers'

describe('Geo Tools', () => {
  let callTool: (name: string, args: object) => Promise<any>

  beforeAll(async () => {
    const { callTool: ct } = await createTestServer()
    callTool = ct
  })

  it('find_beaches_in_radius returns beaches near Lisbon', async () => {
    const result = await callTool('find_beaches_in_radius', {
      lat: 38.72, lon: -9.14, radiusKm: 80
    })
    expect(result).toBeInstanceOf(Array)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toHaveProperty('distanceKm')
    // Should find at least one known beach
    const names = result.map((b: any) => b.name)
    expect(names).toContain('Carcavelos')
  })

  it('rejects invalid coordinates', async () => {
    await expect(
      callTool('find_beaches_in_radius', { lat: 200, lon: 0, radiusKm: 50 })
    ).rejects.toThrow()
  })
})
```

### E2E Test Example

```typescript
// tests/e2e/server.test.ts
import { describe, it, expect } from 'vitest'
import { Client } from '@prefecthq/fastmcp-ts/client'

describe('MCP Server E2E', () => {
  it('lists all tools', async () => {
    await using client = await Client.connect('http://localhost:3000')
    const tools = await client.listTools()
    const toolNames = tools.map(t => t.name)

    expect(toolNames).toContain('wave_quality_index')
    expect(toolNames).toContain('find_beaches_in_radius')
    expect(toolNames).toContain('classify_best_spot_nearby')
  })

  it('reads a resource', async () => {
    await using client = await Client.connect('http://localhost:3000')
    const result = await client.readResource('surf://providers')
    const providers = JSON.parse(result)
    expect(providers.length).toBeGreaterThan(0)
  })
})
```

---

## CI Pipeline

### Core CI (Build + Test + Inspect)

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for code-quality blame data

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - run: npm ci
      - run: npx tsc --noEmit                           # Type check
      - run: npx vitest run --coverage                  # Tests + coverage report
      - run: npx fastmcp inspect --file src/server.ts   # MCP validation
```

### Code Quality & Static Analysis

We integrate **Qodana** (JetBrains' static analysis platform, free community linter) for continuous code quality and security scanning. It runs in its own workflow and posts results as PR comments and inline annotations.

```yaml
# .github/workflows/qodana.yml
name: Qodana
on:
  workflow_dispatch:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  qodana:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      checks: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0

      - name: 'Qodana Scan'
        uses: JetBrains/qodana-action@v2025.3
        env:
          QODANA_TOKEN: ${{ secrets.QODANA_TOKEN }}
        with:
          pr-mode: false
          use-caches: true
          post-pr-comment: true
          use-annotations: true
          upload-result: false
          push-fixes: 'none'
```

#### qodana.yaml

```yaml
version: "1.0"
profile:
  name: qodana.starter
linter: jetbrains/qodana-js:2025.3
```

### Alternative Free Code Quality Tools

If Qodana isn't suitable, these are solid free alternatives that integrate with GitHub Actions:

| Tool | Free Tier | Strengths | GitHub Action |
|------|-----------|-----------|---------------|
| **Qodana** | Community linter free | JetBrains inspections, PR comments, annotations | `JetBrains/qodana-action@v2025.3` |
| **Codacy** | Free for open-source | Code quality + security, 49 languages, auto-PR comments | `codacy/codacy-analysis-cli-action@v4` |
| **DeepSource** | Free for public repos | Auto-fix suggestions, performance issues, anti-patterns | `deepsourcelabs/test-coverage-action@v1` |
| **CodeClimate** | Free for open-source | Maintainability, duplication, test coverage tracking | `paambaati/codeclimate-action@v6` |
| **Semgrep** | Free (community rules) | Pattern-based security scanning, custom rules | `semgrep/semgrep-action@v1` |

#### Recommendation

For this project:
1. **Qodana** (primary) — JetBrains inspections for bugs, code smells, and vulnerabilities
2. **Semgrep** (complementary) — Lightweight security scanning with TypeScript-specific rules

Both are free for open-source and run in under a few minutes.

### Full CI with Quality Gates

```yaml
# .github/workflows/ci.yml (complete)
name: CI
on: [push, pull_request]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - run: npm ci

      # Type safety
      - name: Type check
        run: npx tsc --noEmit

      # Tests with coverage
      - name: Run tests
        run: npx vitest run --coverage --reporter=lcov

      # MCP compliance
      - name: Inspect MCP server
        run: npx fastmcp inspect src/server.ts

      # Security scanning (lightweight, fast)
      - name: Semgrep Security Scan
        uses: semgrep/semgrep-action@v1
        with:
          config: p/typescript
        env:
          SEMGREP_APP_TOKEN: ${{ secrets.SEMGREP_APP_TOKEN }}
```

> Code quality analysis runs separately via Qodana — see [`.github/workflows/qodana.yml`](#code-quality--static-analysis).

### Quality Gate Criteria

The CI **blocks merge** if any of these fail:

| Check | Tool | Threshold |
|-------|------|-----------|
| Type safety | `tsc --noEmit` | Zero errors |
| Tests pass | `vitest` | All green |
| Code quality | Qodana | No new critical/high problems |
| No vulnerabilities | Qodana / Semgrep | 0 |
| Duplication | Qodana | No new duplicated blocks |
| MCP compliance | `fastmcp inspect` | Exit code 0 |

---

## Success Criteria

| # | Criterion | Verification |
|---|-----------|--------------|
| 1 | Inspector passes | `npx fastmcp inspect` exits 0, all components listed |
| 2 | WQI engine correct | Unit tests cover all 6 scale ranges |
| 3 | Geo search works | Integration test: Lisbon coords → known beaches |
| 4 | Classification works | `classify_best_spot_nearby` returns ranked results |
| 5 | Prompts render | All prompts produce valid string output |
| 6 | Performance | Geo + WQI tools < 500ms with static data |
| 7 | MCP compliance | E2E test: standard client connects and calls tools |
