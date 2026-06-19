// Experimental remote-AI connector: Claude Desktop.
//
// Talks to a local Claude Desktop instance via its MCP server (stdio).
// Claude Desktop must be running and have MCP enabled.
//
// This connector spawns Claude Desktop's MCP server (or a wrapper that
// exposes it) and sends prompts as MCP tool calls.
//
// ⚠️ EXPERIMENTAL. Gated by `experimentalRemoteAI: true` in config.
// ⚠️ REQUIRES: Claude Desktop installed and configured.

import { createMcpClient } from "../mcp/client.js";

/**
 * Run a prompt via Claude Desktop's MCP server.
 * @param {object} config
 * @param {string} [config.command]   - Command to launch the Claude MCP bridge (default: 'claude' CLI)
 * @param {string[]} [config.args]    - Args for the command
 * @param {string} prompt             - The prompt to send
 * @returns {Promise<string>}         - Claude's response
 */
export async function runRemoteClaude(config, prompt) {
  // Claude Desktop's MCP server is typically launched via the `claude` CLI
  // or via a wrapper script. We use the MCP client to talk to it.
  const clientConfig = {
    transport: "stdio",
    command: config.command || "claude",
    args: config.args || ["mcp", "serve"],
    env: config.env || {},
  };

  const client = createMcpClient("claude-desktop", clientConfig);
  try {
    await client.connect();

    // Try to find a "chat" or "ask" tool. Claude Desktop's MCP server
    // may expose different tools — we try common names.
    const tools = await client.listTools();
    const chatTool = tools.find(
      (t) => ["chat", "ask", "prompt", "query", "complete"].includes(t.name.toLowerCase())
    );

    if (!chatTool) {
      throw new Error(
        `No chat tool found in Claude Desktop MCP server. Available: ${tools.map((t) => t.name).join(", ")}. ` +
        `Configure Claude Desktop to expose a chat tool.`
      );
    }

    const result = await client.callTool(chatTool.name, { prompt });
    if (result?.content) {
      return result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
    }
    return JSON.stringify(result);
  } finally {
    try { await client.disconnect(); } catch {}
  }
}

/**
 * Test Claude Desktop connection.
 */
export async function testClaudeConnection(config) {
  const clientConfig = {
    transport: "stdio",
    command: config.command || "claude",
    args: config.args || ["mcp", "serve"],
    env: config.env || {},
  };
  const client = createMcpClient("claude-desktop-test", clientConfig);
  try {
    await client.connect();
    const tools = await client.listTools();
    return { ok: true, tools: tools.map((t) => t.name) };
  } finally {
    try { await client.disconnect(); } catch {}
  }
}
