// devbuddy — minimal AI-powered dev CLI.
// Entry point: wires up Commander, global flags, all subcommands, and the
// non-blocking auto-update check.

import { Command } from "commander";
import * as ui from "./ui.js";
import { getVersion } from "./ui.js";
import { loadConfig } from "./store.js";
import { checkForUpdates } from "./updater/updater.js";

import { register as registerOnboard }    from "./commands/onboard.js";
import { register as registerAuth }       from "./commands/auth.js";
import { register as registerAsk }        from "./commands/ask.js";
import { register as registerSummarize }  from "./commands/summarize.js";
import { register as registerExplain }    from "./commands/explain.js";
import { register as registerTranslate }  from "./commands/translate.js";
import { register as registerChat }       from "./commands/chat.js";
import { register as registerTodo }       from "./commands/todo.js";
import { register as registerConfig }     from "./commands/config.js";
import { register as registerAgent }      from "./commands/agent.js";
import { register as registerUpdate }     from "./commands/update.js";
import { register as registerInit }       from "./commands/init.js";
import { register as registerMcp }        from "./commands/mcp.js";
import { register as registerRemote }     from "./commands/remote.js";
import { register as registerActAsMcp }   from "./commands/act-as-mcp.js";
import { register as registerCommit }     from "./commands/commit.js";
import { register as registerReview }     from "./commands/review.js";
import { register as registerDoctor }     from "./commands/doctor.js";
import { register as registerHistory }    from "./commands/history.js";
import { register as registerPhone }      from "./commands/phone.js";
import { register as registerFeatures }   from "./commands/features.js";
import { register as registerBenchmark }  from "./commands/benchmark.js";
import { recordCommand }                  from "./commands/history.js";
import { launchUnified }                  from "./commands/repl.js";

const SKIP_UPDATE_FOR = new Set([
  "onboard", "update", "auth", "config", "todo", "chat", "init", "help", "mcp", "remote",
  "act-as-mcp", "commit", "review", "doctor", "history", "features", "phone", "benchmark",
  undefined,
]);

export function run() {
  const program = new Command();

  program
    .name("devbuddy")
    .description(
      "DevBuddy v1.3.0 — AI-powered dev CLI.\n\n" +
      "  devbuddy                Launch unified chat + agent REPL (streaming responses).\n" +
      "  devbuddy --agent        Launch directly in agent mode.\n" +
      "  onboard                 One-time setup wizard (REQUIRED before AI commands).\n" +
      "  ask                     Ask a question (streaming by default).\n" +
      "  summarize               Condense a file or stdin.\n" +
      "  explain                 Explain code in plain language.\n" +
      "  translate               Translate text.\n" +
      "  chat                    Multi-message chat (alias for `devbuddy`).\n" +
      "  agent                   Agentic harness — file ops, shell, sub-agents, MCP.\n" +
      "  commit                  Generate conventional commit message from git diff.\n" +
      "  review                  AI code review on a diff or commit.\n" +
      "  doctor                  Diagnose setup issues.\n" +
      "  features                Review every feature — configured? working?\n" +
      "  history                 Show command history.\n" +
      "  init                    Create a DEVBUDDY.md template.\n" +
      "  mcp                     Manage MCP servers (connect to external MCP servers).\n" +
      "  act-as-mcp              ⚠️ Run DevBuddy itself as an MCP server.\n" +
      "  remote                  ⚠️ Experimental remote-AI (SSH / Claude Desktop).\n" +
      "  phone                   ⚠️ Experimental: AI phone control via ADB/Shizuku (Ollama only).\n" +
      "  todo                    Manage quick todos.\n" +
      "  auth                    Manage API keys and custom providers across providers.\n" +
      "  benchmark               Benchmark response latency across configured providers.\n" +
      "  config                  View, edit, export, and import settings.\n" +
      "  update                  Check for and install updates.\n\n" +
      "Providers: HuggingFace (free) · OpenAI · Anthropic · Groq (free) · OpenRouter · Ollama · Together · Mistral · Cohere + Custom Providers\n" +
      "Project context: ./DEVBUDDY.md → ~/.devbuddy/DEVBUDDY.md\n" +
      "MCP: ~/.devbuddy/mcp.json | ./.devbuddy/mcp.json\n" +
      "Storage: ~/.devbuddy/  (config.json, chats/, todos.json, history.jsonl)"
    )
    .version(getVersion(), "-v, --version")
    .helpOption("-h, --help", "Show this help.")
    .option("--agent", "Launch directly in agent mode (unified REPL).")
    .option("--yolo", "Skip agent confirmations (DANGEROUS). Only applies with --agent.")
    .option("--project", "Scope the chat to the current directory.")
    .option("-c, --continue", "Resume the most recent chat.")
    .option("--chat <id>", "Resume a specific chat by ID.")
    .option("--allow <dir>", "Grant access to an additional directory (agent mode). Repeatable.", (v, acc) => { (acc || []).push(v); return acc; }, [])
    .option("--phone", "Launch unified REPL with phone control enabled (experimental, requires `devbuddy phone enable`).")
    .action(async (opts) => {
      await launchUnified(opts);
    });

  program.option("--no-color", "Disable colored output.");
  program.hook("preAction", (cmd, actionCmd) => {
    const opts = cmd.opts();
    if (opts && opts.color === false) {
      ui.setColorEnabled(false);
    }

    try {
      const action = actionCmd || cmd;
      if (action.name() !== program.name()) {
        const path = [];
        let cur = action;
        while (cur && cur.parent) {
          path.unshift(cur.name());
          cur = cur.parent;
        }
        if (path.length > 0) {
          let args = process.argv.slice(2);
          for (const token of path) {
            const i = args.indexOf(token);
            if (i === -1) {
              args = [];
              break;
            }
            args.splice(i, 1);
          }
          recordCommand(path.join(" "), args);
        }
      }
    } catch {
      // History recording
    }
  });

  registerOnboard(program);
  registerAuth(program);
  registerAsk(program);
  registerSummarize(program);
  registerExplain(program);
  registerTranslate(program);
  registerChat(program);
  registerTodo(program);
  registerConfig(program);
  registerAgent(program);
  registerUpdate(program);
  registerInit(program);
  registerMcp(program);
  registerRemote(program);
  registerActAsMcp(program);
  registerCommit(program);
  registerReview(program);
  registerDoctor(program);
  registerHistory(program);
  registerPhone(program);
  registerFeatures(program);
  registerBenchmark(program);

  const cmdName = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : undefined;
  const cfg = loadConfig();

  if (!SKIP_UPDATE_FOR.has(cmdName) && (cfg.autoUpdate || "prompt") !== "off") {
    (async () => {
      try {
        await checkForUpdates();
      } catch {}
    })();
  }

  program.parseAsync(process.argv).catch((e) => {
    ui.error(e?.message || String(e));
    process.exit(1);
  });
}
