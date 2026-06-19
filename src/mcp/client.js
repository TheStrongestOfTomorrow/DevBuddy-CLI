// MCP client — talks to MCP servers over stdio or HTTP/SSE.
//
// Implements the Model Context Protocol initialization + tools/list + tools/call
// flow. We don't implement the full MCP spec — just enough to discover and
// invoke tools from configured servers.
//
// Stdio transport: spawn the server as a child process, communicate via
// stdin/stdout JSON-RPC.
//
// HTTP/SSE transport: POST JSON-RPC requests, read responses via SSE or
// plain HTTP (server-dependent).
//
// Spec reference: https://modelcontextprotocol.io/specification

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

// --- Stdio client ---

class StdioMcpClient {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.proc = null;
    this.requestId = 0;
    this.pending = new Map(); // id → { resolve, reject }
    this.buffer = "";
    this.initialized = false;
  }

  async connect() {
    const { command, args = [], env = {}, cwd } = this.config;
    if (!command) throw new Error(`MCP server '${this.name}' missing 'command'`);

    this.proc = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout.on("data", (chunk) => this._onStdout(chunk));
    this.proc.stderr.on("data", (chunk) => {
      // Log stderr but don't fail — MCP servers often log there
      const text = chunk.toString();
      if (process.env.DEVBUDDY_MCP_DEBUG) {
        process.stderr.write(`[mcp:${this.name}:stderr] ${text}`);
      }
    });
    this.proc.on("error", (err) => {
      for (const { reject } of this.pending.values()) reject(err);
      this.pending.clear();
    });
    this.proc.on("exit", (code) => {
      const err = new Error(`MCP server '${this.name}' exited with code ${code}`);
      for (const { reject } of this.pending.values()) reject(err);
      this.pending.clear();
    });

    // Initialize
    await this._request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "devbuddy", version: "0.5.5" },
    });
    await this._notify("notifications/initialized", {});
    this.initialized = true;
  }

  _onStdout(chunk) {
    this.buffer += chunk.toString();
    // Parse newline-delimited JSON messages (some servers use Content-Length header,
    // but most MCP servers just send newline-delimited JSON)
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      // Also handle Content-Length-style framing
      this._handleMessage(line);
    }
    // Also try Content-Length framing
    this._tryContentLength();
  }

  _tryContentLength() {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) break;
      const len = parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + len) break;
      const body = this.buffer.slice(bodyStart, bodyStart + len);
      this.buffer = this.buffer.slice(bodyStart + len);
      this._handleMessage(body);
    }
  }

  _handleMessage(text) {
    let msg;
    try { msg = JSON.parse(text); }
    catch { return; }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
    // Notifications are ignored for now
  }

  _request(method, params) {
    const id = ++this.requestId;
    const msg = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify(msg) + "\n");
      // Timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request '${method}' timed out (server: ${this.name})`));
        }
      }, 15_000);
    });
  }

  _notify(method, params) {
    const msg = { jsonrpc: "2.0", method, params };
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  async listTools() {
    const result = await this._request("tools/list", {});
    return result?.tools || [];
  }

  async callTool(name, args) {
    const result = await this._request("tools/call", { name, arguments: args });
    return result;
  }

  async disconnect() {
    if (this.proc) {
      try { this.proc.stdin.end(); } catch {}
      try { this.proc.kill("SIGTERM"); } catch {}
      this.proc = null;
    }
  }
}

// --- HTTP/SSE client ---

class HttpMcpClient {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.initialized = false;
    this.baseUrl = config.url;
    this.headers = config.headers || {};
    this.requestId = 0;
  }

  async connect() {
    // MCP over HTTP: initialize via POST
    const result = await this._request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "devbuddy", version: "0.5.5" },
    });
    await this._notify("notifications/initialized", {});
    this.initialized = true;
  }

  async _request(method, params) {
    const id = ++this.requestId;
    const body = { jsonrpc: "2.0", id, method, params };
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`MCP HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    const msg = await res.json();
    if (msg.error) throw new Error(msg.error.message || JSON.stringify(msg.error));
    return msg.result;
  }

  async _notify(method, params) {
    const body = { jsonrpc: "2.0", method, params };
    try {
      await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {}
  }

  async listTools() {
    const result = await this._request("tools/list", {});
    return result?.tools || [];
  }

  async callTool(name, args) {
    const result = await this._request("tools/call", { name, arguments: args });
    return result;
  }

  async disconnect() {}
}

// --- Factory ---

export function createMcpClient(name, config) {
  const transport = config.transport || "stdio";
  if (transport === "stdio") return new StdioMcpClient(name, config);
  if (transport === "http" || transport === "sse" || transport === "https") return new HttpMcpClient(name, config);
  throw new Error(`Unknown MCP transport: ${transport}`);
}

// --- Connection manager (cache live clients) ---

const _clients = new Map(); // name → client

export async function connectServer(name, config) {
  if (_clients.has(name)) return _clients.get(name);
  const client = createMcpClient(name, config);
  await client.connect();
  _clients.set(name, client);
  return client;
}

export async function disconnectServer(name) {
  const client = _clients.get(name);
  if (client) {
    await client.disconnect();
    _clients.delete(name);
  }
}

export async function disconnectAll() {
  for (const name of [..._clients.keys()]) {
    await disconnectServer(name);
  }
}

export function isConnected(name) {
  return _clients.has(name);
}

export async function listServerTools(name, config) {
  const client = await connectServer(name, config);
  return client.listTools();
}

export async function callServerTool(name, config, toolName, args) {
  const client = await connectServer(name, config);
  return client.callTool(toolName, args);
}
