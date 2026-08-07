# 06 — Prompts

## Overview

Prompts are **reusable message templates** that guide LLM interactions for common surf-planning scenarios. They don't perform computation — they instruct the LLM on *which tools and resources to use* and *how to structure the response*.

Each prompt has a single purpose and explicitly references the tools it expects the LLM to call.

---

## Prompt Registry

| Prompt | Purpose | Required Args | Optional Args |
|--------|---------|---------------|---------------|
| `plan_surf_trip` | Multi-day trip itinerary | `destination`, `travelDates` | `skillLevel`, `preferences` |
| `daily_surf_report` | Morning conditions summary | `location` | `radiusKm` |
| `analyze_spot` | Deep spot analysis over time | `beachName` | `timeframe` |
| `beginner_spot_finder` | Safe spots for beginners | `location` | `date` |

---

## 1. Trip Planner

```typescript
server.prompt(
  {
    name: 'plan_surf_trip',
    description: 'Plan a surf trip with beach recommendations, forecast outlook, and logistics',
    arguments: [
      { name: 'destination', description: 'City or region to visit', required: true },
      { name: 'travelDates', description: 'Date range (e.g. "Aug 10-17")', required: true },
      { name: 'skillLevel', description: 'beginner | intermediate | advanced | expert', required: false },
      { name: 'preferences', description: 'Wave type preference, crowd tolerance, etc.', required: false },
    ],
  },
  ({ destination, travelDates, skillLevel, preferences }) => `You are an expert surf trip planner.

Plan a surf trip to ${destination} for dates: ${travelDates}.

Surfer profile:
- Skill level: ${skillLevel ?? 'intermediate'}
- Preferences: ${preferences ?? 'no preference'}

Steps:
1. Use find_beaches_near_city to discover spots in the area
2. Use wave_quality_index for each candidate beach
3. Use best_sessions_today or compare_beaches to rank options
4. Provide a day-by-day itinerary with:
   - Best beach for each day based on forecast
   - Optimal session times (tide + wind windows)
   - Backup spots if conditions change
   - Nearby amenities (board rentals, restaurants)
5. Include safety notes (currents, crowd level, local rules)`
)
```

### Tools Referenced
- `find_beaches_near_city`
- `wave_quality_index`
- `best_sessions_today`
- `compare_beaches`

---

## 2. Daily Surf Report

```typescript
server.prompt(
  {
    name: 'daily_surf_report',
    description: 'Generate a concise morning surf report for beaches near a location',
    arguments: [
      { name: 'location', description: 'City name or coordinates', required: true },
      { name: 'radiusKm', description: 'Search radius in km (default: 30)', required: false },
    ],
  },
  ({ location, radiusKm }) => `You are a surf forecaster delivering a concise morning report.

Location: ${location}
Search radius: ${radiusKm ?? '30'} km

Steps:
1. Use find_beaches_near_city to get nearby beaches
2. Use wave_quality_index for each beach
3. Produce a report with:
   - Overall conditions summary (1-2 sentences)
   - Top 3 picks ranked by WQI score
   - For each pick: WQI, swell, wind, tide info, and best window
   - Water temperature
   - Any hazards or warnings

Keep it concise — this is a quick morning check before heading out.`
)
```

### Tools Referenced
- `find_beaches_near_city`
- `wave_quality_index`

---

## 3. Spot Analysis

```typescript
server.prompt(
  {
    name: 'analyze_spot',
    description: 'Deep analysis of a specific surf spot over a timeframe',
    arguments: [
      { name: 'beachName', description: 'Name or ID of the beach', required: true },
      { name: 'timeframe', description: 'Period to analyze (e.g. "next 3 days", "this weekend")', required: false },
    ],
  },
  ({ beachName, timeframe }) => `You are an experienced local surfer analyzing conditions at ${beachName}.

Timeframe: ${timeframe ?? 'next 3 days'}

Steps:
1. Use the surf://beaches/{beachId} resource to understand the spot characteristics
2. Use wave_quality_index for the relevant time windows
3. Provide:
   - Swell analysis: Is the direction/period ideal for this spot?
   - Wind analysis: Will it be clean or blown out?
   - Tide strategy: Which tide phase works best here?
   - Crowd factor: Is this a popular window?
   - Best session window with confidence level (high/medium/low)
   - Comparison to the spot's ideal conditions
   - WQI trend over the timeframe (improving/peaking/declining)`
)
```

### Tools & Resources Referenced
- Resource: `surf://beaches/{beachId}`
- Tool: `wave_quality_index`

---

## 4. Beginner Guide

```typescript
server.prompt(
  {
    name: 'beginner_spot_finder',
    description: 'Find safe, beginner-friendly spots near a location',
    arguments: [
      { name: 'location', description: 'City or area name', required: true },
      { name: 'date', description: 'Specific date to check (optional, defaults to today)', required: false },
    ],
  },
  ({ location, date }) => `You are a patient surf instructor helping a beginner find the right spot.

Location: ${location}
Date: ${date ?? 'today'}

Steps:
1. Use find_beaches_near_city with the location
2. Use filter_beaches with skillLevel="beginner"
3. Use classify_spot_for_skill for each candidate with skillLevel="beginner"
4. Recommend spots where:
   - WQI is 3–6 (fun but not overpowering)
   - Wave height < 1.2m
   - Swell period is short (forgiving)
   - Wind is light or offshore
   - Sandy bottom (no rocks/reef)
   - Recommendation is "go" (not "caution" or "avoid")
5. Include safety tips and etiquette reminders`
)
```

### Tools Referenced
- `find_beaches_near_city`
- `filter_beaches`
- `classify_spot_for_skill`

---

## Design Decisions

1. **Prompts orchestrate, tools execute** — Prompts never contain logic. They describe a workflow for the LLM to follow using available tools. This keeps prompts open for modification without touching tool code.

2. **Explicit tool references** — Each prompt names the tools it expects. This makes prompt-tool coupling visible and auditable.

3. **Optional arguments have sensible defaults** — `skillLevel` defaults to "intermediate", `radiusKm` to 30, `timeframe` to "next 3 days". The prompt renders these defaults inline so the LLM sees them.

4. **Single persona per prompt** — Each prompt establishes one clear voice (trip planner, forecaster, local surfer, instructor). This helps LLMs produce consistent output.

5. **Steps are numbered** — Structured instructions produce more reliable tool-calling behavior from LLMs than prose paragraphs.
