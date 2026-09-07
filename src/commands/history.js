// `devbuddy history` — show command history across sessions.

import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { APP_DIR } from "../ui.js";
import * as ui from "../ui.js";

const HISTORY_FILE = join(APP_DIR, "history.jsonl");

// API keys / tokens must never land in history. Masked before writing.
// Covers the common key shapes: sk- (OpenAI), gsk- (Groq), hf_ (HuggingFace),
// ghp_/github_pat_ (GitHub), xoxb-/xoxp- (Slack), co_ (Cohere).
const SECRET_RE = /\b(sk-|gsk-|hf_|ghp_|github_pat_|xoxb-|xoxp-|co_)[A-Za-z0-9_-]{6,}/g;

function maskSecrets(text) {
  return String(text).replace(SECRET_RE, "$1…[masked]");
}

// Positional masking: `devbuddy auth set <key>` stores the key at args[0]
// and `devbuddy auth add <provider> <key>` at args[1].
function maskArgs(cmd, args) {
  const out = [...(args || [])];
  if (cmd === "auth set" && out.length > 0) out[0] = "[masked]";
  else if (cmd === "auth add" && out.length > 1) out[1] = "[masked]";
  return out;
}

export function register(program) {
  program
    .command("history")
    .description("Show command history across sessions.")
    .option("-n, --lines <n>", "Number of entries to show (default: 20).", "20")
    .option("--grep <pattern>", "Filter by regex pattern.")
    .option("--clear", "Clear the history file.")
    .option("--stats", "Show usage stats (top commands, commands/day).")
    .action((opts) => {
      if (opts.stats) {
        renderStats();
        return;
      }

      if (opts.clear) {
        try {
          if (existsSync(HISTORY_FILE)) {
            writeFileSync(HISTORY_FILE, "");
            ui.ok("history cleared.");
          } else {
            ui.muted("history file does not exist.");
          }
        } catch (e) {
          ui.error(e.message);
        }
        return;
      }

      if (!existsSync(HISTORY_FILE)) {
        ui.muted("(no history yet)");
        ui.muted("  history is saved automatically when commands run.");
        return;
      }

      try {
        const raw = readFileSync(HISTORY_FILE, "utf8");
        const lines = raw.split("\n").filter(Boolean);
        const entries = [];
        for (const line of lines) {
          try { entries.push(JSON.parse(line)); }
          catch {}
        }

        let filtered = entries;
        if (opts.grep) {
          // Guard against invalid regexes: `history --grep "["` used to dump
          // a raw RegExp error and exit 0. Now: clear message + exit 1.
          try {
            const re = new RegExp(opts.grep, "i");
            filtered = entries.filter((e) => re.test(JSON.stringify(e)));
          } catch (e) {
            ui.error(`--grep pattern is not a valid regex: ${e.message}`);
            process.exit(1);
          }
        }

        const n = parseInt(opts.lines, 10) || 20;
        const recent = filtered.slice(-n).reverse();

        if (recent.length === 0) {
          ui.muted("(no matching history entries)");
          return;
        }

        ui.title(`devbuddy history (last ${recent.length})`);
        ui.blank();
        for (const e of recent) {
          const date = e.ts ? new Date(e.ts).toLocaleString() : "?";
          const cmd = e.cmd || "(unknown)";
          const args = e.args ? " " + e.args : "";
          console.log(`  ${ui.theme.muted(date)}  ${ui.theme.value(cmd)}${ui.theme.muted(args)}`);
        }
        ui.blank();
        ui.muted(`  showing ${recent.length} of ${entries.length} total entries`);
        ui.muted(`  filter: devbuddy history --grep <pattern>`);
        ui.muted(`  clear:  devbuddy history --clear`);
      } catch (e) {
        ui.error(e.message);
      }
    });
}

// Usage stats: top commands + commands-per-day activity.
function renderStats() {
  if (!existsSync(HISTORY_FILE)) {
    ui.muted("(no history yet)");
    ui.muted("  history is saved automatically when commands run.");
    return;
  }
  try {
    const raw = readFileSync(HISTORY_FILE, "utf8");
    const entries = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e && e.ts && e.cmd) entries.push(e);
      } catch {}
    }
    if (entries.length === 0) {
      ui.muted("(no recorded commands yet)");
      return;
    }

    const perCmd = new Map();
    for (const e of entries) perCmd.set(e.cmd, (perCmd.get(e.cmd) || 0) + 1);
    const top = [...perCmd.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    ui.title("devbuddy history stats");
    ui.blank();
    ui.heading("top commands");
    for (const [cmd, n] of top) {
      console.log(`  ${ui.theme.value(String(n).padStart(4))}×  ${cmd}`);
    }

    ui.blank();
    ui.heading("activity");
    const first = new Date(entries[0].ts);
    const last = new Date(entries[entries.length - 1].ts);
    const spanDays = (last.getTime() - first.getTime()) / 86400000;
    const days = Math.max(1, Math.ceil(spanDays));
    const perDay = (entries.length / days).toFixed(1);
    ui.kv("total commands", String(entries.length));
    ui.kv("first run", first.toLocaleString());
    ui.kv("latest run", last.toLocaleString());
    ui.kv("commands/day", `~${perDay} (over ${days} day(s))`);
  } catch (e) {
    ui.error(e.message);
  }
}

// Helper to record a command (called from index.js preAction hook).
export function recordCommand(cmd, args) {
  try {
    if (!existsSync(APP_DIR)) mkdirSync(APP_DIR, { recursive: true });
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      cmd,
      args: maskSecrets(maskArgs(cmd, args).join(" ")),
    });
    appendFileSync(HISTORY_FILE, maskSecrets(entry) + "\n");
  } catch {}
}
