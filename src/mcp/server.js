// DevBuddy as an MCP server.
//
// Turns DevBuddy itself into an MCP server that other clients (Claude Desktop,
// other MCP clients) can connect to. Exposes DevBuddy's capabilities as MCP
// tools:
//   - chat / ask       (forward prompts to DevBuddy's configured AI provider)
//   - read_file        (read a file via DevBuddy's CWD-scoped tools)
//   - write_file
//   - edit_file
//   - list_files
//   - grep_search
//   - glob_search
//   - run_shell
//   - list_todos / add_todo / done_todo
//   - get_config / set_config
//
// Two transports:
//   - stdio: launched by another MCP client, communicates via stdin/stdout
//   - sse:   runs an HTTP server, clients connect via SSE + POST
//
// ⚠️ EXPERIMENTAL. Gated by `experimentalActAsMcp: true` in config.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as ui from "../ui.js";

import { complete, getActiveProvider, getActiveModel, getActiveProviderId } from "../ai/providers.js";
import { TOOLS, executeTool, resetSession } from "../agent/tools.js";
import { loadTodos, saveTodos, loadConfig, saveConfig } from "../store.js";
import { systemPromptSuffix } from "../prompt.js";

// --- Tool definitions exposed to MCP clients ---

function getExposedTools() {
  return [
    // --- Chat / ask ---
    {
      name: "chat",
      description: "Send a prompt to DevBuddy's configured AI provider and get a response. Uses the active provider + model from DevBuddy config.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "The prompt to send." },
          system: { type: "string", description: "Optional system prompt override." },
        },
        required: ["prompt"],
      },
      handler: async (args) => {
        const cfg = loadConfig();
        const system = args.system ||
          `You are a helpful developer assistant. Answer in ${cfg.language}.` + systemPromptSuffix();
        const reply = await complete(args.prompt, { system, maxTokens: 1024 });
        return { content: [{ type: "text", text: reply }] };
      },
    },

    // --- File tools (CWD-scoped) ---
    {
      name: "read_file",
      description: "Read a file's contents. Path is relative to the CWD where devbuddy act-as-mcp was launched.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
      handler: async (args) => {
        resetSession(); // CWD only, no extra roots for MCP server
        const result = await TOOLS.read_file.run(args);
        return { content: [{ type: "text", text: result }] };
      },
    },
    {
      name: "write_file",
      description: "Write a file (creates parent dirs). Overwrites if exists.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
      handler: async (args) => {
        resetSession();
        const result = await TOOLS.write_file.run(args);
        return { content: [{ type: "text", text: result }] };
      },
    },
    {
      name: "edit_file",
      description: "Edit a file by replacing a unique old_string with new_string.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
        },
        required: ["path", "old_string", "new_string"],
      },
      handler: async (args) => {
        resetSession();
        const result = await TOOLS.edit_file.run(args);
        return { content: [{ type: "text", text: result }] };
      },
    },
    {
      name: "list_files",
      description: "List files in a directory (default: CWD).",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
      },
      handler: async (args) => {
        resetSession();
        const result = await TOOLS.list_files.run(args);
        return { content: [{ type: "text", text: result }] };
      },
    },
    {
      name: "grep_search",
      description: "Search file contents with a regex pattern.",
      inputSchema: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          path: { type: "string" },
          glob: { type: "string" },
        },
        required: ["pattern"],
      },
      handler: async (args) => {
        resetSession();
        const result = await TOOLS.grep_search.run(args);
        return { content: [{ type: "text", text: result }] };
      },
    },
    {
      name: "glob_search",
      description: "Find files matching a glob pattern.",
      inputSchema: {
        type: "object",
        properties: { pattern: { type: "string" } },
        required: ["pattern"],
      },
      handler: async (args) => {
        resetSession();
        const result = await TOOLS.glob_search.run(args);
        return { content: [{ type: "text", text: result }] };
      },
    },
    {
      name: "run_shell",
      description: "Run a shell command. Returns stdout. 30s timeout.",
      inputSchema: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
      handler: async (args) => {
        resetSession();
        const result = await TOOLS.run_shell.run(args);
        return { content: [{ type: "text", text: result }] };
      },
    },

    // --- Todos ---
    {
      name: "list_todos",
      description: "List all DevBuddy todos.",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        const todos = loadTodos();
        const text = todos.length === 0
          ? "(no todos)"
          : todos.map((t) => `${t.done ? "✓" : "•"} #${t.id} [${t.priority}] ${t.text}`).join("\n");
        return { content: [{ type: "text", text }] };
      },
    },
    {
      name: "add_todo",
      description: "Add a DevBuddy todo.",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["text"],
      },
      handler: async (args) => {
        const todos = loadTodos();
        const id = todos.reduce((m, t) => Math.max(m, t.id), 0) + 1;
        const todo = {
          id,
          text: args.text,
          priority: args.priority || "medium",
          done: false,
          createdAt: new Date().toISOString(),
        };
        todos.push(todo);
        saveTodos(todos);
        return { content: [{ type: "text", text: `Added #${id}: ${args.text}` }] };
      },
    },
    {
      name: "done_todo",
      description: "Mark a DevBuddy todo as done.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "number" } },
        required: ["id"],
      },
      handler: async (args) => {
        const todos = loadTodos();
        const t = todos.find((x) => x.id === args.id);
        if (!t) return { content: [{ type: "text", text: `No todo #${args.id}` }] };
        t.done = true;
        t.completedAt = new Date().toISOString();
        saveTodos(todos);
        return { content: [{ type: "text", text: `Done #${args.id}: ${t.text}` }] };
      },
    },

    // --- Config ---
    {
      name: "get_config",
      description: "Get the current DevBuddy configuration (active provider, model, etc.). API keys are masked.",
      inputSchema: { type: "object", properties: {} },
      handler: async () => {
        const cfg = loadConfig();
        const masked = { ...cfg };
        if (masked.providers) {
          masked.providers = {};
          for (const [k, v] of Object.entries(cfg.providers)) {
            masked.providers[k] = {
              ...v,
              apiKey: v.apiKey ? `${v.apiKey.slice(0, 4)}…${v.apiKey.slice(-4)}` : "(none)",
              hasKey: Boolean(v.apiKey),
            };
          }
        }
        return { content: [{ type: "text", text: JSON.stringify(masked, null, 2) }] };
      },
    },
  ];
}

// --- JSON-RPC handler ---

async function handleRpc(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "devbuddy", version: "1.0.0" },
      },
    };
  }
  if (method === "notifications/initialized") {
    return null; // notification — no response
  }
  if (method === "tools/list") {
    const tools = getExposedTools().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    return { jsonrpc: "2.0", id, result: { tools } };
  }
  if (method === "tools/call") {
    const { name, arguments: args } = params || {};
    const tools = getExposedTools();
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown tool: ${name}` },
      };
    }
    try {
      const result = await tool.handler(args || {});
      return { jsonrpc: "2.0", id, result };
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: `ERROR: ${e.message}` }],
          isError: true,
        },
      };
    }
  }
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Unknown method: ${method}` },
  };
}

// --- stdio transport ---

export async function runStdioServer() {
  let buf = "";
  process.stdin.setEncoding("utf8");

  process.stdin.on("data", async (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); }
      catch { continue; }
      try {
        const reply = await handleRpc(msg);
        if (reply) process.stdout.write(JSON.stringify(reply) + "\n");
      } catch (e) {
        process.stderr.write(`[devbuddy-mcp] error: ${e.message}\n`);
      }
    }
  });

  process.stdin.on("end", () => process.exit(0));

  // Log to stderr so we don't corrupt the stdout JSON-RPC channel
  process.stderr.write("[devbuddy-mcp] stdio server ready\n");
}

// --- SSE transport ---

export async function runSseServer({ port = 8765, host = "127.0.0.1" } = {}) {
  const sessions = new Map(); // sessionId → { res }

  const server = createServer((req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // SSE endpoint: client connects here to receive responses
    if (req.url === "/sse" && req.method === "GET") {
      const sessionId = randomUUID();
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);
      sessions.set(sessionId, { res });
      process.stderr.write(`[devbuddy-mcp] SSE client connected: ${sessionId}\n`);

      req.on("close", () => {
        sessions.delete(sessionId);
        process.stderr.write(`[devbuddy-mcp] SSE client disconnected: ${sessionId}\n`);
      });
      return;
    }

    // Message endpoint: client POSTs JSON-RPC here
    if (req.url.startsWith("/messages") && req.method === "POST") {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Invalid or missing sessionId" }));
        return;
      }
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        // Acknowledge receipt immediately
        res.writeHead(202);
        res.end();
        try {
          const msg = JSON.parse(body);
          const reply = await handleRpc(msg);
          if (reply) {
            const session = sessions.get(sessionId);
            if (session) {
              session.res.write(`event: message\ndata: ${JSON.stringify(reply)}\n\n`);
            }
          }
        } catch (e) {
          process.stderr.write(`[devbuddy-mcp] error: ${e.message}\n`);
        }
      });
      return;
    }

    // Health check
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("DevBuddy MCP server (SSE)\nConnect via /sse\n");
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      process.stderr.write(`[devbuddy-mcp] SSE server listening on http://${host}:${port}\n`);
      process.stderr.write(`[devbuddy-mcp] SSE endpoint: http://${host}:${port}/sse\n`);
      process.stderr.write(`[devbuddy-mcp] POST endpoint: http://${host}:${port}/messages\n`);
      resolve(server);
    });
  });
}
