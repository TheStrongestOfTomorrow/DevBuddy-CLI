// `devbuddy config` — persistent settings stored at ~/.devbuddy/config.json

import { loadConfig, setConfigKey, getConfigKey, saveConfig } from "../store.js";
import * as ui from "../ui.js";

const KNOWN_KEYS = [
  ["hfToken",        "HuggingFace access token. Set via `devbuddy auth set`."],
  ["hfModel",        "HuggingFace chat model (default: mistralai/Mistral-7B-Instruct-v0.3)."],
  ["hfBaseUrl",      "HuggingFace API base URL. Default: https://router.huggingface.co/v1"],
  ["language",       "Preferred output language for ask/explain/translate (e.g. 'en', 'zh')."],
  ["translateTo",    "Default target language for `devbuddy translate`."],
  ["summarizeStyle", "bullets | paragraphs | tldr."],
];

function maskValue(k, v) {
  if (k === "hfToken" && v) {
    return v.length > 8 ? `"${v.slice(0,4)}…${v.slice(-4)}"` : "\"****\"";
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
      if (v === undefined) {
        ui.error(`unknown key '${key}'`);
        process.exit(1);
      }
      // Don't print raw token to stdout for safety.
      if (key === "hfToken") {
        console.log(maskValue(key, v));
        return;
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
      if (key === "hfToken") {
        ui.warn("Use `devbuddy auth set <token>` instead — it also verifies the token.");
        return;
      }
      const after = setConfigKey(key, value);
      ui.ok(`${key} = ${JSON.stringify(after[key])}`);
    });

  cfg
    .command("reset")
    .description("Reset all config to defaults (also clears your token).")
    .action(() => {
      saveConfig({
        hfToken: "",
        hfBaseUrl: "https://router.huggingface.co/v1",
        hfModel: "mistralai/Mistral-7B-Instruct-v0.3",
        language: "en",
        translateTo: "en",
        summarizeStyle: "bullets",
        createdAt: new Date().toISOString(),
      });
      ui.ok("config reset to defaults.");
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
