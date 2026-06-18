// `devbuddy summarize <file|->` — condense long content into key points.

import { readFileSync } from "node:fs";
import { completeWithRetry } from "../ai.js";
import { loadConfig } from "../store.js";
import * as ui from "../ui.js";

function readInput(file) {
  if (file === "-") {
    return readFileSync(0, "utf8"); // stdin
  }
  return readFileSync(file, "utf8");
}

export function register(program) {
  program
    .command("summarize <file>")
    .description("Summarize a file (use '-' for stdin).")
    .option("-s, --style <style>", "bullets | paragraphs | tldr", "bullets")
    .option("--max <n>", "Max bullets/points (for bullets style).", "5")
    .option("--json", "Output raw JSON.")
    .action(async (file, opts) => {
      let content;
      try {
        content = readInput(file);
      } catch (e) {
        ui.error(`cannot read '${file}': ${e.message}`);
        process.exit(1);
      }

      if (!content.trim()) {
        ui.error("input is empty");
        process.exit(1);
      }

      const cfg = loadConfig();
      const style = opts.style || cfg.summarizeStyle || "bullets";
      const max = parseInt(opts.max, 10) || 5;

      const styleGuide = {
        bullets:
          `Summarize the content as at most ${max} concise bullet points. ` +
          `Each bullet should capture one distinct idea. Use "- " as the bullet marker.`,
        paragraphs:
          `Summarize the content in 2-3 short paragraphs. Plain prose, no bullets.`,
        tldr:
          `Provide a one-sentence TL;DR followed by at most 3 supporting bullets.`,
      }[style] || `Summarize in ${style} style.`;

      const system =
        `You are an expert summarizer. ${styleGuide} ` +
        `Output language: ${cfg.language}. Do not add meta commentary.`;

      const spinner = new ui.Spinner("Summarizing");
      spinner.start();

      try {
        const summary = await completeWithRetry(
          `Summarize the following:\n\n${content}`,
          { system },
          2
        );
        spinner.succeed();

        if (opts.json) {
          ui.printJson({ file, style, summary });
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
