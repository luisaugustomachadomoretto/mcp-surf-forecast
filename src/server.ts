import { FastMCP } from 'fastmcp'
import { registerResources } from './resources/index.js'
import { registerTools } from './tools/index.js'
import { registerPrompts } from './prompts/index.js'

// --- Composition Root ---

const server = new FastMCP({
  name: 'mcp-surf-forecast',
  version: '1.0.0',
  instructions:
    'Surf forecast server providing wave quality scoring, beach discovery, and session planning. ' +
    'Use wave_quality_index for scoring, find_beaches_* for discovery, classify_* for recommendations.',
})

// Register all MCP components
registerTools(server)
registerResources(server)
registerPrompts(server)

// --- Transport selection (env-driven, defaults to stdio) ---
// TRANSPORT = "http" | "stdio" (default: stdio)
// PORT      = HTTP port (default: 3000)
// HOST      = bind address for HTTP (default: 0.0.0.0, needed inside containers)
const transport = (process.env.TRANSPORT ?? 'stdio').toLowerCase()
const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

if (transport === 'http') {
  server.start({
    transportType: 'httpStream',
    httpStream: { host, port, endpoint: '/mcp', cors: true },
  })
  // eslint-disable-next-line no-console
  console.error(`[mcp-surf-forecast] HTTP transport on http://${host}:${port}/mcp`)
} else {
  server.start({ transportType: 'stdio' })
}
