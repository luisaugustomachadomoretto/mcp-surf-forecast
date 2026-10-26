/**
 * Shared test helpers for integration tests.
 *
 * FastMCP's real server needs a transport to run, so for unit-level
 * verification of tool/resource behaviour we use a tiny fake that just captures
 * what the register* functions add. We can then invoke the captured
 * execute()/load() handlers directly with plain arguments.
 */

export interface CapturedTool {
  name: string
  description?: string
  parameters?: any
  execute: (args: any) => Promise<unknown> | unknown
}

export interface CapturedResource {
  uri: string
  name?: string
  load: (args?: any) => Promise<{ text: string }>
}

export interface CapturedResourceTemplate {
  uriTemplate: string
  name?: string
  load: (args: any) => Promise<{ text: string }>
}

export interface CapturedPrompt {
  name: string
  load: (args: any) => Promise<unknown> | unknown
}

/** Minimal stand-in for FastMCP that records registrations. */
export class FakeServer {
  tools: CapturedTool[] = []
  resources: CapturedResource[] = []
  resourceTemplates: CapturedResourceTemplate[] = []
  prompts: CapturedPrompt[] = []

  addTool(t: CapturedTool) { this.tools.push(t) }
  addResource(r: CapturedResource) { this.resources.push(r) }
  addResourceTemplate(r: CapturedResourceTemplate) { this.resourceTemplates.push(r) }
  addPrompt(p: CapturedPrompt) { this.prompts.push(p) }

  tool(name: string): CapturedTool {
    const t = this.tools.find(x => x.name === name)
    if (!t) throw new Error(`tool not captured: ${name}`)
    return t
  }

  resource(uri: string): CapturedResource {
    const r = this.resources.find(x => x.uri === uri)
    if (!r) throw new Error(`resource not captured: ${uri}`)
    return r
  }

  template(uriTemplate: string): CapturedResourceTemplate {
    const r = this.resourceTemplates.find(x => x.uriTemplate === uriTemplate)
    if (!r) throw new Error(`resource template not captured: ${uriTemplate}`)
    return r
  }
}

/** Parse a tool's JSON string result. */
export async function callTool(tool: CapturedTool, args: any): Promise<any> {
  const out = await tool.execute(args)
  return typeof out === 'string' ? JSON.parse(out) : out
}
