// `devbuddy history` — show command history across sessions.

import { readFileSync, existsSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { APP_DIR } from "../ui.js";
import * as ui from "../ui.js";

const HISTORY_FILE = join(APP_DIR, "history.jsonl");

export function register(program) {
  program
    .command("history")
    .description("Show command history across sessions.")
    .option("-n, --lines <n>", "Number of entries to show (default: 20).", "20")
    .option("--grep <pattern>", "Filter by regex pattern.")
    .option("--clear", "Clear the history file.")
    .action((opts) => {
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
          const re = new RegExp(opts.grep, "i");
          filtered = entries.filter((e) => re.test(JSON.stringify(e)));
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

// Helper to record a command (called from index.js preAction hook).
export function recordCommand(cmd, args) {
  try {
    if (!existsSync(APP_DIR)) mkdirSync(APP_DIR, { recursive: true });
    const entry = JSON.stringify({ ts: new Date().toISOString(), cmd, args: (args || []).join(" ") });
    appendFileSync(HISTORY_FILE, entry + "\n");
  } catch {}
}
