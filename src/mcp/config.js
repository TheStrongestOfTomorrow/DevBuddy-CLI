// MCP server configuration loader.
//
// Config sources (layered, later wins):
//   1. ~/.devbuddy/mcp.json       (global)
//   2. ./.devbuddy/mcp.json       (project — overrides global)
//   3. config.json `mcp` section  (user can also put servers here)
//
// Format (mcp.json):
// {
//   "servers": {
//     "filesystem": {
//       "transport": "stdio",
//       "command": "npx",
//       "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
//     },
//     "remote-api": {
//       "transport": "http",
//       "url": "https://example.com/mcp",
//       "headers": { "Authorization": "Bearer xxx" }
//     }
//   }
// }

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { APP_DIR } from "../ui.js";
import { loadConfig, saveConfig } from "../store.js";

const GLOBAL_MCP_FILE = join(APP_DIR, "mcp.json");

function projectMcpFile(cwd = process.cwd()) {
  return join(cwd, ".devbuddy", "mcp.json");
}

function readJsonSafe(path) {
  if (!existsSync(path)) return {};
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/**
 * Load merged MCP config from all sources.
 * Returns { servers: { name: { transport, ... } } }
 */
export function loadMcpConfig(cwd = process.cwd()) {
  let servers = {};

  // 1. Global mcp.json
  const globalData = readJsonSafe(GLOBAL_MCP_FILE);
  if (globalData.servers) {
    servers = { ...servers, ...globalData.servers };
  }

  // 2. Project mcp.json (overrides global)
  const projData = readJsonSafe(projectMcpFile(cwd));
  if (projData.servers) {
    servers = { ...servers, ...projData.servers };
  }

  // 3. config.json mcp section (overrides files)
  const cfg = loadConfig();
  if (cfg.mcp && cfg.mcp.servers) {
    servers = { ...servers, ...cfg.mcp.servers };
  }

  return { servers };
}

export function listServers(cwd = process.cwd()) {
  const { servers } = loadMcpConfig(cwd);
  return Object.entries(servers).map(([name, conf]) => ({
    name,
    transport: conf.transport || "stdio",
    source: _sourceOf(name, cwd),
    config: conf,
  }));
}

function _sourceOf(name, cwd) {
  const projData = readJsonSafe(projectMcpFile(cwd));
  if (projData.servers && projData.servers[name]) return "project";
  const cfg = loadConfig();
  if (cfg.mcp && cfg.mcp.servers && cfg.mcp.servers[name]) return "config.json";
  return "global";
}

export function getServer(name, cwd = process.cwd()) {
  const { servers } = loadMcpConfig(cwd);
  return servers[name] || null;
}

export function addServer(name, conf, { scope = "global", cwd = process.cwd() } = {}) {
  const target = scope === "project" ? projectMcpFile(cwd) : GLOBAL_MCP_FILE;
  const data = readJsonSafe(target);
  if (!data.servers) data.servers = {};
  data.servers[name] = conf;
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, JSON.stringify(data, null, 2));
  return data;
}

export function removeServer(name, { cwd = process.cwd() } = {}) {
  let removed = false;
  // Try project first, then global
  for (const target of [projectMcpFile(cwd), GLOBAL_MCP_FILE]) {
    const data = readJsonSafe(target);
    if (data.servers && data.servers[name]) {
      delete data.servers[name];
      writeFileSync(target, JSON.stringify(data, null, 2));
      removed = true;
    }
  }
  // Also try config.json
  const cfg = loadConfig();
  if (cfg.mcp && cfg.mcp.servers && cfg.mcp.servers[name]) {
    delete cfg.mcp.servers[name];
    saveConfig(cfg);
    removed = true;
  }
  return removed;
}

export function mcpConfigPaths(cwd = process.cwd()) {
  return {
    global: GLOBAL_MCP_FILE,
    project: projectMcpFile(cwd),
  };
}
