import type { FastMCP } from 'fastmcp'
import { z } from 'zod'
import beaches from '../data/beaches.json' with { type: 'json' }
import providers from '../data/providers.json' with { type: 'json' }

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
    name: 'All Beaches',
    description: 'All indexed surf spots with basic info (name, coords, region)',
    mimeType: 'application/json',
    load: async () => ({ text: JSON.stringify(beaches.map(b => ({ id: b.id, name: b.name, region: b.region, country: b.country, lat: b.lat, lon: b.lon })), null, 2) }),
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

  server.addResourceTemplate({
    uriTemplate: 'surf://forecast/{beachId}',
    name: 'Beach Forecast',
    description: 'Current forecast data for a beach (placeholder — returns mock data)',
    arguments: [{ name: 'beachId', description: 'Beach identifier', required: true }],
    load: async ({ beachId }) => {
      const beach = beaches.find(b => b.id === beachId)
      if (!beach) throw new Error(`Beach not found: ${beachId}`)
      // TODO: Replace with real forecast data from Open-Meteo
      return {
        text: JSON.stringify({
          beachId,
          generatedAt: new Date().toISOString(),
          note: 'Mock forecast — real API integration pending',
          forecast: [],
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
