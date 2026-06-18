// Persistent config + todos storage under ~/.devbuddy/
// Plain JSON files, no external deps.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { APP_DIR, CONFIG_FILE, TODOS_FILE } from "./ui.js";

function ensureDir() {
  if (!existsSync(APP_DIR)) mkdirSync(APP_DIR, { recursive: true });
}

// --- Config (v0.3 schema) ---
const DEFAULT_CONFIG = {
  // Onboarding state
  onboardingComplete: false,
  onboardedAt: null,

  // Active provider + per-provider config
  provider: null,                // 'huggingface' | 'openai' | ... (set during onboard)
  providers: {},                 // { huggingface: { apiKey, model }, openai: { ... }, ... }

  // Output preferences
  language: "en",
  translateTo: "en",
  summarizeStyle: "bullets",

  // Agent
  agentEnabled: false,           // master toggle for agentic mode
  agentMaxSteps: 20,
  agentYolo: false,              // skip confirms (DANGEROUS)

  // Auto-update: 'off' | 'prompt' (default) | 'silent'
  autoUpdate: "prompt",
  lastUpdateCheck: null,

  createdAt: null,
};

// Migration: if a v0.2 config exists, port hfToken/hfModel/hfBaseUrl into
// the new providers map and clear old keys.
function migrateV2ToV3(cfg) {
  if (cfg.hfToken || cfg.hfModel || cfg.hfBaseUrl) {
    if (!cfg.providers) cfg.providers = {};
    if (!cfg.providers.huggingface) cfg.providers.huggingface = {};
    if (cfg.hfToken) {
      cfg.providers.huggingface.apiKey = cfg.hfToken;
      delete cfg.hfToken;
    }
    if (cfg.hfModel) {
      cfg.providers.huggingface.model = cfg.hfModel;
      delete cfg.hfModel;
    }
    if (cfg.hfBaseUrl) {
      // Not exposed in v0.3 UI; keep for backward-compat.
      cfg.providers.huggingface.baseUrl = cfg.hfBaseUrl;
      delete cfg.hfBaseUrl;
    }
    if (!cfg.provider) cfg.provider = "huggingface";
    if (!cfg.onboardingComplete && cfg.providers.huggingface.apiKey) {
      cfg.onboardingComplete = true;
      cfg.onboardedAt = new Date().toISOString();
    }
  }
  return cfg;
}

export function loadConfig() {
  ensureDir();
  if (!existsSync(CONFIG_FILE)) {
    const init = { ...DEFAULT_CONFIG, createdAt: new Date().toISOString() };
    writeFileSync(CONFIG_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf8");
    let parsed = JSON.parse(raw);
    parsed = migrateV2ToV3(parsed);
    return { ...DEFAULT_CONFIG, ...parsed };
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

// --- Provider-scoped setters ---

export function setProviderKey(providerId, apiKey) {
  const cfg = loadConfig();
  if (!cfg.providers) cfg.providers = {};
  if (!cfg.providers[providerId]) cfg.providers[providerId] = {};
  cfg.providers[providerId].apiKey = apiKey;
  saveConfig(cfg);
  return cfg;
}

export function setProviderModel(providerId, model) {
  const cfg = loadConfig();
  if (!cfg.providers) cfg.providers = {};
  if (!cfg.providers[providerId]) cfg.providers[providerId] = {};
  cfg.providers[providerId].model = model;
  saveConfig(cfg);
  return cfg;
}

export function setActiveProvider(providerId) {
  const cfg = loadConfig();
  cfg.provider = providerId;
  saveConfig(cfg);
  return cfg;
}

export function markOnboarded() {
  const cfg = loadConfig();
  cfg.onboardingComplete = true;
  cfg.onboardedAt = new Date().toISOString();
  saveConfig(cfg);
  return cfg;
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
