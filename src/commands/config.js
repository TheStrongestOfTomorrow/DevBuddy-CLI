// `devbuddy config` — persistent settings stored at ~/.devbuddy/config.json

import { loadConfig, setConfigKey, getConfigKey, saveConfig } from "../store.js";
import { PROVIDERS, PROVIDER_IDS, getActiveProviderId } from "../ai/providers.js";
import * as ui from "../ui.js";

const KNOWN_KEYS = [
  ["provider",        "Active provider ID. One of: " + PROVIDER_IDS.join(", ")],
  ["language",        "Preferred output language for ask/explain/translate (e.g. 'en', 'zh')."],
  ["translateTo",     "Default target language for `devbuddy translate`."],
  ["summarizeStyle",  "bullets | paragraphs | tldr."],
  ["agentEnabled",    "true/false — master toggle for agentic mode."],
  ["agentYolo",       "true/false — skip agent confirmations (DANGEROUS)."],
  ["agentMaxSteps",   "Max tool-call steps per agent run (default 20)."],
  ["autoUpdate",      "off | prompt | silent (default: prompt)."],
  ["onboardingComplete", "true/false — whether onboarding has been completed."],
];

function maskValue(k, v) {
  if (typeof v === "string" && v.length > 8 && /token|key/i.test(k)) {
    return `"${v.slice(0,4)}…${v.slice(-4)}"`;
  }
  return JSON.stringify(v);
}

export function register(program) {
  const cfg = program.command("config").description("View and edit persistent settings.");

  cfg
    .command("list")
    .description("Show all config values.")
    .action(() => {
      const c = loadConfig();
      ui.title("devbuddy config");
      ui.blank();
      for (const [k, desc] of KNOWN_KEYS) {
        ui.kv(k, maskValue(k, c[k]));
        ui.muted("    " + desc);
      }
      ui.blank();
      ui.muted(`  stored at: ${ui.CONFIG_FILE}`);
    });

  cfg
    .command("get <key>")
    .description("Get a single config value.")
    .action((key) => {
      const v = getConfigKey(key);
      if (v === undefined) { ui.error(`unknown key '${key}'`); process.exit(1); }
      console.log(typeof v === "string" ? v : JSON.stringify(v));
    });

  cfg
    .command("set <key> <value>")
    .description("Set a config value. Booleans/numbers are auto-cast.")
    .action((key, value) => {
      const known = KNOWN_KEYS.find(([k]) => k === key);
      if (!known) ui.warn(`'${key}' is not a known key — setting anyway.`);

      // Special-case provider switching to also validate.
      if (key === "provider") {
        if (!PROVIDERS[value]) {
          ui.error(`unknown provider '${value}'. valid: ${PROVIDER_IDS.join(", ")}`);
          process.exit(1);
        }
      }

      const after = setConfigKey(key, value);
      ui.ok(`${key} = ${JSON.stringify(after[key])}`);

      // Helpful follow-up messages
      if (key === "provider") {
        ui.muted(`  switched to ${value}. set its key with: devbuddy auth set <key>`);
      }
      if (key === "agentEnabled" && after[key] === true) {
        ui.muted("  now run: devbuddy agent run \"<task>\"");
      }
    });

  cfg
    .command("reset")
    .description("Reset all config to defaults (also clears all keys).")
    .action(() => {
      saveConfig({
        onboardingComplete: false,
        onboardedAt: null,
        provider: null,
        providers: {},
        language: "en",
        translateTo: "en",
        summarizeStyle: "bullets",
        agentEnabled: false,
        agentMaxSteps: 20,
        agentYolo: false,
        autoUpdate: "prompt",
        lastUpdateCheck: null,
        createdAt: new Date().toISOString(),
      });
      ui.ok("config reset. run `devbuddy onboard` to set up again.");
    });

  cfg.action(() => {
    const c = loadConfig();
    ui.title("devbuddy config");
    ui.blank();
    for (const [k, desc] of KNOWN_KEYS) {
      ui.kv(k, maskValue(k, c[k]));
      ui.muted("    " + desc);
    }
    ui.blank();
    ui.muted(`  stored at: ${ui.CONFIG_FILE}`);
  });
}
