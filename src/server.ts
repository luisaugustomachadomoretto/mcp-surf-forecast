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

// Start the server
server.start({
  transportType: 'stdio',
})
