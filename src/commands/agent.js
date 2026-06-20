// `devbuddy agent` — agentic harness for code generation/editing.

import { runAgent } from "../agent/core.js";
import { isOnboarded, getActiveProvider, getActiveModel } from "../ai/providers.js";
import { loadConfig, saveConfig } from "../store.js";
import * as ui from "../ui.js";

export function register(program) {
  const agent = program.command("agent").description("Agentic harness for code tasks. Toggle + run.");

  agent
    .command("run <task...>")
    .description("Run the agent on a task. Requires agent mode enabled.")
    .option("--yolo", "Skip all confirmations (DANGEROUS).")
    .option("--max-steps <n>", "Max tool-call steps.", "20")
    .option("-m, --model <name>", "Override the active model for this run.")
    .option("--plan", "Planner mode: agent writes a plan first, then executes step by step.")
    .option("--allow <dir>", "Grant access to an additional directory. Repeatable.", (val, acc) => { (acc || []).push(val); return acc; }, [])
    .option("--phone", "Enable phone control tools (requires `devbuddy phone enable` + Ollama).")
    .action(async (taskParts, opts) => {
      if (!isOnboarded()) {
        ui.error(onboardingRequiredMessage());
        process.exit(1);
      }
      const cfg = loadConfig();
      if (!cfg.agentEnabled) {
        ui.error(
          "Agent mode is currently OFF.\n" +
          "  Enable with: devbuddy agent toggle\n" +
          "  (or)         devbuddy config set agentEnabled true"
        );
        process.exit(1);
      }

      const task = taskParts.join(" ").trim();
      if (!task) {
        ui.error("task is required");
        process.exit(1);
      }

      const p = getActiveProvider();
      ui.muted(`provider: ${p.name}  |  model: ${opts.model || getActiveModel()}`);
      if (opts.plan) ui.muted(`mode: planner`);
      if (opts.allow && opts.allow.length) {
        ui.muted(`extra allowed roots:`);
        for (const r of opts.allow) ui.muted(`  - ${r}`);
      }
      ui.blank();

      try {
        await runAgent(task, {
          yolo: opts.yolo || cfg.agentYolo,
          maxSteps: parseInt(opts.maxSteps, 10) || cfg.agentMaxSteps || 20,
          model: opts.model,
          plan: !!opts.plan,
          allow: opts.allow || [],
          phone: !!opts.phone,
        });
      } catch (e) {
        ui.error(e?.message || String(e));
        process.exit(1);
      }
    });

  agent
    .command("toggle")
    .description("Enable or disable agent mode.")
    .option("--on", "Force enable.")
    .option("--off", "Force disable.")
    .action((opts) => {
      const cfg = loadConfig();
      let next;
      if (opts.on) next = true;
      else if (opts.off) next = false;
      else next = !cfg.agentEnabled;
      cfg.agentEnabled = next;
      saveConfig(cfg);
      if (next) {
        ui.ok("agent mode ENABLED.");
        ui.blank();
        ui.muted("  Run with: devbuddy agent run \"<your task>\"");
        ui.muted("  The agent can read, write, and edit files in this directory.");
        ui.muted("  Grant more dirs with: devbuddy agent run --allow <dir> \"<task>\"");
        if (!cfg.agentYolo) {
          ui.muted("  Mutating actions will prompt for confirmation.");
          ui.muted("  Skip prompts with --yolo (DANGEROUS) or `devbuddy config set agentYolo true`.");
        }
      } else {
        ui.ok("agent mode DISABLED.");
      }
    });

  agent
    .command("status")
    .description("Show current agent configuration.")
    .action(() => {
      const cfg = loadConfig();
      ui.title("devbuddy agent status");
      ui.blank();
      ui.kv("enabled", cfg.agentEnabled ? ui.theme.ok("yes") : "no");
      ui.kv("yolo (skip confirms)", cfg.agentYolo ? ui.theme.err("yes (DANGEROUS)") : "no");
      ui.kv("max-steps", cfg.agentMaxSteps || 20);
      ui.kv("default scope", "current working directory + any --allow flags");
      ui.blank();
      ui.muted("  toggle: devbuddy agent toggle");
      ui.muted("  run:    devbuddy agent run \"<task>\"");
      ui.muted("  plan:   devbuddy agent run --plan \"<task>\"");
      ui.muted("  allow:  devbuddy agent run --allow ../other-project \"<task>\"");
    });

  agent.action(() => {
    const cfg = loadConfig();
    ui.title("devbuddy agent");
    ui.blank();
    ui.kv("enabled", cfg.agentEnabled ? ui.theme.ok("yes") : "no");
    ui.kv("yolo", cfg.agentYolo ? ui.theme.err("yes (DANGEROUS)") : "no");
    ui.kv("max-steps", cfg.agentMaxSteps || 20);
    ui.blank();
    ui.muted("  Subcommands: run | toggle | status");
    ui.muted("  Quick start: devbuddy agent toggle && devbuddy agent run \"<task>\"");
    ui.muted("  With plan:   devbuddy agent run --plan \"<complex task>\"");
    ui.muted("  Multi-dir:   devbuddy agent run --allow ../shared \"<task>\"");
  });
}

export function onboardingRequiredMessage() {
  return (
    "DevBuddy is not onboarded yet.\n" +
    "  Run: devbuddy onboard\n" +
    "  (one-time setup, ~1 minute)"
  );
}
