// `devbuddy ask "<question>"` — AI Q&A in the terminal.

import { completeWithRetry } from "../ai.js";
import { loadConfig } from "../store.js";
import * as ui from "../ui.js";

export function register(program) {
  program
    .command("ask <question...>")
    .description("Ask any question, get an AI answer in the terminal.")
    .option("-s, --system <prompt>", "Override the system prompt.")
    .option("--json", "Output raw JSON instead of pretty text.")
    .option("--thinking", "Enable chain-of-thought (slower, deeper).")
    .action(async (questionParts, opts) => {
      const question = questionParts.join(" ").trim();
      if (!question) {
        ui.error("question is required");
        process.exit(1);
      }

      const cfg = loadConfig();
      const system =
        opts.system ||
        `You are a helpful, concise developer assistant. Answer in ${cfg.language}. ` +
        `Prefer clear explanations over long essays. Use code blocks when useful.`;

      const spinner = new ui.Spinner("Thinking");
      spinner.start();

      try {
        const answer = await completeWithRetry(
          question,
          { system, thinking: !!opts.thinking },
          2
        );
        spinner.succeed();

        if (opts.json) {
          ui.printJson({ question, answer });
          return;
        }
        ui.blank();
        ui.body(answer);
        ui.blank();
      } catch (e) {
        spinner.fail();
        ui.error(e?.message || String(e));
        process.exit(1);
      }
    });
}
