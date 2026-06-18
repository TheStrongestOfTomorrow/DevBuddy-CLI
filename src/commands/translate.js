// `devbuddy translate "<text>"` — translate text between languages.

import { completeWithRetry, isOnboarded, isAuthenticated, warnRateLimit, getActiveProvider, getActiveModel } from "../ai/providers.js";
import { loadConfig } from "../store.js";
import * as ui from "../ui.js";

function requireOnboarding() {
  if (!isOnboarded()) {
    ui.error("DevBuddy is not onboarded yet.\n  Run: devbuddy onboard");
    process.exit(1);
  }
  if (!isAuthenticated()) {
    const p = getActiveProvider();
    ui.error(`No API key set for ${p.name}. Re-run: devbuddy onboard --force`);
    process.exit(1);
  }
}

export function register(program) {
  program
    .command("translate <text...>")
    .description("Translate text. Default target language from config.")
    .option("-t, --to <lang>", "Target language (e.g. 'en', 'zh', 'es', 'fr').")
    .option("-m, --model <name>", "Override the model for this call.")
    .option("--max-tokens <n>", "Max output tokens.", "1024")
    .option("--json", "Output raw JSON.")
    .action(async (textParts, opts) => {
      requireOnboarding();
      const text = textParts.join(" ").trim();
      if (!text) { ui.error("text is required"); process.exit(1); }
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
          { system, model: opts.model, maxTokens: parseInt(opts.maxTokens, 10) || 1024 },
          2
        );
        spinner.succeed();

        if (opts.json) {
          ui.printJson({
            text, to,
            provider: getActiveProvider().id,
            model: opts.model || getActiveModel(),
            translation: result,
          });
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
