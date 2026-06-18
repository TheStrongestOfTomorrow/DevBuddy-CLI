// devbuddy — minimal AI-powered dev CLI.
// Entry point: wires up Commander, global flags, and all subcommands.
//
// AI backend: HuggingFace Inference API (free tier, rate-limited).
// Users set their HF token via `devbuddy auth set <token>`.

import { Command } from "commander";
import * as ui from "./ui.js";
import { getVersion } from "./ui.js";
import { register as registerAsk }       from "./commands/ask.js";
import { register as registerSummarize } from "./commands/summarize.js";
import { register as registerExplain }   from "./commands/explain.js";
import { register as registerTranslate } from "./commands/translate.js";
import { register as registerTodo }      from "./commands/todo.js";
import { register as registerConfig }    from "./commands/config.js";
import { register as registerAuth }      from "./commands/auth.js";

export function run() {
  const program = new Command();

  program
    .name("devbuddy")
    .description(
      "A minimal AI-powered CLI that helps developers.\n\n" +
      "  ask        Ask a question, get an AI answer.\n" +
      "  summarize  Condense a file or stdin into key points.\n" +
      "  explain    Explain code in plain language.\n" +
      "  translate  Translate text to another language.\n" +
      "  todo       Manage quick todos with priorities.\n" +
      "  config     View and edit persistent settings.\n" +
      "  auth       Manage your HuggingFace access token.\n\n" +
      "AI backend: HuggingFace Inference API (free tier, rate-limited).\n" +
      "First time? Run: devbuddy auth set hf_xxx\n" +
      "Get a free token: https://huggingface.co/settings/tokens\n" +
      "Storage: ~/.devbuddy/  (config.json, todos.json)"
    )
    .version(getVersion(), "-v, --version")
    .helpOption("-h, --help", "Show this help.");

  // Global options
  program.option("--no-color", "Disable colored output.");
  program.hook("preAction", (cmd) => {
    const opts = cmd.opts();
    if (opts && opts.color === false) {
      ui.setColorEnabled(false);
    }
  });

  // Register subcommands
  registerAuth(program);
  registerAsk(program);
  registerSummarize(program);
  registerExplain(program);
  registerTranslate(program);
  registerTodo(program);
  registerConfig(program);

  // Default action: show help if no command given
  if (process.argv.length <= 2) {
    program.outputHelp();
    process.exit(0);
  }

  program.parseAsync(process.argv).catch((e) => {
    ui.error(e?.message || String(e));
    process.exit(1);
  });
}
