// MCP → agent bridge.
//
// Discovers tools from all configured MCP servers and exposes them as agent
// tools with the prefix `mcp_<server>_<tool>`. The agent can call them like
// any other tool.
//
// We connect to all servers lazily on first call. Tool discovery happens
// when the agent session starts (so the system prompt lists available MCP tools).

import { listServers } from "../mcp/config.js";
import { connectServer, callServerTool, listServerTools, disconnectAll } from "../mcp/client.js";
import * as ui from "../ui.js";

// Cache: server name → list of tools (from tools/list)
const _discoveredTools = new Map(); // serverName → [{ name, description, inputSchema }]

/**
 * Discover tools from all configured MCP servers.
 * Best-effort — servers that fail to connect are skipped with a warning.
 * @returns {Promise<Array<{ server, name, description, inputSchema }>>}
 */
export async function discoverAllMcpTools() {
  const servers = listServers();
  const allTools = [];

  for (const s of servers) {
    try {
      const tools = await listServerTools(s.name, s.config);
      _discoveredTools.set(s.name, tools);
      for (const t of tools) {
        allTools.push({
          server: s.name,
          name: t.name,
          description: t.description || `(MCP tool from ${s.name})`,
          inputSchema: t.inputSchema || { type: "object", properties: {} },
        });
      }
    } catch (e) {
      ui.warn(`MCP server '${s.name}' failed to connect: ${e.message}`);
    }
  }

  return allTools;
}

/**
 * Generate agent tool entries for all discovered MCP tools.
 * Returns an object mapping `mcp_<server>_<tool>` → tool spec.
 */
export function mcpToolsAsAgentTools(discovered) {
  const out = {};
  for (const t of discovered) {
    const safeServer = t.server.replace(/[^a-zA-Z0-9_]/g, "_");
    const safeTool = t.name.replace(/[^a-zA-Z0-9_]/g, "_");
    const fullName = `mcp_${safeServer}_${safeTool}`;
    out[fullName] = {
      description: `[MCP/${t.server}] ${t.description}`,
      inputSchema: t.inputSchema,
      confirm: false, // MCP tools are typically read-only; user trusts the server they configured
      mcp: { server: t.server, tool: t.name },
      run: async (args) => {
        const server = listServers().find((s) => s.name === t.server);
        if (!server) throw new Error(`MCP server '${t.server}' no longer configured`);
        const result = await callServerTool(t.server, server.config, t.name, args);
        // MCP tool results are { content: [{ type: 'text', text: '...' }, ...] }
        if (result?.content) {
          return result.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n");
        }
        return JSON.stringify(result);
      },
    };
  }
  return out;
}

/**
 * Register all discovered MCP tools into the agent's TOOLS registry.
 * Called at agent session start.
 */
export async function registerMcpTools() {
  const discovered = await discoverAllMcpTools();
  const tools = mcpToolsAsAgentTools(discovered);
  // Import dynamically to avoid circular dep with tools.js
  const { TOOLS } = await import("./tools.js");
  for (const [name, spec] of Object.entries(tools)) {
    TOOLS[name] = spec;
  }
  return Object.keys(tools);
}

export async function cleanupMcp() {
  await disconnectAll();
}
