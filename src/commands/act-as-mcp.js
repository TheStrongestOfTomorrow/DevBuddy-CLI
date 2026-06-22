// `devbuddy act-as-mcp` — run DevBuddy itself as an MCP server.
//
// ⚠️ EXPERIMENTAL. Gated by `experimentalActAsMcp: true` in config.
// Exposes DevBuddy's capabilities (chat, file tools, todos, config) as MCP
// tools that other MCP clients (Claude Desktop, etc.) can call.

import { loadConfig } from "../store.js";
import { runStdioServer, runSseServer } from "../mcp/server.js";
import * as ui from "../ui.js";

function requireExperimental() {
  const cfg = loadConfig();
  if (!cfg.experimentalActAsMcp) {
    ui.error(
      "act-as-mcp is experimental and gated.\n" +
      "  To enable: devbuddy config set experimentalActAsMcp true\n\n" +
      "  ⚠️ WARNING: this exposes DevBuddy's capabilities (file read/write,\n" +
      "  shell execution, config) to any MCP client that connects. Only\n" +
      "  enable if you understand the risks and run on a trusted network."
    );
    process.exit(1);
  }
  ui.warn(
    "⚠️  EXPERIMENTAL: running DevBuddy as an MCP server.\n" +
    "    File operations, shell, and config are exposed to MCP clients.\n" +
    "    Only connect trusted MCP clients."
  );
  ui.blank();
}

export function register(program) {
  program
    .command("act-as-mcp")
    .description("⚠️ Experimental: run DevBuddy as an MCP server (stdio or SSE).")
    .option("-t, --transport <type>", "stdio | sse (default: sse)", "sse")
    .option("-p, --port <n>", "Port for SSE transport (default: 8765).", "8765")
    .option("--host <host>", "Host for SSE transport (default: 127.0.0.1).", "127.0.0.1")
    .action(async (opts) => {
      requireExperimental();

      if (opts.transport === "stdio") {
        ui.muted("starting MCP server (stdio transport)…");
        await runStdioServer();
      } else if (opts.transport === "sse") {
        const port = parseInt(opts.port, 10) || 8765;
        ui.muted(`starting MCP server (SSE transport) on ${opts.host}:${port}…`);
        ui.blank();
        ui.title("devbuddy as MCP server");
        ui.blank();
        ui.kv("transport", "SSE");
        ui.kv("endpoint", `http://${opts.host}:${port}/sse`);
        ui.kv("messages", `http://${opts.host}:${port}/messages`);
        ui.kv("health", `http://${opts.host}:${port}/`);
        ui.blank();
        ui.muted("Connect from an MCP client (Claude Desktop, etc.) using the endpoint URL.");
        ui.muted("Press Ctrl-C to stop.");
        ui.blank();
        await runSseServer({ port, host: opts.host });
      } else {
        ui.error(`unknown transport '${opts.transport}'. use: stdio | sse`);
        process.exit(1);
      }
    });
}
