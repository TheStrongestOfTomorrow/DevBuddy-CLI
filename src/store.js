// Persistent config + todos storage under ~/.devbuddy/
// Plain JSON files, no external deps.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { APP_DIR, CONFIG_FILE, TODOS_FILE } from "./ui.js";

function ensureDir() {
  if (!existsSync(APP_DIR)) mkdirSync(APP_DIR, { recursive: true });
}

// --- Config ---
const DEFAULT_CONFIG = {
  // HuggingFace settings (new in v0.2.0)
  hfToken: "",              // user's HF access token (set via `devbuddy auth set`)
  hfBaseUrl: "https://router.huggingface.co/v1",
  hfModel: "mistralai/Mistral-7B-Instruct-v0.3",

  // Output preferences (carryover from v0.1.0)
  language: "en",           // preferred output language for ask/explain/translate
  translateTo: "en",        // default target language for `translate`
  summarizeStyle: "bullets",// bullets | paragraphs | tldr
  createdAt: null,
};

export function loadConfig() {
  ensureDir();
  if (!existsSync(CONFIG_FILE)) {
    const init = { ...DEFAULT_CONFIG, createdAt: new Date().toISOString() };
    writeFileSync(CONFIG_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg) {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

export function setConfigKey(key, value) {
  const cfg = loadConfig();
  // Cast booleans / numbers from string form for convenience.
  if (value === "true") value = true;
  else if (value === "false") value = false;
  else if (/^-?\d+$/.test(value)) value = Number(value);
  cfg[key] = value;
  saveConfig(cfg);
  return cfg;
}

export function getConfigKey(key) {
  const cfg = loadConfig();
  return key in cfg ? cfg[key] : undefined;
}

// --- Todos ---
export function loadTodos() {
  ensureDir();
  if (!existsSync(TODOS_FILE)) return [];
  try {
    const raw = readFileSync(TODOS_FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveTodos(todos) {
  ensureDir();
  writeFileSync(TODOS_FILE, JSON.stringify(todos, null, 2));
}
