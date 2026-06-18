// `devbuddy summarize <file|->` — condense long content into key points.

import { readFileSync } from "node:fs";
import { completeWithRetry, isOnboarded, isAuthenticated, warnRateLimit, getActiveProvider, getActiveModel } from "../ai/providers.js";
import { loadConfig } from "../store.js";
import { systemPromptSuffix, findDevbuddyMd } from "../prompt.js";
import * as ui from "../ui.js";

function requireOnboarding() {
  if (!isOnboarded()) {
    ui.error(
      "DevBuddy is not onboarded yet.\n" +
      "  Run: devbuddy onboard\n" +
      "  (one-time setup, ~1 minute)"
    );
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
    .command("summarize <file>")
    .description("Summarize a file (use '-' for stdin).")
    .option("-s, --style <style>", "bullets | paragraphs | tldr", "bullets")
    .option("--max <n>", "Max bullets/points (for bullets style).", "5")
    .option("-m, --model <name>", "Override the model for this call.")
    .option("--max-tokens <n>", "Max output tokens.", "1024")
    .option("--json", "Output raw JSON.")
    .action(async (file, opts) => {
      requireOnboarding();
      let content;
      try { content = readInput(file); }
      catch (e) { ui.error(`cannot read '${file}': ${e.message}`); process.exit(1); }

      if (!content.trim()) { ui.error("input is empty"); process.exit(1); }
      warnRateLimit();

      const cfg = loadConfig();
      const style = opts.style || cfg.summarizeStyle || "bullets";
      const max = parseInt(opts.max, 10) || 5;
      const styleGuide = {
        bullets: `Summarize the content as at most ${max} concise bullet points. Each bullet should capture one distinct idea. Use "- " as the bullet marker.`,
        paragraphs: `Summarize the content in 2-3 short paragraphs. Plain prose, no bullets.`,
        tldr: `Provide a one-sentence TL;DR followed by at most 3 supporting bullets.`,
      }[style] || `Summarize in ${style} style.`;

      const system = `You are an expert summarizer. ${styleGuide} Output language: ${cfg.language}. Do not add meta commentary.` + systemPromptSuffix();

      const dbMd = findDevbuddyMd();
      if (dbMd) ui.muted(`using project context: ${dbMd.path}`);

      const spinner = new ui.Spinner("Summarizing");
      spinner.start();

      try {
        const summary = await completeWithRetry(
          `Summarize the following:\n\n${content}`,
          { system, model: opts.model, maxTokens: parseInt(opts.maxTokens, 10) || 1024 },
          2
        );
        spinner.succeed();

        if (opts.json) {
          ui.printJson({
            file, style,
            provider: getActiveProvider().id,
            model: opts.model || getActiveModel(),
            summary,
          });
          return;
        }
        ui.blank();
        ui.body(summary);
        ui.blank();
      } catch (e) {
        spinner.fail();
        ui.error(e?.message || String(e));
        process.exit(1);
      }
    });
}
