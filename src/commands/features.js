// `devbuddy features` — feature-by-feature review of the entire CLI (v1.2.5).
//
// For every feature (core, storage, agent & phone, extras) it reports:
//   ✓ ok            configured and looking healthy
//   ! notConfigured not set up yet — the row carries the exact command to fix it
//   ✗ broken        configured but failing / misconfigured — file an issue!
//   – off           optional/experimental feature that is not enabled
//
// Each notConfigured/broken row carries a `fix` — the exact command to run.
// `--json` prints a machine-readable report (JSON.parse-able) to attach to
// GitHub issues. `--live` additionally pings the active AI provider (~8
// tokens). Exits 1 when anything is broken, so it can be used in scripts.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { APP_DIR, CONFIG_FILE, TODOS_FILE, getVersion } from "../ui.js";
import { loadConfig } from "../store.js";
import {
  PROVIDERS, PROVIDER_IDS, getActiveProviderId, getActiveProvider,
  getActiveKey, getActiveModel, isAuthenticated, isOnboarded,
  verifyActiveProvider,
} from "../ai/providers.js";
import { findDevbuddyMd } from "../prompt.js";
import { checkPhoneAvailable } from "../agent/phone-tools.js";
import * as ui from "../ui.js";

const ISSUES_URL = "https://github.com/TheStrongestOfTomorrow/DevBuddy-CLI/issues";
const CATEGORIES = ["core", "storage", "agent", "extras"];
const HISTORY_FILE = join(APP_DIR, "history.jsonl");

const STATUS_META = {
  ok:            { icon: "✓", color: (s) => ui.theme.ok(s) },
  notConfigured: { icon: "!", color: (s) => ui.theme.warn(s) },
  broken:        { icon: "✗", color: (s) => ui.theme.err(s) },
  off:           { icon: "–", color: (s) => ui.theme.muted(s) },
};

// --- tiny helpers ----------------------------------------------------------

function row(category, id, label, status, detail, fix = null) {
  return { category, id, label, status, detail, fix };
}

function maskToken(token) {
  if (!token) return "(not set)";
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "…" + token.slice(-4);
}

function relativeTime(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

// Raw-read a JSON file; returns { ok, data } / { ok:false, error } / null if
// the file does not exist (caller decides what missing means).
function readJsonRaw(path) {
  if (!existsSync(path)) return null;
  try {
    return { ok: true, data: JSON.parse(readFileSync(path, "utf8")) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function countChats(dir) {
  if (!existsSync(dir)) return { count: 0, corrupt: [] };
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch (e) {
    return { count: 0, corrupt: [`<cannot read ${dir}: ${e.message}>`] };
  }
  let count = 0;
  const corrupt = [];
  for (const f of files) {
    try {
      JSON.parse(readFileSync(join(dir, f), "utf8"));
      count++;
    } catch {
      corrupt.push(f);
    }
  }
  return { count, corrupt };
}

// --- checks ----------------------------------------------------------------

function checkNode() {
  const major = parseInt(process.version.replace(/^v/, "").split(".")[0], 10);
  if (major >= 18) {
    return row("core", "node", "node", "ok", `${process.version} (>= 18 ✓)`);
  }
  return row("core", "node", "node", "broken",
    `${process.version} — devbuddy requires Node >= 18`,
    "upgrade node to >= 18 (e.g. 'nvm install 18' or your package manager)");
}

function checkConfig() {
  const raw = readJsonRaw(CONFIG_FILE);
  if (raw === null) {
    return row("core", "config", "config", "ok",
      `no config file yet (defaults are fine — run \`devbuddy onboard\` to set up)`);
  }
  if (!raw.ok) {
    return row("core", "config", "config", "broken",
      `invalid JSON: ${raw.error} — settings silently fall back to defaults`,
      "delete ~/.devbuddy/config.json (or repair it), then re-run: devbuddy onboard");
  }
  return row("core", "config", "config", "ok", "settings load from " + CONFIG_FILE);
}

function checkOnboarding(cfg) {
  if (isOnboarded()) {
    return row("core", "onboarding", "onboarding", "ok",
      `complete (provider: ${cfg.provider}, since ${cfg.onboardedAt ? cfg.onboardedAt.slice(0, 10) : "?"})`);
  }
  return row("core", "onboarding", "onboarding", "notConfigured",
    "not onboarded yet",
    "devbuddy onboard   (one-time setup, ~1 min)");
}

function checkProvider(cfg) {
  if (!cfg.provider) {
    return row("core", "provider", "provider", "notConfigured",
      "no active provider selected",
      "devbuddy onboard   (or: devbuddy config set provider <id>)");
  }
  const p = PROVIDERS[cfg.provider];
  if (!p) {
    return row("core", "provider", "provider", "broken",
      `'${cfg.provider}' is not a known provider. valid: ${PROVIDER_IDS.join(", ")}`,
      "devbuddy config set provider <id>   (then: devbuddy auth set <key>)");
  }
  return row("core", "provider", "provider", "ok", `${p.name} (${cfg.provider})`);
}

function checkApiKey() {
  const providerId = getActiveProviderId();
  if (providerId === "ollama") {
    return row("core", "api-key", "api-key", "ok", "no key needed (ollama runs locally)");
  }
  if (isAuthenticated()) {
    return row("core", "api-key", "api-key", "ok", `key set (${maskToken(getActiveKey())})`);
  }
  const p = getActiveProvider();
  return row("core", "api-key", "api-key", "notConfigured",
    "no API key set for " + (PROVIDERS[providerId]?.name || providerId),
    `devbuddy auth set <key>   (get one: ${p.getKeyUrl})`);
}

function checkModel(cfg) {
  const model = getActiveModel();
  const custom = !!(cfg.providers && cfg.providers[cfg.provider] && cfg.providers[cfg.provider].model);
  return row("core", "model", "model", "ok",
    `${model} ${custom ? "(custom)" : "(default)"}`);
}

function checkContext() {
  const found = findDevbuddyMd();
  if (found) {
    return row("core", "context", "context", "ok", `${found.path} (${found.source})`);
  }
  return row("core", "context", "context", "notConfigured",
    "no DEVBUDDY.md in this project or ~/.devbuddy/",
    "devbuddy init   (creates a template)");
}

// --live: ping the active provider end-to-end (~8 tokens).
async function checkLive() {
  if (!isOnboarded()) {
    return row("core", "live", "live", "notConfigured", "skipped — not onboarded");
  }
  const provider = getActiveProvider();
  try {
    await verifyActiveProvider();
    return row("core", "live", "live", "ok", `${provider.name} replied ✓`);
  } catch (e) {
    return row("core", "live", "live", "broken",
      `${provider.name} did not reply: ${e.message || e}`,
      "check key/model/network; if it still fails, file an issue (see below)");
  }
}

// --- storage ---------------------------------------------------------------

function checkChats() {
  const global = countChats(join(APP_DIR, "chats"));
  const project = countChats(join(process.cwd(), ".devbuddy", "chats"));
  const corrupt = [...global.corrupt, ...project.corrupt];
  if (corrupt.length > 0) {
    return row("storage", "chats", "chats", "broken",
      `${corrupt.length} corrupt chat file(s): ${corrupt.join(", ")} — chat list/show skips them`,
      "delete the corrupt chat file(s); they are not recoverable as-is");
  }
  return row("storage", "chats", "chats", "ok",
    `${global.count} global + ${project.count} project saved`);
}

function checkTodos() {
  const raw = readJsonRaw(TODOS_FILE);
  if (raw === null) {
    return row("storage", "todos", "todos", "ok",
      "none yet (offline feature — created on first `devbuddy todo add`)");
  }
  if (!raw.ok) {
    return row("storage", "todos", "todos", "broken",
      `todos.json is invalid JSON: ${raw.error}`,
      "delete ~/.devbuddy/todos.json — it will be recreated on next `devbuddy todo add`");
  }
  if (!Array.isArray(raw.data)) {
    return row("storage", "todos", "todos", "broken",
      "todos.json must contain an array of todos",
      "delete ~/.devbuddy/todos.json — it will be recreated on next `devbuddy todo add`");
  }
  const open = raw.data.filter((t) => !t || t.done !== true).length;
  return row("storage", "todos", "todos", "ok", `${raw.data.length} saved, ${open} open`);
}

function checkHistory() {
  if (!existsSync(HISTORY_FILE)) {
    return row("storage", "history", "history", "ok",
      "empty (records automatically — every command from v1.2.5 on)");
  }
  // history.jsonl is JSONL — count parseable lines, flag unparseable ones.
  let entries = 0;
  let bad = 0;
  try {
    const lines = readFileSync(HISTORY_FILE, "utf8").split("\n").filter((l) => l.trim());
    for (const line of lines) {
      try {
        const e = JSON.parse(line);
        if (e && e.ts && e.cmd) entries++;
        else bad++;
      } catch {
        bad++;
      }
    }
  } catch (e) {
    return row("storage", "history", "history", "broken",
      `cannot read history.jsonl: ${e.message}`,
      "delete ~/.devbuddy/history.jsonl — it rebuilds automatically");
  }
  if (bad === 0) {
    return row("storage", "history", "history", "ok", `${entries} command(s) recorded`);
  }
  return row("storage", "history", "history", "broken",
    `${bad} unparseable line(s) in history.jsonl`,
    "delete ~/.devbuddy/history.jsonl — it rebuilds automatically");
}

function checkMcp(cfg) {
  const paths = [
    ["global", join(APP_DIR, "mcp.json")],
    ["project", join(process.cwd(), ".devbuddy", "mcp.json")],
  ];
  const corrupt = [];
  const layerData = {};
  for (const [name, p] of paths) {
    const raw = readJsonRaw(p);
    if (raw === null) continue;
    if (!raw.ok) { corrupt.push(p); continue; }
    layerData[name] = raw.data;
  }
  if (corrupt.length > 0) {
    return row("storage", "mcp", "mcp", "broken",
      `invalid JSON in: ${corrupt.join(", ")}`,
      "delete or repair the file(s) — a malformed mcp.json is silently ignored");
  }
  // Merge: global → project → config.json mcp section (later wins).
  const servers = {};
  for (const name of ["global", "project"]) {
    const data = layerData[name];
    if (data && data.servers && typeof data.servers === "object") {
      Object.assign(servers, data.servers);
    }
  }
  if (cfg.mcp && cfg.mcp.servers && typeof cfg.mcp.servers === "object") {
    Object.assign(servers, cfg.mcp.servers);
  }
  const names = Object.keys(servers);
  if (names.length === 0) {
    return row("storage", "mcp", "mcp", "off",
      "none configured (optional — MCP tools are auto-discovered by the agent)",
      "devbuddy mcp add <name> stdio --command <cmd>");
  }
  // Spec sanity: stdio needs a command, http/sse needs a url.
  const malformed = names.filter((n) => {
    const s = servers[n] || {};
    const transport = s.transport || "stdio";
    if (transport === "stdio") return !s.command;
    if (transport === "http" || transport === "sse") return !s.url;
    return false;
  });
  if (malformed.length > 0) {
    return row("storage", "mcp", "mcp", "broken",
      `malformed: ${malformed.join(", ")} — stdio needs --command, http needs --url`,
      malformed.map((n) => `devbuddy mcp remove ${n}`).join(" && ") + "  (then re-add with the required fields)");
  }
  return row("storage", "mcp", "mcp", "ok",
    `${names.length} configured: ${names.join(", ")} (live-test each: devbuddy mcp test <name>)`);
}

// --- agent & phone ---------------------------------------------------------

function checkAgent(cfg) {
  const steps = cfg.agentMaxSteps;
  const num = Number(steps);
  if (!(Number.isInteger(num) && num > 0)) {
    return row("agent", "agent", "agent", "broken",
      `agentMaxSteps is '${steps}' — must be a positive integer`,
      "devbuddy config set agentMaxSteps 20");
  }
  if (cfg.agentEnabled) {
    let detail = `enabled · max-steps ${steps}`;
    if (cfg.agentYolo) detail += " · ⚠ yolo";
    return row("agent", "agent", "agent", "ok", detail);
  }
  return row("agent", "agent", "agent", "notConfigured",
    `off (optional) · max-steps ${steps}`,
    "devbuddy agent toggle");
}

function checkPhone(cfg) {
  if (!cfg.phoneControlEnabled) {
    return row("agent", "phone", "phone", "off",
      "disabled (optional — lets the AI control your Android phone)",
      "devbuddy phone enable   (ollama-only, strict trust gate)");
  }
  const mode = cfg.phoneControlMode || "adb";
  if (!["adb", "rish"].includes(mode)) {
    return row("agent", "phone", "phone", "broken",
      `enabled but mode '${mode}' is invalid (valid: adb | rish)`,
      "devbuddy phone enable --mode adb   (re-enable with a valid mode)");
  }
  const providerId = getActiveProviderId();
  if (providerId !== "ollama") {
    return row("agent", "phone", "phone", "broken",
      `enabled (${mode}) but active provider is ${PROVIDERS[providerId]?.name || providerId} — phone control is ollama-only`,
      "devbuddy auth switch ollama");
  }
  const available = checkPhoneAvailable(mode, cfg.phoneControlRishPath || "");
  if (available.ok) {
    let detail = `enabled · ${mode}`;
    if (mode === "adb" && available.deviceCount) detail += ` · ${available.deviceCount} device(s)`;
    return row("agent", "phone", "phone", "ok", detail);
  }
  const fix = mode === "adb"
    ? "check adb is installed + USB debugging on + device connected (adb devices), then: devbuddy phone test"
    : "check Shizuku is running and rish is reachable (devbuddy phone rish-path /path/to/rish), then: devbuddy phone test";
  return row("agent", "phone", "phone", "broken",
    `enabled (${mode}) but not reachable: ${available.error || "no device"}`, fix);
}

// --- extras ----------------------------------------------------------------

function checkUpdater(cfg) {
  const mode = cfg.autoUpdate || "prompt";
  if (!["off", "prompt", "silent"].includes(mode)) {
    return row("extras", "updater", "updater", "broken",
      `autoUpdate is '${mode}' — valid: off | prompt | silent`,
      "devbuddy config set autoUpdate prompt");
  }
  const rel = relativeTime(cfg.lastUpdateCheck);
  return row("extras", "updater", "updater", "ok",
    `mode=${mode} · last checked ${rel || "never checked"}`);
}

async function checkNetwork() {
  try {
    const res = await fetch("https://api.github.com", {
      headers: { "User-Agent": "DevBuddy-CLI" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status < 500) {
      return row("extras", "network", "network", "ok", `GitHub API reachable (HTTP ${res.status})`);
    }
    return row("extras", "network", "network", "broken",
      `cannot reach GitHub API (HTTP ${res.status}) — update checks + install scripts will fail`,
      "check your connection/firewall; if your network is fine, file an issue (see below)");
  } catch (e) {
    return row("extras", "network", "network", "broken",
      `cannot reach GitHub API (${e?.message || e}) — update checks + install scripts will fail`,
      "check your connection/firewall; if your network is fine, file an issue (see below)");
  }
}

function checkGit() {
  try {
    const out = execSync("git --version", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return row("extras", "git", "git", "ok", out);
  } catch {
    return row("extras", "git", "git", "off",
      "not installed — `commit`, `review`, `git_diff` need it",
      "install git (apt install git / brew install git / https://git-scm.com)");
  }
}

function checkRemote(cfg) {
  if (cfg.experimentalRemoteAI) {
    return row("extras", "remote", "remote", "ok", "enabled (experimental)");
  }
  return row("extras", "remote", "remote", "off",
    "off (optional — SSH / Claude Desktop remote-AI connector)",
    "devbuddy config set experimentalRemoteAI true");
}

function checkActAsMcp(cfg) {
  if (cfg.experimentalActAsMcp) {
    return row("extras", "act-as-mcp", "act-as-mcp", "ok", "enabled (experimental)");
  }
  return row("extras", "act-as-mcp", "act-as-mcp", "off",
    "off (optional — run DevBuddy itself as an MCP server for other clients)",
    "devbuddy config set experimentalActAsMcp true");
}

// --- collect + render ------------------------------------------------------

function summarize(rows) {
  const s = { ok: 0, notConfigured: 0, broken: 0, off: 0 };
  for (const r of rows) s[r.status] = (s[r.status] || 0) + 1;
  return s;
}

async function collectRows(cfg, opts) {
  const rows = [];

  // core (7 + 1 with --live)
  rows.push(checkNode());
  rows.push(checkConfig());
  rows.push(checkOnboarding(cfg));
  rows.push(checkProvider(cfg));
  rows.push(checkApiKey());
  rows.push(checkModel(cfg));
  rows.push(checkContext());
  if (opts.live) rows.push(await checkLive());

  // storage (4)
  rows.push(checkChats());
  rows.push(checkTodos());
  rows.push(checkHistory());
  rows.push(checkMcp(cfg));

  // agent & phone (2)
  rows.push(checkAgent(cfg));
  rows.push(checkPhone(cfg));

  // extras (5)
  rows.push(checkUpdater(cfg));
  rows.push(await checkNetwork());
  rows.push(checkGit());
  rows.push(checkRemote(cfg));
  rows.push(checkActAsMcp(cfg));

  return rows;
}

function renderRows(rows) {
  let lastCat = null;
  for (const r of rows) {
    if (r.category !== lastCat) {
      ui.heading(r.category);
      lastCat = r.category;
    }
    const meta = STATUS_META[r.status] || { icon: "?", color: (s) => s };
    console.log(
      `  ${meta.color(meta.icon)} ${ui.theme.heading(r.label.padEnd(18))} ${r.detail}`
    );
    if (r.fix) {
      console.log(ui.theme.muted(" ".repeat(23) + "fix: " + r.fix));
    }
  }
}

function renderFooter(s, rows) {
  const parts = [ui.theme.ok(`${s.ok} ok`)];
  if (s.notConfigured > 0) parts.push(ui.theme.warn(`${s.notConfigured} not configured`));
  if (s.broken > 0) parts.push(ui.theme.err(`${s.broken} broken`));
  if (s.off > 0) parts.push(ui.theme.muted(`${s.off} off (optional)`));
  ui.blank();
  console.log("  " + parts.join(" · "));
  ui.blank();
  if (s.broken > 0) {
    ui.warn("Something shows ✗ even though you configured it? Tell us — that's a bug:");
    ui.muted("  " + ISSUES_URL);
    ui.muted("  attach a machine-readable report:  devbuddy features --json");
  } else if (s.notConfigured > 0) {
    ui.muted("nothing broken. items marked ! just need setup (commands above).");
    ui.muted("  " + ISSUES_URL);
  } else {
    ui.ok("every feature is configured and healthy.");
  }
}

export function register(program) {
  program
    .command("features")
    .description("Review every feature: configured? working? broken? (v1.2.5)")
    .option("--json", "Print a machine-readable JSON report (attach to GitHub issues).")
    .option("--live", "Also ping the active AI provider end-to-end (~8 tokens).")
    .option("--category <name>", "Only check one category: core | storage | agent | extras.")
    .option("--quiet", "Only show 'not configured' (!) and 'broken' (✗) rows.")
    .action(async (opts) => {
      if (opts.category && !CATEGORIES.includes(opts.category)) {
        ui.error(`unknown category '${opts.category}'. valid: ${CATEGORIES.join(" | ")}`);
        process.exit(1);
      }

      const cfg = loadConfig();
      const all = await collectRows(cfg, opts);

      let rows = all;
      if (opts.category) rows = rows.filter((r) => r.category === opts.category);
      if (opts.quiet) rows = rows.filter((r) => r.status === "notConfigured" || r.status === "broken");

      const s = summarize(rows);

      if (opts.json) {
        // ONLY JSON on stdout — cleanly parseable with JSON.parse.
        const report = {
          tool: "devbuddy-features",
          version: getVersion(),
          generatedAt: new Date().toISOString(),
          summary: s,
          features: rows.map((r) => {
            const o = {
              category: r.category,
              id: r.id,
              label: r.label,
              status: r.status,
              detail: r.detail,
            };
            if (r.fix) o.fix = r.fix;
            return o;
          }),
        };
        ui.printJson(report);
        process.exitCode = s.broken > 0 ? 1 : 0;
        return;
      }

      ui.title(`devbuddy features — v${getVersion()}`);
      ui.blank();
      renderRows(rows);
      renderFooter(s, rows);
      process.exitCode = s.broken > 0 ? 1 : 0;
    });
}
