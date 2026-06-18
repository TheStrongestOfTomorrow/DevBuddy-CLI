// `devbuddy translate "<text>"` — translate text between languages.

import { completeWithRetry } from "../ai.js";
import { loadConfig } from "../store.js";
import * as ui from "../ui.js";

export function register(program) {
  program
    .command("translate <text...>")
    .description("Translate text. Default target language from config.")
    .option("-t, --to <lang>", "Target language (e.g. 'en', 'zh', 'es', 'fr').")
    .option("--json", "Output raw JSON.")
    .action(async (textParts, opts) => {
      const text = textParts.join(" ").trim();
      if (!text) {
        ui.error("text is required");
        process.exit(1);
      }

      const cfg = loadConfig();
      const to = opts.to || cfg.translateTo || "en";

      const system =
        `You are a professional translator. Translate the user's text into ${to}. ` +
        `Preserve meaning, tone, and formatting. ` +
        `Output ONLY the translation — no preamble, no quotes, no commentary.`;

      const spinner = new ui.Spinner(`Translating to ${to}`);
      spinner.start();

      try {
        const result = await completeWithRetry(text, { system }, 2);
        spinner.succeed();

        if (opts.json) {
          ui.printJson({ text, to, translation: result });
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
