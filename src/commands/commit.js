// `devbuddy commit` — generate conventional commit messages from git diff.

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
    .command("commit")
    .description("Generate a conventional commit message from staged changes.")
    .option("--staged", "Use staged changes (default).")
    .option("--unstaged", "Use unstaged changes instead of staged.")
    .option("-m, --model <name>", "Override the model.")
    .option("--apply", "Run 'git commit' with the generated message (after confirm).")
    .action(async (opts) => {
      requireOnboarding();
      warnRateLimit();

      // Get the diff
      const useStaged = !opts.unstaged;
      const diffCmd = useStaged ? "git diff --cached" : "git diff";
      let diff;
      try {
        diff = execSync(diffCmd, { encoding: "utf8", timeout: 10_000, maxBuffer: 500_000 });
      } catch (e) {
        ui.error(`failed to get git diff: ${e.message}`);
        process.exit(1);
      }

      if (!diff.trim()) {
        ui.warn(`no ${useStaged ? "staged" : "unstaged"} changes to commit.`);
        ui.muted(useStaged ? "  stage changes with: git add <files>" : "  make changes first");
        return;
      }

      // Truncate large diffs
      const truncated = diff.length > 20_000
        ? diff.slice(0, 20_000) + `\n... (truncated, ${diff.length - 20_000} more chars)`
        : diff;

      const system =
        "You are a helpful assistant that generates conventional commit messages. " +
        "Format: 'type(scope): subject' followed by an optional body. " +
        "Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci. " +
        "Keep the subject line under 72 chars. Don't add Co-authored-by or Generated-by lines." +
        systemPromptSuffix();

      const prompt = `Generate a conventional commit message for this diff:\n\n${truncated}\n\nOutput ONLY the commit message, nothing else.`;

      const spinner = new ui.Spinner("Generating commit message");
      spinner.start();

      let message;
      try {
        message = await completeWithRetry(prompt, { system, model: opts.model, maxTokens: 500 }, 2);
        spinner.succeed();
      } catch (e) {
        spinner.fail();
        ui.error(e.message);
        process.exit(1);
      }

      ui.blank();
      ui.heading("suggested commit message");
      ui.blank();
      console.log(message);
      ui.blank();

      if (opts.apply) {
        const answer = await _prompt("  Commit with this message? [y/N] ");
        if (/^\s*y(es)?\s*$/i.test(answer)) {
          try {
            execSync(`git commit -m ${JSON.stringify(message)}`, { stdio: "inherit" });
            ui.ok("committed.");
          } catch (e) {
            ui.error(`git commit failed: ${e.message}`);
          }
        } else {
          ui.muted("skipped. copy the message above and run: git commit -m \"...\"");
        }
      } else {
        ui.muted("to apply: devbuddy commit --apply   (or)   git commit -m \"<paste message>\"");
      }
    });
}

function _prompt(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString();
      if (buf.includes("\n")) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        resolve(buf.trim());
      }
    };
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}
