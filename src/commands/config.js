// `devbuddy config` — persistent settings stored at ~/.devbuddy/config.json

import { loadConfig, setConfigKey, getConfigKey, saveConfig } from "../store.js";
import { PROVIDERS, PROVIDER_IDS, getActiveProviderId } from "../ai/providers.js";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import * as ui from "../ui.js";

const KNOWN_KEYS = [
  ["provider",        "Active provider ID. One of: " + PROVIDER_IDS.join(", ")],
  ["language",        "Preferred output language for ask/explain/translate (e.g. 'en', 'zh')."],
  ["translateTo",     "Default target language for `devbuddy translate`."],
  ["summarizeStyle",  "bullets | paragraphs | tldr."],
  ["theme",           "dark | light | auto (default: dark)."],
  ["stream",          "true/false — stream AI responses (default: true)."],
  ["agentEnabled",    "true/false — master toggle for agentic mode."],
  ["agentYolo",       "true/false — skip agent confirmations (DANGEROUS)."],
  ["agentMaxSteps",   "Max tool-call steps per agent run (default 20)."],
  ["autoUpdate",      "off | prompt | silent (default: prompt)."],
  ["experimentalRemoteAI", "true/false — enable experimental remote-AI (SSH/Claude). ⚠️"],
  ["experimentalActAsMcp", "true/false — enable experimental act-as-MCP server. ⚠️"],
  ["experimentalCommandGuard", "true/false — enable dry-run preview command execution. ⚠️"],
  ["experimentalCustomEndpoints", "true/false — enable custom raw endpoint overrides. ⚠️"],
  ["onboardingComplete", "true/false — whether onboarding has been completed."],
];

function maskValue(k, v) {
  if (typeof v === "string" && v.length > 8 && /token|key/i.test(k)) {
    return `"${v.slice(0,4)}…${v.slice(-4)}"`;
  }
  return JSON.stringify(v);
}

export function register(program) {
  const cfg = program.command("config").description("View, edit, export, and import persistent settings.");

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
    .command("export [filepath]")
    .description("Export current configuration to a JSON file.")
    .action((filepath) => {
      const target = filepath || "devbuddy-config-backup.json";
      const c = loadConfig();
      writeFileSync(target, JSON.stringify(c, null, 2), "utf8");
      ui.ok(`Configuration exported to: ${target}`);
    });

  cfg
    .command("import <filepath>")
    .description("Import configuration from a JSON file.")
    .action((filepath) => {
      if (!existsSync(filepath)) {
        ui.error(`File '${filepath}' does not exist.`);
        process.exit(1);
      }
      try {
        const raw = readFileSync(filepath, "utf8");
        const parsed = JSON.parse(raw);
        saveConfig(parsed);
        ui.ok(`Configuration imported successfully from '${filepath}'.`);
      } catch (e) {
        ui.error(`Failed to import configuration: ${e.message}`);
        process.exit(1);
      }
    });

  cfg
    .command("set <key> <value>")
    .description("Set a config value. Booleans/numbers are auto-cast.")
    .action((key, value) => {
      const known = KNOWN_KEYS.find(([k]) => k === key);
      if (!known) ui.warn(`'${key}' is not a known key — setting anyway.`);

      if (key === "provider") {
        if (!PROVIDERS[value]) {
          ui.error(`unknown provider '${value}'. valid: ${PROVIDER_IDS.join(", ")}`);
          process.exit(1);
        }
      }

      const ENUM_VALUES = {
        theme: ["dark", "light", "auto"],
        autoUpdate: ["off", "prompt", "silent"],
        summarizeStyle: ["bullets", "paragraphs", "tldr"],
      };
      if (ENUM_VALUES[key]) {
        if (!ENUM_VALUES[key].includes(value)) {
          ui.error(`invalid value for '${key}': '${value}'. valid: ${ENUM_VALUES[key].join(" | ")}`);
          process.exit(1);
        }
      }

      const BOOLEAN_KEYS = [
        "stream", "agentEnabled", "agentYolo",
        "experimentalRemoteAI", "experimentalActAsMcp",
        "experimentalCommandGuard", "experimentalCustomEndpoints",
        "onboardingComplete",
      ];
      if (BOOLEAN_KEYS.includes(key) && value !== "true" && value !== "false") {
        ui.error(`'${key}' is a boolean — use 'devbuddy config set ${key} true' or 'false'.`);
        process.exit(1);
      }

      if (key === "agentMaxSteps") {
        const num = Number(value);
        if (!(Number.isInteger(num) && num > 0)) {
          ui.error(`'agentMaxSteps' must be a positive integer (e.g. 'devbuddy config set agentMaxSteps 20').`);
          process.exit(1);
        }
      }

      const after = setConfigKey(key, value);
      ui.ok(`${key} = ${JSON.stringify(after[key])}`);

      if (key === "provider") {
        if (value === "ollama") {
          ui.muted("  switched to ollama — runs locally, no API key needed.");
        } else {
          ui.muted(`  switched to ${value}. set its key with: devbuddy auth set <key>`);
          const stored = after.providers && after.providers[value] && after.providers[value].apiKey;
          const envVar = PROVIDERS[value] && PROVIDERS[value].envVar;
          const envKey = envVar ? process.env[envVar] : "";
          if (!stored && !envKey) {
            ui.warn(`  ${PROVIDERS[value].name} has no API key yet — AI commands will fail until you add one:`);
            ui.warn(`  devbuddy auth set <key>    (or)    devbuddy auth add ${value} <key>`);
          }
        }
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
        customProviders: {},
        namedKeys: {},
        activeKeyName: null,
        language: "en",
        translateTo: "en",
        summarizeStyle: "bullets",
        theme: "dark",
        agentEnabled: false,
        agentMaxSteps: 20,
        agentYolo: false,
        stream: true,
        autoUpdate: "prompt",
        lastUpdateCheck: null,
        experimentalRemoteAI: false,
        experimentalActAsMcp: false,
        experimentalCommandGuard: false,
        experimentalCustomEndpoints: false,
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
