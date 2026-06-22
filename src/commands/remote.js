// `devbuddy remote` — experimental remote-AI connector.
//
// Gated by `experimentalRemoteAI: true` in config. Supports SSH + Claude Desktop.
// Use case: you don't have local API keys, so you connect to a remote AI
// (via SSH to a machine that has keys, or via Claude Desktop locally).

import { loadConfig, saveConfig } from "../store.js";
import { runRemoteSsh, testSshConnection } from "../remote/ssh.js";
import { runRemoteClaude, testClaudeConnection } from "../remote/claude-desktop.js";
import * as ui from "../ui.js";

function requireExperimental() {
  const cfg = loadConfig();
  if (!cfg.experimentalRemoteAI) {
    ui.error(
      "Remote AI is experimental and gated.\n" +
      "  To enable: devbuddy config set experimentalRemoteAI true\n\n" +
      "  ⚠️ WARNING: this feature lets you send prompts to a remote AI.\n" +
      "  Only enable if you don't have local API keys and need to use a\n" +
      "  remote machine (SSH) or Claude Desktop (local MCP) instead."
    );
    process.exit(1);
  }
  ui.warn(
    "⚠️  EXPERIMENTAL REMOTE AI — prompts are sent to a remote machine or\n" +
    "    Claude Desktop. Use with caution."
  );
  ui.blank();
}

function readLine(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString();
      if (buf.includes("\n")) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(buf.replace(/\r?\n$/, ""));
      }
    };
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}

export function register(program) {
  const remote = program.command("remote").description("⚠️ Experimental: connect to a remote AI (SSH or Claude Desktop).");

  remote
    .command("ssh <host> [prompt...]")
    .description("Run a prompt on a remote machine via SSH. If no prompt, enters interactive mode.")
    .option("-p, --port <n>", "SSH port.", "22")
    .option("-i, --identity <path>", "Path to SSH private key.")
    .option("-c, --command <cmd>", "Remote command to run (default: 'devbuddy-agent').")
    .action(async (host, promptParts, opts) => {
      requireExperimental();
      const cfg = {
        host,
        port: opts.port,
        keyPath: opts.identity,
        command: opts.command,
      };

      // One-shot mode
      if (promptParts && promptParts.length > 0) {
        const prompt = promptParts.join(" ");
        ui.muted(`→ ssh ${host} (running: ${cfg.command || "devbuddy-agent"})`);
        try {
          const result = await runRemoteSsh(cfg, prompt);
          ui.blank();
          ui.body(result);
          ui.blank();
        } catch (e) {
          ui.error(e.message);
          process.exit(1);
        }
        return;
      }

      // Interactive mode
      ui.title(`remote ssh — ${host}`);
      ui.muted(`Ctrl-C to exit. Type your prompts below.`);
      ui.blank();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const input = await readLine(ui.theme.accent("> "));
        if (!input.trim()) continue;
        if (/^\s*(exit|quit)\s*$/i.test(input)) break;
        try {
          const result = await runRemoteSsh(cfg, input);
          ui.blank();
          ui.body(result);
          ui.blank();
        } catch (e) {
          ui.error(e.message);
        }
      }
    });

  remote
    .command("ssh-test <host>")
    .description("Test SSH connectivity (runs 'echo OK' on the remote).")
    .option("-p, --port <n>", "SSH port.", "22")
    .option("-i, --identity <path>", "Path to SSH private key.")
    .action(async (host, opts) => {
      requireExperimental();
      const spinner = new ui.Spinner(`Testing SSH to ${host}`);
      spinner.start();
      try {
        await testSshConnection({ host, port: opts.port, keyPath: opts.identity });
        spinner.succeed(`SSH OK — ${host} reachable`);
      } catch (e) {
        spinner.fail();
        ui.error(e.message);
        process.exit(1);
      }
    });

  remote
    .command("claude [prompt...]")
    .description("Run a prompt via local Claude Desktop (MCP). If no prompt, interactive.")
    .option("--command <cmd>", "Override Claude CLI command (default: 'claude').")
    .option("--args <args...>", "Override args for the Claude CLI.")
    .action(async (promptParts, opts) => {
      requireExperimental();
      const cfg = { command: opts.command, args: opts.args };

      if (promptParts && promptParts.length > 0) {
        const prompt = promptParts.join(" ");
        ui.muted(`→ claude desktop (mcp)`);
        try {
          const result = await runRemoteClaude(cfg, prompt);
          ui.blank();
          ui.body(result);
          ui.blank();
        } catch (e) {
          ui.error(e.message);
          process.exit(1);
        }
        return;
      }

      ui.title("remote claude desktop");
      ui.muted(`Ctrl-C to exit.`);
      ui.blank();
      while (true) {
        const input = await readLine(ui.theme.accent("> "));
        if (!input.trim()) continue;
        if (/^\s*(exit|quit)\s*$/i.test(input)) break;
        try {
          const result = await runRemoteClaude(cfg, input);
          ui.blank();
          ui.body(result);
          ui.blank();
        } catch (e) {
          ui.error(e.message);
        }
      }
    });

  remote
    .command("claude-test")
    .description("Test Claude Desktop MCP connectivity.")
    .option("--command <cmd>", "Override Claude CLI command.")
    .action(async (opts) => {
      requireExperimental();
      const spinner = new ui.Spinner("Testing Claude Desktop");
      spinner.start();
      try {
        const result = await testClaudeConnection({ command: opts.command });
        spinner.succeed(`Claude Desktop OK — ${result.tools.length} tool(s) available`);
        for (const t of result.tools) {
          ui.muted(`  - ${t}`);
        }
      } catch (e) {
        spinner.fail();
        ui.error(e.message);
        process.exit(1);
      }
    });

  remote
    .command("status")
    .description("Show experimental remote-AI configuration.")
    .action(() => {
      const cfg = loadConfig();
      ui.title("remote ai status");
      ui.blank();
      ui.kv("enabled", cfg.experimentalRemoteAI ? ui.theme.warn("yes (experimental)") : "no");
      ui.blank();
      ui.muted("To enable: devbuddy config set experimentalRemoteAI true");
      ui.muted("SSH:        devbuddy remote ssh <host> \"<prompt>\"");
      ui.muted("Claude:     devbuddy remote claude \"<prompt>\"");
    });

  remote.action(() => {
    const cfg = loadConfig();
    ui.title("devbuddy remote (experimental)");
    ui.blank();
    ui.kv("enabled", cfg.experimentalRemoteAI ? ui.theme.warn("yes") : "no");
    ui.blank();
    ui.muted("Connectors:");
    ui.bullet("ssh <host> [prompt]  — SSH to a remote machine running devbuddy-agent");
    ui.bullet("claude [prompt]      — Claude Desktop via MCP");
    ui.blank();
    ui.muted("Subcommands: ssh | ssh-test | claude | claude-test | status");
    if (!cfg.experimentalRemoteAI) {
      ui.blank();
      ui.warn("⚠️  Currently disabled. Enable with: devbuddy config set experimentalRemoteAI true");
    }
  });
}
