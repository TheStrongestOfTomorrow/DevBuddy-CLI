// `devbuddy doctor` — diagnose common setup issues.

import { loadConfig } from "../store.js";
import { PROVIDERS, getActiveProviderId, getActiveProvider, getActiveKey, isOnboarded, isAuthenticated } from "../ai/providers.js";
import { findDevbuddyMd } from "../prompt.js";
import { listServers } from "../mcp/config.js";
import { existsSync, readFileSync, accessSync, constants } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { APP_DIR, CONFIG_FILE, TODOS_FILE, getVersion } from "../ui.js";
import * as ui from "../ui.js";

const checks = [];
function ok(label, detail) { checks.push({ status: "ok", label, detail }); }
function warn(label, detail) { checks.push({ status: "warn", label, detail }); }
function err(label, detail) { checks.push({ status: "err", label, detail }); }

export function register(program) {
  program
    .command("doctor")
    .description("Diagnose common setup issues.")
    .action(() => {
      ui.title(`devbuddy doctor — v${getVersion()}`);
      ui.blank();
      checks.length = 0;

      // 1. Node version
      try {
        const nodeVersion = process.version;
        const major = parseInt(nodeVersion.slice(1), 10);
        if (major >= 18) ok("Node.js", `${nodeVersion} (>= 18 ✓)`);
        else err("Node.js", `${nodeVersion} — devbuddy requires >= 18`);
      } catch (e) {
        err("Node.js", `could not determine: ${e.message}`);
      }

      // 2. App directory
      if (existsSync(APP_DIR)) ok("App directory", APP_DIR);
      else err("App directory", `${APP_DIR} does not exist (will be created on first use)`);

      // 3. Config file
      if (existsSync(CONFIG_FILE)) {
        try {
          const cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
          ok("Config file", CONFIG_FILE);
          if (cfg.onboardingComplete) ok("Onboarding", "complete");
          else err("Onboarding", "not complete — run `devbuddy onboard`");
          if (cfg.provider) ok("Active provider", cfg.provider);
          else err("Active provider", "not set");
        } catch (e) {
          err("Config file", `invalid JSON: ${e.message}`);
        }
      } else {
        err("Config file", `${CONFIG_FILE} does not exist — run \`devbuddy onboard\``);
      }

      // 4. Onboarding + auth status
      if (isOnboarded()) ok("Onboarding status", "complete");
      else err("Onboarding status", "incomplete");

      if (isAuthenticated()) ok("API key", `set for ${getActiveProviderId()}`);
      else {
        const id = getActiveProviderId();
        if (id === "ollama") {
          warn("API key", "ollama provider (no key needed) — verify ollama is running");
        } else {
          err("API key", `not set for ${getActiveProviderId()}`);
        }
      }

      // 5. Provider details
      const provider = getActiveProvider();
      ok("Provider", `${provider.name} (${getActiveProviderId()})`);
      const key = getActiveKey();
      if (key && key !== "ollama") ok("Key format", `starts with ${key.slice(0, 4)}…`);
      else if (key === "ollama") ok("Key format", "(ollama dummy)");

      // 6. DEVBUDDY.md
      const dbMd = findDevbuddyMd();
      if (dbMd) ok("DEVBUDDY.md", `${dbMd.path} (${dbMd.source})`);
      else warn("DEVBUDDY.md", "not found (optional — run `devbuddy init` to create)");

      // 7. MCP servers
      const mcpServers = listServers();
      if (mcpServers.length === 0) warn("MCP servers", "none configured (optional)");
      else {
        ok("MCP servers", `${mcpServers.length} configured`);
        for (const s of mcpServers) {
          ui.muted(`    - ${s.name} (${s.transport}, ${s.source})`);
        }
      }

      // 8. Todos file
      if (existsSync(TODOS_FILE)) {
        try {
          const todos = JSON.parse(readFileSync(TODOS_FILE, "utf8"));
          ok("Todos file", `${TODOS_FILE} (${todos.length} todos)`);
        } catch {
          warn("Todos file", `${TODOS_FILE} exists but is invalid JSON`);
        }
      } else {
        ok("Todos file", "none yet (created on first todo)");
      }

      // 9. Network check (try to reach GitHub)
      try {
        execSync("curl -s -o /dev/null -w '%{http_code}' https://api.github.com", {
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        });
        ok("Network", "GitHub API reachable");
      } catch {
        warn("Network", "could not reach GitHub API (offline? rate-limited?)");
      }

      // 10. Git
      try {
        const gitVersion = execSync("git --version", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
        ok("Git", gitVersion);
      } catch {
        warn("Git", "not installed (some agent tools won't work)");
      }

      // 11. Experimental flags
      const cfg = loadConfig();
      if (cfg.experimentalRemoteAI) warn("experimentalRemoteAI", "enabled (experimental)");
      if (cfg.experimentalActAsMcp) warn("experimentalActAsMcp", "enabled (experimental)");

      // Render
      for (const c of checks) {
        const icon = c.status === "ok" ? ui.theme.ok("✓") : c.status === "warn" ? ui.theme.warn("!") : ui.theme.err("✗");
        console.log(`  ${icon} ${ui.theme.heading(c.label.padEnd(20))} ${c.detail}`);
      }
      ui.blank();
      const errs = checks.filter((c) => c.status === "err").length;
      const warns = checks.filter((c) => c.status === "warn").length;
      if (errs === 0 && warns === 0) {
        ui.ok("all checks passed.");
      } else {
        ui.warn(`${errs} error(s), ${warns} warning(s).`);
        if (errs > 0) process.exit(1);
      }
    });
}
