// `devbuddy mcp` — manage MCP servers.

import { listServers, addServer, removeServer, loadMcpConfig, mcpConfigPaths } from "../mcp/config.js";
import { listServerTools, connectServer, disconnectServer } from "../mcp/client.js";
import * as ui from "../ui.js";

function maskValue(v) {
  if (typeof v !== "string") return JSON.stringify(v);
  if (v.length > 12 && /token|key|auth/i.test(v)) return `"${v.slice(0,6)}…${v.slice(-4)}"`;
  return JSON.stringify(v);
}

export function register(program) {
  const mcp = program.command("mcp").description("Manage MCP (Model Context Protocol) servers.");

  mcp
    .command("list")
    .description("List configured MCP servers.")
    .action(() => {
      const servers = listServers();
      if (servers.length === 0) {
        ui.muted("(no MCP servers configured)");
        ui.blank();
        ui.muted("  add one with: devbuddy mcp add <name> <transport> ...");
        ui.muted("  config files: ~/.devbuddy/mcp.json  |  ./.devbuddy/mcp.json");
        return;
      }
      ui.title("mcp servers");
      ui.blank();
      for (const s of servers) {
        const tag = s.transport === "stdio" ? ui.theme.muted("[stdio]") : ui.theme.accent("[http]");
        console.log(`  ${tag} ${ui.theme.value(s.name)} ${ui.theme.muted(`(${s.source})`)}`);
        if (s.transport === "stdio") {
          ui.muted(`        command: ${s.config.command} ${(s.config.args || []).join(" ")}`);
        } else {
          ui.muted(`        url: ${s.config.url}`);
        }
      }
      ui.blank();
      ui.muted("test a server: devbuddy mcp test <name>");
      ui.muted("list tools:   devbuddy mcp tools <name>");
    });

  mcp
    .command("add <name> <transport>")
    .description("Add an MCP server. transport: stdio | http")
    .option("--command <cmd>", "For stdio: the command to run.")
    .option("--args <args...>", "For stdio: args for the command.")
    .option("--url <url>", "For http: the server URL.")
    .option("--header <k=v>", "For http: header (repeatable).", (v, acc) => { (acc || []).push(v); return acc; }, [])
    .option("--scope <scope>", "global | project", "global")
    .action(async (name, transport, opts) => {
      const conf = { transport };
      if (transport === "stdio") {
        if (!opts.command) { ui.error("stdio transport requires --command"); process.exit(1); }
        conf.command = opts.command;
        conf.args = opts.args || [];
      } else if (transport === "http" || transport === "sse") {
        if (!opts.url) { ui.error("http transport requires --url"); process.exit(1); }
        conf.url = opts.url;
        if (opts.header && opts.header.length > 0) {
          conf.headers = {};
          for (const h of opts.header) {
            const [k, ...v] = h.split("=");
            conf.headers[k] = v.join("=");
          }
        }
      } else {
        ui.error(`unknown transport '${transport}'. use: stdio | http`);
        process.exit(1);
      }
      addServer(name, conf, { scope: opts.scope });
      ui.ok(`added MCP server '${name}' (${transport}, ${opts.scope}).`);
      ui.muted("test with: devbuddy mcp test " + name);
    });

  mcp
    .command("remove <name>")
    .description("Remove an MCP server.")
    .action((name) => {
      const ok = removeServer(name);
      if (ok) ui.ok(`removed '${name}'.`);
      else { ui.error(`no server named '${name}'`); process.exit(1); }
    });

  mcp
    .command("test <name>")
    .description("Connect to a server and list its tools.")
    .action(async (name) => {
      const servers = listServers();
      const s = servers.find((x) => x.name === name);
      if (!s) { ui.error(`no server named '${name}'`); process.exit(1); }
      const spinner = new ui.Spinner(`Connecting to ${name}`);
      spinner.start();
      try {
        const tools = await listServerTools(name, s.config);
        spinner.succeed(`connected — ${tools.length} tool(s) available`);
        ui.blank();
        if (tools.length === 0) {
          ui.muted("(server exposed no tools)");
        } else {
          for (const t of tools) {
            console.log(`  ${ui.theme.value(t.name)} ${ui.theme.muted("—")} ${t.description || "(no description)"}`);
          }
        }
        await disconnectServer(name);
      } catch (e) {
        spinner.fail();
        ui.error(`connection failed: ${e.message}`);
        process.exit(1);
      }
    });

  mcp
    .command("tools <name>")
    .description("List tools exposed by a server (alias for 'test').")
    .action(async (name) => {
      const servers = listServers();
      const s = servers.find((x) => x.name === name);
      if (!s) { ui.error(`no server named '${name}'`); process.exit(1); }
      try {
        const tools = await listServerTools(name, s.config);
        if (tools.length === 0) {
          ui.muted("(no tools)");
        } else {
          for (const t of tools) {
            console.log(`  ${ui.theme.value(t.name)} ${ui.theme.muted("—")} ${t.description || ""}`);
          }
        }
        await disconnectServer(name);
      } catch (e) {
        ui.error(e.message);
        process.exit(1);
      }
    });

  mcp
    .command("paths")
    .description("Show where MCP config is loaded from.")
    .action(() => {
      const paths = mcpConfigPaths();
      ui.title("mcp config paths");
      ui.blank();
      ui.kv("global", paths.global);
      ui.kv("project", paths.project);
      ui.kv("config.json", "~/.devbuddy/config.json (mcp section)");
      ui.blank();
      ui.muted("Load order: global → project → config.json (later wins)");
    });

  // Default action: list
  mcp.action(() => {
    const servers = listServers();
    if (servers.length === 0) {
      ui.muted("(no MCP servers configured)");
      ui.blank();
      ui.muted("  add:    devbuddy mcp add <name> <stdio|http> ...");
      ui.muted("  paths:  devbuddy mcp paths");
      return;
    }
    ui.title("mcp servers");
    ui.blank();
    for (const s of servers) {
      const tag = s.transport === "stdio" ? ui.theme.muted("[stdio]") : ui.theme.accent("[http]");
      console.log(`  ${tag} ${ui.theme.value(s.name)} ${ui.theme.muted(`(${s.source})`)}`);
      if (s.transport === "stdio") {
        ui.muted(`        ${s.config.command} ${(s.config.args || []).join(" ")}`);
      } else {
        ui.muted(`        ${s.config.url}`);
      }
    }
    ui.blank();
    ui.muted("Subcommands: list | add | remove | test | tools | paths");
  });
}
