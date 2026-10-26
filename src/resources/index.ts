import type { FastMCP } from 'fastmcp'
import { z } from 'zod'
import {
  beaches,
  countryCounts,
  getBeachIndexByCountry,
  getBeachesByCountry,
} from '../providers/beaches.js'
import providers from '../data/providers.json' with { type: 'json' }
import { getForecast } from '../providers/forecast.js'
import { getWavesCatalog, getWavesConditions } from '../providers/waves.js'

/**
 * Register all MCP resources (read-only data endpoints).
 */
export function registerResources(server: FastMCP): void {
  // --- Static Resources ---

  server.addResource({
    uri: 'surf://providers',
    name: 'All Providers',
    description: 'List of all available surf data providers with metadata',
    mimeType: 'application/json',
    load: async () => ({ text: JSON.stringify(providers, null, 2) }),
  })

  server.addResource({
    uri: 'surf://beaches',
    name: 'Beaches Index (by country)',
    description:
      'Lightweight index of indexed surf spots. Returns per-country counts only, ' +
      'to avoid overloading context. Drill down with surf://beaches/country/{country} ' +
      'for a compact list, or surf://beaches/{beachId} for a full profile.',
    mimeType: 'application/json',
    load: async () => ({
      text: JSON.stringify(
        {
          totalBeaches: beaches.length,
          countries: countryCounts(),
          hint: 'Fetch surf://beaches/country/{country} for the spots in one country block.',
        },
        null,
        2,
      ),
    }),
  })

  // --- Templated Resources ---

  server.addResourceTemplate({
    uriTemplate: 'surf://providers/{providerId}',
    name: 'Provider Details',
    description: 'Details and capabilities of a specific provider',
    arguments: [{ name: 'providerId', description: 'Provider identifier (e.g. "surfline")', required: true }],
    load: async ({ providerId }) => {
      const provider = providers.find(p => p.id === providerId)
      if (!provider) throw new Error(`Provider not found: ${providerId}`)
      return { text: JSON.stringify(provider, null, 2) }
    },
  })

  server.addResourceTemplate({
    uriTemplate: 'surf://beaches/{beachId}',
    name: 'Beach Profile',
    description: 'Full beach profile: location, wave type, skill level, best conditions',
    arguments: [{ name: 'beachId', description: 'Beach identifier (e.g. "supertubos-peniche")', required: true }],
    load: async ({ beachId }) => {
      const beach = beaches.find(b => b.id === beachId)
      if (!beach) throw new Error(`Beach not found: ${beachId}`)
      return { text: JSON.stringify(beach, null, 2) }
    },
  })

  // --- Per-country blocks (keeps list payloads small & scoped) ---

  server.addResourceTemplate({
    uriTemplate: 'surf://beaches/country/{country}',
    name: 'Beaches by Country (compact)',
    description:
      'Compact index (id, name, region, subregion, coords) of all spots in one ' +
      'country. Use this to browse a country block without loading every record ' +
      'globally. Case-insensitive, e.g. "Brazil", "Portugal", "Spain", "France".',
    arguments: [{ name: 'country', description: 'Country name (e.g. "Brazil")', required: true }],
    load: async ({ country }) => {
      const entries = getBeachIndexByCountry(country)
      if (entries.length === 0) throw new Error(`No beaches found for country: ${country}`)
      return {
        text: JSON.stringify(
          { country, count: entries.length, beaches: entries },
          null,
          2,
        ),
      }
    },
  })

  server.addResourceTemplate({
    uriTemplate: 'surf://beaches/country/{country}/full',
    name: 'Beaches by Country (full profiles)',
    description:
      'Full beach profiles for one country block. Heavier than the compact ' +
      'variant — prefer surf://beaches/country/{country} unless you need every ' +
      'field for the whole country.',
    arguments: [{ name: 'country', description: 'Country name (e.g. "Brazil")', required: true }],
    load: async ({ country }) => {
      const list = getBeachesByCountry(country)
      if (list.length === 0) throw new Error(`No beaches found for country: ${country}`)
      return { text: JSON.stringify({ country, count: list.length, beaches: list }, null, 2) }
    },
  })

  // --- Waves.com.br — Brazilian conditions & forecast ---

  server.addResource({
    uri: 'surf://waves-br/spots',
    name: 'Waves.com.br Spots (Brazil)',
    description:
      'Catalog of Brazilian surf spots from waves.com.br/wavescheck, grouped by ' +
      'state (UF). Each entry has the canonical path used by ' +
      'surf://waves-br/conditions/{spotPath}. Grouped to keep the payload scannable.',
    mimeType: 'application/json',
    load: async () => {
      const spots = await getWavesCatalog()
      const byState: Record<string, Array<{ id: number; name: string; city: string; path: string }>> = {}
      for (const s of spots) {
        ;(byState[s.state] ??= []).push({ id: s.id, name: s.name, city: s.city, path: s.path })
      }
      const states = Object.keys(byState).sort()
      return {
        text: JSON.stringify(
          {
            source: 'https://www.waves.com.br/wavescheck/',
            totalSpots: spots.length,
            stateCount: states.length,
            states: states.map(uf => ({ state: uf, count: byState[uf].length, spots: byState[uf] })),
          },
          null,
          2,
        ),
      }
    },
  })

  server.addResourceTemplate({
    uriTemplate: 'surf://waves-br/conditions/{spotPath}',
    name: 'Waves.com.br Conditions (Brazil)',
    description:
      'Live surf conditions & forecast for a Brazilian spot from waves.com.br. ' +
      'Returns hourly frames (wave height, period, swell/wind, quality score, ' +
      'tide, weather) plus a per-day summary. {spotPath} is the canonical path ' +
      'from surf://waves-br/spots (slashes allowed), e.g. ' +
      '"surf/ondas/picos/sp/sao-sebastiao/maresias".',
    arguments: [{ name: 'spotPath', description: 'Canonical waves.com.br spot path', required: true }],
    load: async ({ spotPath }) => {
      const conditions = await getWavesConditions(String(spotPath))
      return { text: JSON.stringify(conditions, null, 2) }
    },
  })

  server.addResourceTemplate({
    uriTemplate: 'surf://forecast/{beachId}',
    name: 'Beach Forecast',
    description: 'Current forecast data for a beach (placeholder — returns mock data)',
    arguments: [{ name: 'beachId', description: 'Beach identifier', required: true }],
    load: async ({ beachId }) => {
      const beach = beaches.find(b => b.id === beachId)
      if (!beach) throw new Error(`Beach not found: ${beachId}`)
      const forecast = await getForecast(beach.lat, beach.lon)
      return {
        text: JSON.stringify({
          beachId,
          generatedAt: forecast.generatedAt,
          stale: forecast.stale,
          note: forecast.note,
          forecast: forecast.hours.slice(0, 72),
        }, null, 2),
      }
    },
  })

  server.addResourceTemplate({
    uriTemplate: 'surf://cams/{beachId}',
    name: 'Beach Cam',
    description: 'Live cam URL for a beach (if available)',
    arguments: [{ name: 'beachId', description: 'Beach identifier', required: true }],
    load: async ({ beachId }) => {
      const beach = beaches.find(b => b.id === beachId)
      if (!beach) throw new Error(`Beach not found: ${beachId}`)
      return {
        text: JSON.stringify({
          beachId,
          name: beach.name,
          available: !!beach.camUrl,
          camUrl: beach.camUrl,
        }, null, 2),
      }
    },
  })
}
