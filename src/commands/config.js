// `devbuddy config` — persistent settings stored at ~/.devbuddy/config.json

import { loadConfig, setConfigKey, getConfigKey, saveConfig } from "../store.js";
import * as ui from "../ui.js";

const KNOWN_KEYS = [
  ["language",      "Preferred output language for ask/explain/translate (e.g. 'en', 'zh')."],
  ["translateTo",   "Default target language for `devbuddy translate`."],
  ["summarizeStyle","bullets | paragraphs | tldr."],
  ["model",         "Informational only (SDK picks the default model)."],
];

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
        ui.kv(k, JSON.stringify(c[k]));
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
      if (v === undefined) {
        ui.error(`unknown key '${key}'`);
        process.exit(1);
      }
      console.log(typeof v === "string" ? v : JSON.stringify(v));
    });

  cfg
    .command("set <key> <value>")
    .description("Set a config value. Booleans/numbers are auto-cast.")
    .action((key, value) => {
      const known = KNOWN_KEYS.find(([k]) => k === key);
      if (!known) {
        ui.warn(`'${key}' is not a known key — setting anyway.`);
      }
      const after = setConfigKey(key, value);
      ui.ok(`${key} = ${JSON.stringify(after[key])}`);
    });

  cfg
    .command("reset")
    .description("Reset all config to defaults.")
    .action(() => {
      saveConfig({ language: "en", translateTo: "en", summarizeStyle: "bullets", model: "default", createdAt: new Date().toISOString() });
      ui.ok("config reset to defaults.");
    });

  cfg.action(() => {
    // `devbuddy config` with no subcommand -> list
    const c = loadConfig();
    ui.title("devbuddy config");
    ui.blank();
    for (const [k, desc] of KNOWN_KEYS) {
      ui.kv(k, JSON.stringify(c[k]));
      ui.muted("    " + desc);
    }
    ui.blank();
    ui.muted(`  stored at: ${ui.CONFIG_FILE}`);
  });
}
