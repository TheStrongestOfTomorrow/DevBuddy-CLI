// `devbuddy translate "<text>"` — translate text between languages.

import { completeWithRetry, isAuthenticated, warnRateLimit, getAuth } from "../ai.js";
import { loadConfig } from "../store.js";
import * as ui from "../ui.js";

export function register(program) {
  program
    .command("translate <text...>")
    .description("Translate text. Default target language from config.")
    .option("-t, --to <lang>", "Target language (e.g. 'en', 'zh', 'es', 'fr').")
    .option("-m, --model <name>", "Override the HuggingFace model for this call.")
    .option("--max-tokens <n>", "Max output tokens.", "1024")
    .option("--json", "Output raw JSON.")
    .action(async (textParts, opts) => {
      const text = textParts.join(" ").trim();
      if (!text) {
        ui.error("text is required");
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
      const to = opts.to || cfg.translateTo || "en";

      const system =
        `You are a professional translator. Translate the user's text into ${to}. ` +
        `Preserve meaning, tone, and formatting. ` +
        `Output ONLY the translation — no preamble, no quotes, no commentary.`;

      const spinner = new ui.Spinner(`Translating to ${to}`);
      spinner.start();

      try {
        const result = await completeWithRetry(
          text,
          {
            system,
            model: opts.model,
            maxTokens: parseInt(opts.maxTokens, 10) || 1024,
          },
          2
        );
        spinner.succeed();

        if (opts.json) {
          ui.printJson({ text, to, model: opts.model || getAuth().model, translation: result });
          return;
        }
        ui.blank();
        ui.body(result);
        ui.blank();
      } catch (e) {
        spinner.fail();
        ui.error(e?.message || String(e));
        process.exit(1);
      }
    });
}
