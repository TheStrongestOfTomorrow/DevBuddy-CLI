// `devbuddy review` — AI code review on a git diff.

import { execSync } from "node:child_process";
import { completeWithRetry, isOnboarded, isAuthenticated, warnRateLimit } from "../ai/providers.js";
import { systemPromptSuffix } from "../prompt.js";
import * as ui from "../ui.js";

function requireOnboarding() {
  if (!isOnboarded()) {
    ui.error("DevBuddy is not onboarded yet.\n  Run: devbuddy onboard");
    process.exit(1);
  }
}

export function register(program) {
  program
    .command("review")
    .description("AI code review on staged/unstaged changes or a specific commit.")
    .option("--staged", "Review staged changes (default).")
    .option("--unstaged", "Review unstaged changes.")
    .option("--commit <sha>", "Review a specific commit's diff.")
    .option("-m, --model <name>", "Override the model.")
    .option("--no-stream", "Disable streaming.")
    .action(async (opts) => {
      requireOnboarding();
      warnRateLimit();

      let diffCmd;
      let label;
      if (opts.commit) {
        diffCmd = `git show ${opts.commit}`;
        label = `commit ${opts.commit}`;
      } else if (opts.unstaged) {
        diffCmd = "git diff";
        label = "unstaged changes";
      } else {
        diffCmd = "git diff --cached";
        label = "staged changes";
      }

      let diff;
      try {
        diff = execSync(diffCmd, { encoding: "utf8", timeout: 10_000, maxBuffer: 500_000 });
      } catch (e) {
        ui.error(`failed to get diff: ${e.message}`);
        process.exit(1);
      }

      if (!diff.trim()) {
        ui.warn(`no ${label} to review.`);
        return;
      }

      const truncated = diff.length > 30_000
        ? diff.slice(0, 30_000) + `\n... (truncated, ${diff.length - 30_000} more chars)`
        : diff;

      const system =
        "You are an expert code reviewer. Review the diff for: bugs, security issues, " +
        "performance, readability, and adherence to common best practices. " +
        "Structure: (1) Summary, (2) Issues found (with severity: HIGH/MEDIUM/LOW), " +
        "(3) Suggestions, (4) Overall verdict (LGTM / needs changes). " +
        "Be concise but thorough. Don't restate the diff." + systemPromptSuffix();

      const prompt = `Review this code diff (${label}):\n\n${truncated}`;

      ui.muted(`reviewing ${label} (${diff.length} chars)…`);
      ui.blank();

      try {
        // Try streaming
        const { completeStream } = await import("../ai/providers.js");
        await completeStream(prompt, {
          system,
          model: opts.model,
          maxTokens: 2000,
          onToken: (chunk) => process.stdout.write(chunk),
        });
        ui.blank(); ui.blank();
      } catch (e) {
        ui.error(e.message);
        process.exit(1);
      }
    });
}
