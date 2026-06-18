// `devbuddy explain <file|->` — explain code in plain language.

import { readFileSync } from "node:fs";
import { completeWithRetry, isAuthenticated, warnRateLimit, getAuth } from "../ai.js";
import { loadConfig } from "../store.js";
import * as ui from "../ui.js";

function readInput(file) {
  if (file === "-") return readFileSync(0, "utf8");
  return readFileSync(file, "utf8");
}

export function register(program) {
  program
    .command("explain <file>")
    .description("Explain code in plain language. Use '-' for stdin.")
    .option("--level <level>", "beginner | intermediate | expert", "intermediate")
    .option("-m, --model <name>", "Override the HuggingFace model for this call.")
    .option("--max-tokens <n>", "Max output tokens.", "1024")
    .option("--json", "Output raw JSON.")
    .action(async (file, opts) => {
      let code;
      try {
        code = readInput(file);
      } catch (e) {
        ui.error(`cannot read '${file}': ${e.message}`);
        process.exit(1);
      }

      if (!code.trim()) {
        ui.error("input is empty");
        process.exit(1);
      }

      if (!isAuthenticated()) {
        ui.error(
          "No HuggingFace token set.\n" +
          "  Get a free token: https://huggingface.co/settings/tokens\n" +
          "  Then run: devbuddy auth set hf_xxx"
        );
        process.exit(1);
      }

      warnRateLimit();

      const cfg = loadConfig();
      const level = opts.level || "intermediate";

      const system =
        `You are a programming teacher. Explain the given code clearly for a ${level} reader. ` +
        `Structure: (1) one-paragraph summary, (2) key parts walked through, (3) any gotchas. ` +
        `Use fenced code blocks for snippets. Output language: ${cfg.language}.`;

      const spinner = new ui.Spinner("Explaining");
      spinner.start();

      try {
        const explanation = await completeWithRetry(
          `Explain this code:\n\n\`\`\`\n${code}\n\`\`\``,
          {
            system,
            model: opts.model,
            maxTokens: parseInt(opts.maxTokens, 10) || 1024,
          },
          2
        );
        spinner.succeed();

        if (opts.json) {
          ui.printJson({ file, level, model: opts.model || getAuth().model, explanation });
          return;
        }
        ui.blank();
        ui.body(explanation);
        ui.blank();
      } catch (e) {
        spinner.fail();
        ui.error(e?.message || String(e));
        process.exit(1);
      }
    });
}
