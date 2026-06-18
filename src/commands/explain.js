// `devbuddy explain <file|->` — explain code in plain language.

import { readFileSync } from "node:fs";
import { completeWithRetry, isOnboarded, isAuthenticated, warnRateLimit, getActiveProvider, getActiveModel } from "../ai/providers.js";
import { loadConfig } from "../store.js";
import { systemPromptSuffix, findDevbuddyMd } from "../prompt.js";
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

function readInput(file) {
  if (file === "-") return readFileSync(0, "utf8");
  return readFileSync(file, "utf8");
}

export function register(program) {
  program
    .command("explain <file>")
    .description("Explain code in plain language. Use '-' for stdin.")
    .option("--level <level>", "beginner | intermediate | expert", "intermediate")
    .option("-m, --model <name>", "Override the model for this call.")
    .option("--max-tokens <n>", "Max output tokens.", "1024")
    .option("--json", "Output raw JSON.")
    .action(async (file, opts) => {
      requireOnboarding();
      let code;
      try { code = readInput(file); }
      catch (e) { ui.error(`cannot read '${file}': ${e.message}`); process.exit(1); }

      if (!code.trim()) { ui.error("input is empty"); process.exit(1); }
      warnRateLimit();

      const cfg = loadConfig();
      const level = opts.level || "intermediate";
      const system =
        `You are a programming teacher. Explain the given code clearly for a ${level} reader. ` +
        `Structure: (1) one-paragraph summary, (2) key parts walked through, (3) any gotchas. ` +
        `Use fenced code blocks for snippets. Output language: ${cfg.language}.` + systemPromptSuffix();

      const dbMd = findDevbuddyMd();
      if (dbMd) ui.muted(`using project context: ${dbMd.path}`);

      const spinner = new ui.Spinner("Explaining");
      spinner.start();

      try {
        const explanation = await completeWithRetry(
          `Explain this code:\n\n\`\`\`\n${code}\n\`\`\``,
          { system, model: opts.model, maxTokens: parseInt(opts.maxTokens, 10) || 1024 },
          2
        );
        spinner.succeed();

        if (opts.json) {
          ui.printJson({
            file, level,
            provider: getActiveProvider().id,
            model: opts.model || getActiveModel(),
            explanation,
          });
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
