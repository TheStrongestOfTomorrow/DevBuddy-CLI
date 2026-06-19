// `devbuddy onboard` — interactive setup wizard.
//
// Flow: welcome → pick provider → enter API key → pick model → pick language →
// optional: test connection → mark onboarded.
//
// Until onboarded, all AI commands refuse with a friendly error pointing here.

import { PROVIDERS, PROVIDER_IDS, getProvider, complete } from "../ai/providers.js";
import {
  loadConfig,
  setProviderKey,
  setProviderModel,
  setActiveProvider,
  markOnboarded,
  saveConfig,
} from "../store.js";
import * as ui from "../ui.js";

function prompt(question, defaultValue) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString();
      if (buf.includes("\n")) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        const v = buf.trim();
        resolve(v === "" && defaultValue !== undefined ? defaultValue : v);
      }
    };
    process.stdin.resume();
    process.stdin.once("data", onData);
  });
}

async function pickFromList(title, options, defaultIdx = 0) {
  ui.blank();
  ui.heading(title);
  ui.blank();
  options.forEach((opt, i) => {
    const mark = i === defaultIdx ? ui.theme.ok("→") : ui.theme.muted(" ");
    console.log(`  ${mark} ${ui.theme.value(`${i + 1}`)}. ${opt.label}`);
    if (opt.desc) console.log(`       ${ui.theme.muted(opt.desc)}`);
  });
  ui.blank();
  const ans = await prompt(`  pick [1-${options.length}] (default ${defaultIdx + 1}): `, String(defaultIdx + 1));
  const idx = parseInt(ans, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= options.length) return defaultIdx;
  return idx;
}

// Pick a model from the provider's known list, with an extra "type your own"
// option for users who downloaded a different model or use an unlisted one.
async function pickModel(provider, { indent = "" } = {}) {
  const knownModels = provider.models || [];
  const options = knownModels.map((m) => ({ label: m }));
  // Append the "custom" option
  options.push({
    label: ui.theme.accent("✎  Type your own model ID…"),
    desc: ui.theme.muted("for models not in the list (e.g. custom Ollama models, fine-tunes)"),
  });
  const defaultIdx = Math.max(0, knownModels.indexOf(provider.defaultModel));
  const idx = await pickFromList(`${indent}Pick a model`, options, defaultIdx);

  if (idx < knownModels.length) {
    return knownModels[idx];
  }

  // Custom model — prompt for it
  ui.blank();
  const custom = await prompt(`${indent}  Enter model ID (e.g. ${knownModels[0] || "llama3.2"}): `);
  if (!custom || !custom.trim()) {
    ui.warn(`${indent}  no model entered — using default: ${provider.defaultModel}`);
    return provider.defaultModel;
  }
  return custom.trim();
}

export function register(program) {
  program
    .command("onboard")
    .description("Interactive setup wizard. Required before using AI commands.")
    .option("--force", "Re-run onboarding even if already complete.")
    .option("--skip-test", "Skip the connection test at the end.")
    .action(async (opts) => {
      const cfg = loadConfig();
      if (cfg.onboardingComplete && !opts.force) {
        ui.title("devbuddy onboard");
        ui.blank();
        ui.ok(`Already onboarded (provider: ${cfg.provider || "?"}, since ${cfg.onboardedAt || "?"}).`);
        ui.muted("  re-run with --force to start over.");
        return;
      }

      ui.blank();
      ui.title("welcome to devbuddy");
      ui.blank();
      console.log(
        ui.theme.muted(
          "  Let's get you set up. This takes ~1 minute.\n" +
          "  You can re-run this any time with `devbuddy onboard --force`."
        )
      );

      // --- Step 1: pick provider ---
      const providerOptions = PROVIDER_IDS.map((id) => {
        const p = PROVIDERS[id];
        return {
          label: `${p.name}${p.free ? " (free)" : ""}`,
          desc: p.notes,
        };
      });
      const providerIdx = await pickFromList(
        "Step 1: pick your AI provider",
        providerOptions,
        0
      );
      const providerId = PROVIDER_IDS[providerIdx];
      const provider = PROVIDERS[providerId];
      setActiveProvider(providerId);

      ui.blank();
      ui.heading(`Step 2: ${provider.name} API key`);
      ui.muted(`  ${provider.notes}`);
      ui.muted(`  Sign up: ${provider.signupUrl}`);
      ui.muted(`  Get a key: ${provider.getKeyUrl}`);
      ui.blank();

      let apiKey;
      if (providerId === "ollama") {
        apiKey = "ollama";
        ui.ok("  Ollama needs no API key — using placeholder.");
      } else {
        apiKey = await prompt(`  Paste your ${provider.name} API key: `);
        if (!apiKey) {
          ui.error("No key entered. Aborting.");
          process.exit(1);
        }
        apiKey = apiKey.trim();
      }
      setProviderKey(providerId, apiKey);

      // --- Step 3: pick model (with custom option) ---
      const model = await pickModel(provider);
      setProviderModel(providerId, model);

      // --- Step 3b: multi-key loop — add more providers? ---
      ui.blank();
      ui.heading("Step 3b: add more providers? (optional)");
      ui.muted("  You can add more API keys now to switch between providers later.");
      ui.muted("  Useful for using a free provider for chat and a paid one for the agent.");
      ui.blank();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const more = await prompt("  Add another provider? [y/N] ", "n");
        if (!/^\s*y(es)?\s*$/i.test(more)) break;

        // Pick another provider (exclude ones already configured with a key)
        const cfg2 = loadConfig();
        const remaining = PROVIDER_IDS.filter((id) => id !== providerId && !cfg2.providers?.[id]?.apiKey);
        if (remaining.length === 0) {
          ui.muted("  All providers are configured. Moving on.");
          break;
        }
        const moreOptions = remaining.map((id) => {
          const p = PROVIDERS[id];
          return { label: `${p.name}${p.free ? " (free)" : ""}`, desc: p.notes };
        });
        const moreIdx = await pickFromList("  Pick provider to add", moreOptions, 0);
        const moreId = remaining[moreIdx];
        const moreProvider = PROVIDERS[moreId];

        ui.muted(`    ${moreProvider.notes}`);
        ui.muted(`    Sign up: ${moreProvider.signupUrl}`);
        ui.muted(`    Get a key: ${moreProvider.getKeyUrl}`);
        let moreKey;
        if (moreId === "ollama") {
          moreKey = "ollama";
          ui.ok("    Ollama needs no key.");
        } else {
          moreKey = await prompt(`    Paste ${moreProvider.name} API key: `);
          if (!moreKey) { ui.warn("    skipped."); continue; }
          moreKey = moreKey.trim();
        }
        setProviderKey(moreId, moreKey);

        // Pick model for this provider (with custom option)
        const moreModel = await pickModel(moreProvider, { indent: "    " });
        setProviderModel(moreId, moreModel);
        ui.ok(`    ${moreProvider.name} configured.`);
      }

      // --- Step 4: language ---
      const langOptions = [
        { label: "English", desc: "default" },
        { label: "Chinese (中文)", desc: "" },
        { label: "Spanish", desc: "" },
        { label: "French", desc: "" },
        { label: "Japanese (日本語)", desc: "" },
        { label: "Hindi (हिन्दी)", desc: "" },
      ];
      const langIdx = await pickFromList("Step 4: output language", langOptions, 0);
      const langs = ["en", "zh", "es", "fr", "ja", "hi"];
      const lang = langs[langIdx];
      const c = loadConfig();
      c.language = lang;
      c.translateTo = lang;
      saveConfig(c);

      // --- Step 5: auto-update preference ---
      const updateOptions = [
        { label: "Prompt me before updating", desc: "default — checks on launch, asks Y/n" },
        { label: "Silent auto-update", desc: "updates without asking" },
        { label: "Off", desc: "never check" },
      ];
      const updateIdx = await pickFromList("Step 5: auto-update preference", updateOptions, 0);
      const updateModes = ["prompt", "silent", "off"];
      const cc = loadConfig();
      cc.autoUpdate = updateModes[updateIdx];
      saveConfig(cc);

      // --- Step 6: test connection ---
      ui.blank();
      ui.heading("Step 6: test connection");
      if (opts.skipTest) {
        ui.muted("  skipped (--skip-test).");
      } else if (providerId === "ollama") {
        ui.warn("  skipping test for Ollama (need to verify locally).");
        ui.muted("  make sure ollama is running: `ollama serve`");
      } else {
        const doTest = await prompt("  Test the connection now? [Y/n] ", "y");
        if (doTest === "" || /^y/i.test(doTest)) {
          const spinner = new ui.Spinner("Testing");
          spinner.start();
          try {
            const reply = await complete("Reply with just: OK", {
              maxTokens: 8,
              temperature: 0,
            });
            spinner.succeed(`connection OK — model replied: "${reply.slice(0, 40)}"`);
          } catch (e) {
            spinner.fail();
            ui.warn(`  test failed: ${e.message}`);
            ui.muted("  your settings are still saved. fix the issue and re-run `devbuddy onboard --force`.");
          }
        } else {
          ui.muted("  skipped.");
        }
      }

      // --- Done ---
      markOnboarded();
      ui.blank();
      ui.title("you're all set.");
      ui.blank();
      ui.bullet(`Provider: ${ui.theme.value(provider.name)}`);
      ui.bullet(`Model: ${ui.theme.value(model)}`);
      ui.bullet(`Language: ${ui.theme.value(lang)}`);
      ui.bullet(`Auto-update: ${ui.theme.value(loadConfig().autoUpdate)}`);
      ui.blank();
      ui.heading("try it now");
      ui.muted("  devbuddy ask \"what is a closure in JS?\"");
      ui.muted("  devbuddy summarize ./README.md");
      ui.muted("  devbuddy explain ./src/index.js");
      ui.muted("  devbuddy agent \"add a hello world route to my app\"");
      ui.blank();
    });
}
