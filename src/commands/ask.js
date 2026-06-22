// `devbuddy ask "<question>"` — AI Q&A in the terminal.

import { completeWithRetry, completeStream, isOnboarded, isAuthenticated, warnRateLimit, getActiveProvider, getActiveModel } from "../ai/providers.js";
import { loadConfig } from "../store.js";
import { systemPromptSuffix, findDevbuddyMd } from "../prompt.js";
import * as ui from "../ui.js";

function requireOnboarding() {
  if (!isOnboarded()) {
    ui.error(
      "DevBuddy is not onboarded yet.\n" +
      "  Run: devbuddy onboard\n" +
      "  (one-time setup, ~1 minute — picks provider + API key + model)"
    );
    process.exit(1);
  }
  if (!isAuthenticated()) {
    const p = getActiveProvider();
    ui.error(
      `No API key set for ${p.name}.\n` +
      `  Re-run: devbuddy onboard --force\n` +
      `  (or)   devbuddy auth set <key>`
    );
    process.exit(1);
  }
}

export function register(program) {
  program
    .command("ask <question...>")
    .description("Ask any question, get an AI answer in the terminal.")
    .option("-s, --system <prompt>", "Override the system prompt.")
    .option("-m, --model <name>", "Override the model for this call.")
    .option("--max-tokens <n>", "Max output tokens.", "1024")
    .option("--json", "Output raw JSON instead of pretty text.")
    .option("--no-stream", "Disable streaming (wait for full response).")
    .option("--thinking", "Enable step-by-step thinking (default: off for one-shot commands).")
    .action(async (questionParts, opts) => {
      requireOnboarding();
      const question = questionParts.join(" ").trim();
      if (!question) { ui.error("question is required"); process.exit(1); }

      warnRateLimit();

      const cfg = loadConfig();
      const dbMd = findDevbuddyMd();
      const system =
        opts.system ||
        `You are a helpful, concise developer assistant. Answer in ${cfg.language}. ` +
        `Prefer clear explanations over long essays. Use code blocks when useful.` +
        (opts.thinking ? ` Think step-by-step before answering. Show your reasoning, then give the final answer.` : "") +
        systemPromptSuffix();

      if (dbMd) ui.muted(`using project context: ${dbMd.path}`);

      // Streaming path (default)
      if (opts.stream !== false) {
        ui.blank();
        try {
          process.stdout.write(ui.theme.value(""));
          await completeStream(question, {
            system,
            model: opts.model,
            maxTokens: parseInt(opts.maxTokens, 10) || 1024,
            onToken: (chunk) => process.stdout.write(chunk),
          });
          ui.blank(); ui.blank();
        } catch (e) {
          ui.error(e?.message || String(e));
          process.exit(1);
        }
        return;
      }

      // Non-streaming path (--no-stream or --json)
      const spinner = new ui.Spinner("Thinking");
      spinner.start();

      try {
        const answer = await completeWithRetry(
          question,
          { system, model: opts.model, maxTokens: parseInt(opts.maxTokens, 10) || 1024 },
          2
        );
        spinner.succeed();

        if (opts.json) {
          ui.printJson({
            question,
            provider: getActiveProvider().id,
            model: opts.model || getActiveModel(),
            context: dbMd ? dbMd.path : null,
            answer,
          });
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

